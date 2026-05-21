import { prisma } from "@/lib/prisma";
import { hasOrderDeliveryOrderColumn } from "@/lib/order-delivery-order";
import { mapApiStatusToDb, mapDbStatusToApi } from "@/lib/order-status";
import { calculateBulkLineTotal, getEffectiveUnitPrice } from "@/lib/bulk-pricing";
import { z } from "zod";

export const dynamic = "force-dynamic";

const GRAMS_PER_STAR = 250;

const createOrderSchema = z.object({
  customer: z.object({
    name: z.string().trim().min(1, "Nome do cliente e obrigatorio."),
    phone: z.string().trim().min(8, "Telefone invalido.").max(20, "Telefone invalido."),
  }),
  items: z
    .array(
      z.object({
        productId: z.string().trim().min(1, "Produto e obrigatorio."),
        quantity: z.number().int("Quantidade deve ser um numero inteiro.").positive("Quantidade deve ser maior que zero."),
      }),
    )
    .min(1, "O pedido deve ter ao menos um item."),
  deliveryMethod: z.enum(["DELIVERY", "PICKUP"]),
  paymentMethod: z.enum(["PIX", "CASH"]),
  couponCode: z.string().trim().toUpperCase().optional(),
  desiredDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Data desejada invalida.").optional(),
  zipCode: z.string().trim().max(12, "CEP invalido.").optional(),
  street: z.string().trim().max(120, "Rua invalida.").optional(),
  neighborhood: z.string().trim().max(120, "Bairro invalido.").optional(),
  city: z.string().trim().max(120, "Cidade invalida.").optional(),
  state: z.string().trim().max(2, "Estado invalido.").optional(),
  addressNumber: z.string().trim().max(20, "Numero invalido.").optional(),
  addressComplement: z.string().trim().max(120, "Complemento invalido.").optional(),
  notes: z.string().trim().max(500, "Observacao muito longa.").optional(),
});

type CreateOrderInput = z.infer<typeof createOrderSchema>;

type DecimalLike = {
  toNumber: () => number;
  toString: () => string;
};

type ProductRecord = {
  id: string;
  name: string;
  price: DecimalLike;
  active: boolean;
  stockQuantity: number;
  bulkMinQty: number | null;
  bulkPrice: DecimalLike | null;
  gramWeight: number | null;
};

type CustomerRecord = { id: string; name: string; phone: string };

type CouponRecord = {
  id: string;
  type: "PERCENTAGE" | "FIXED";
  value: DecimalLike;
  active: boolean;
  maxUsage: number | null;
  usageCount: number;
  expiresAt: Date | null;
};

function buildOrderSelect(includeDeliveryOrder: boolean) {
  return {
    id: true,
    status: true,
    deliveryMethod: true,
    ...(includeDeliveryOrder ? { deliveryOrder: true } : {}),
    paymentMethod: true,
    paymentStatus: true,
    paidAt: true,
    paymentReceiptNote: true,
    totalPrice: true,
    deliveryFee: true,
    couponDiscount: true,
    isFirstOrder: true,
    desiredDate: true,
    zipCode: true,
    street: true,
    neighborhood: true,
    city: true,
    state: true,
    addressNumber: true,
    addressComplement: true,
    notes: true,
    createdAt: true,
    customer: { select: { id: true, name: true, phone: true } },
    items: {
      select: {
        id: true,
        productId: true,
        quantity: true,
        price: true,
        product: { select: { id: true, name: true } },
      },
    },
  };
}

function getDeliveryOrderValue(order: { deliveryOrder?: number | null }, includeDeliveryOrder: boolean) {
  return includeDeliveryOrder ? (order.deliveryOrder ?? null) : null;
}

type CreatedOrder = {
  id: string; status: string; deliveryMethod: "DELIVERY" | "PICKUP";
  deliveryOrder?: number | null; paymentMethod: "PIX" | "CASH";
  paymentStatus: "PENDING" | "CONFIRMED" | "FAILED" | "EXPIRED";
  paidAt?: Date | null; paymentReceiptNote?: string | null;
  totalPrice: DecimalLike; deliveryFee?: DecimalLike | null;
  couponDiscount?: DecimalLike | null; isFirstOrder: boolean;
  desiredDate?: string | null; zipCode?: string | null; street?: string | null;
  neighborhood?: string | null; city?: string | null; state?: string | null;
  addressNumber?: string | null; addressComplement?: string | null; notes?: string | null;
  createdAt: Date;
  customer: { id: string; name: string; phone: string };
  items: Array<{ id: string; productId: string; quantity: number; price: DecimalLike; product: { id: string; name: string } }>;
};

class BadRequestError extends Error {
  constructor(message: string) { super(message); this.name = "BadRequestError"; }
}

function normalizeItems(items: CreateOrderInput["items"]) {
  const map = new Map<string, number>();
  for (const item of items) {
    map.set(item.productId, (map.get(item.productId) ?? 0) + item.quantity);
  }
  return Array.from(map, ([productId, quantity]) => ({ productId, quantity }));
}

function getOptionalString(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function applyCoupon(subtotal: number, coupon: CouponRecord): number {
  const value = coupon.value.toNumber();
  if (coupon.type === "PERCENTAGE") {
    return Math.min(subtotal, (subtotal * value) / 100);
  }
  return Math.min(subtotal, value);
}

export async function POST(request: Request) {
  try {
    const includeDeliveryOrder = await hasOrderDeliveryOrderColumn();
    const body = await request.json();
    const parsedBody = createOrderSchema.safeParse(body);

    if (!parsedBody.success) {
      return Response.json({ error: "Dados invalidos.", details: parsedBody.error.flatten() }, { status: 400 });
    }

    if (
      parsedBody.data.deliveryMethod === "DELIVERY" &&
      (!getOptionalString(parsedBody.data.zipCode) ||
        !getOptionalString(parsedBody.data.street) ||
        !getOptionalString(parsedBody.data.neighborhood) ||
        !getOptionalString(parsedBody.data.city) ||
        !getOptionalString(parsedBody.data.state) ||
        !getOptionalString(parsedBody.data.addressNumber))
    ) {
      return Response.json({ error: "Preencha o endereco completo para entrega." }, { status: 400 });
    }

    const normalizedItems = normalizeItems(parsedBody.data.items);
    const productIds = normalizedItems.map((item) => item.productId);

    const order = await prisma.$transaction(async (tx: typeof prisma) => {
      const [existingCustomer, products, deliveryFeeSetting, couponRecord] = await Promise.all([
        tx.customer.findFirst({ where: { phone: parsedBody.data.customer.phone } }),
        tx.product.findMany({ where: { id: { in: productIds } } }),
        tx.appSetting.findUnique({ where: { key: "deliveryFee" } }),
        parsedBody.data.couponCode
          ? tx.coupon.findUnique({ where: { code: parsedBody.data.couponCode } })
          : Promise.resolve(null),
      ]) as [CustomerRecord | null, ProductRecord[], { value: string } | null, CouponRecord | null];

      // Validate coupon if provided
      if (parsedBody.data.couponCode && !couponRecord) {
        throw new BadRequestError("Cupom nao encontrado.");
      }
      if (couponRecord) {
        if (!couponRecord.active) throw new BadRequestError("Cupom inativo.");
        if (couponRecord.maxUsage !== null && couponRecord.usageCount >= couponRecord.maxUsage) {
          throw new BadRequestError("Cupom ja atingiu o limite de uso.");
        }
        if (couponRecord.expiresAt && couponRecord.expiresAt < new Date()) {
          throw new BadRequestError("Cupom expirado.");
        }
      }

      const isFirstOrder = existingCustomer === null;

      const customer = existingCustomer
        ? ((await tx.customer.update({ where: { id: existingCustomer.id }, data: { name: parsedBody.data.customer.name } })) as CustomerRecord)
        : ((await tx.customer.create({ data: { name: parsedBody.data.customer.name, phone: parsedBody.data.customer.phone } })) as CustomerRecord);

      if (products.length !== productIds.length) {
        const foundIds = new Set(products.map((p) => p.id));
        const missing = productIds.filter((id) => !foundIds.has(id));
        throw new BadRequestError(`Produtos nao encontrados: ${missing.join(", ")}`);
      }

      const productsById = new Map(products.map((p) => [p.id, p] as const));

      const orderItems = normalizedItems.map((item) => {
        const product = productsById.get(item.productId);
        if (!product) throw new Error(`Produto nao encontrado: ${item.productId}`);
        if (!product.active) throw new BadRequestError(`${product.name} nao esta disponivel no momento.`);

        const unitPrice = product.price.toNumber();
        const rule = { bulkMinQty: product.bulkMinQty, bulkPrice: product.bulkPrice?.toNumber() ?? null };
        const lineTotal = calculateBulkLineTotal(unitPrice, item.quantity, rule);
        const effectiveUnitPrice = getEffectiveUnitPrice(unitPrice, item.quantity, rule);

        return {
          productId: product.id,
          productName: product.name,
          quantity: item.quantity,
          effectiveUnitPrice,
          stockQuantity: product.stockQuantity,
          lineTotal,
          gramWeight: product.gramWeight,
        };
      });

      const itemsSubtotal = orderItems.reduce((t, i) => t + i.lineTotal, 0);

      // Delivery fee
      const deliveryFee =
        parsedBody.data.deliveryMethod === "DELIVERY" && deliveryFeeSetting
          ? parseFloat(deliveryFeeSetting.value) || 0
          : 0;

      // Coupon discount
      const couponDiscount = couponRecord ? applyCoupon(itemsSubtotal, couponRecord) : 0;

      const totalPrice = Math.max(0, itemsSubtotal + deliveryFee - couponDiscount);

      for (const item of orderItems) {
        if (item.stockQuantity <= 0) continue;
        const updated = await tx.product.updateMany({
          where: { id: item.productId, active: true, stockQuantity: { gt: 0 } },
          data: { stockQuantity: { decrement: Math.min(item.quantity, item.stockQuantity) } },
        });
        if (updated.count === 0) {
          throw new BadRequestError(`O estoque de ${item.productName} mudou enquanto voce finalizava o pedido. Atualize a pagina e tente novamente.`);
        }
      }

      // Increment coupon usage
      if (couponRecord) {
        await tx.coupon.update({ where: { id: couponRecord.id }, data: { usageCount: { increment: 1 } } });
      }

      // Loyalty card: accumulate grams from products that have gramWeight
      const totalGramsThisOrder = orderItems.reduce(
        (acc, item) => acc + (item.gramWeight ? item.gramWeight * item.quantity : 0),
        0,
      );

      type LoyaltyCardRow = { totalGrams: number; stars: number };
      if (totalGramsThisOrder > 0) {
        const existing = (await tx.loyaltyCard.findUnique({ where: { customerId: customer.id } })) as LoyaltyCardRow | null;
        if (existing) {
          const newTotalGrams = existing.totalGrams + totalGramsThisOrder;
          await tx.loyaltyCard.update({
            where: { customerId: customer.id },
            data: {
              totalGrams: newTotalGrams,
              stars: Math.floor(newTotalGrams / GRAMS_PER_STAR),
            },
          });
        } else {
          await tx.loyaltyCard.create({
            data: {
              customerId: customer.id,
              totalGrams: totalGramsThisOrder,
              stars: Math.floor(totalGramsThisOrder / GRAMS_PER_STAR),
            },
          });
        }
      }

      return tx.order.create({
        data: {
          customerId: customer.id,
          status: mapApiStatusToDb("CREATED"),
          deliveryMethod: parsedBody.data.deliveryMethod,
          paymentMethod: parsedBody.data.paymentMethod,
          paymentStatus: "PENDING",
          totalPrice: totalPrice.toFixed(2),
          ...(deliveryFee > 0 ? { deliveryFee: deliveryFee.toFixed(2) } : {}),
          ...(couponRecord ? { couponId: couponRecord.id, couponDiscount: couponDiscount.toFixed(2) } : {}),
          isFirstOrder,
          ...(getOptionalString(parsedBody.data.desiredDate) ? { desiredDate: parsedBody.data.desiredDate } : {}),
          ...(parsedBody.data.deliveryMethod === "DELIVERY" && getOptionalString(parsedBody.data.zipCode) ? { zipCode: parsedBody.data.zipCode } : {}),
          ...(parsedBody.data.deliveryMethod === "DELIVERY" && getOptionalString(parsedBody.data.street) ? { street: parsedBody.data.street } : {}),
          ...(parsedBody.data.deliveryMethod === "DELIVERY" && getOptionalString(parsedBody.data.neighborhood) ? { neighborhood: parsedBody.data.neighborhood } : {}),
          ...(parsedBody.data.deliveryMethod === "DELIVERY" && getOptionalString(parsedBody.data.city) ? { city: parsedBody.data.city } : {}),
          ...(parsedBody.data.deliveryMethod === "DELIVERY" && getOptionalString(parsedBody.data.state) ? { state: parsedBody.data.state } : {}),
          ...(parsedBody.data.deliveryMethod === "DELIVERY" && getOptionalString(parsedBody.data.addressNumber) ? { addressNumber: parsedBody.data.addressNumber } : {}),
          ...(parsedBody.data.deliveryMethod === "DELIVERY" && getOptionalString(parsedBody.data.addressComplement) ? { addressComplement: parsedBody.data.addressComplement } : {}),
          ...(getOptionalString(parsedBody.data.notes) ? { notes: parsedBody.data.notes } : {}),
          items: {
            create: orderItems.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              price: item.effectiveUnitPrice.toFixed(2),
            })),
          },
        },
        select: buildOrderSelect(includeDeliveryOrder),
      }) as Promise<CreatedOrder>;
    });

    return Response.json(
      {
        id: order.id,
        status: mapDbStatusToApi(order.status),
        deliveryMethod: order.deliveryMethod,
        deliveryOrder: getDeliveryOrderValue(order, includeDeliveryOrder),
        paymentMethod: order.paymentMethod,
        payment: {
          status: order.paymentStatus,
          paidAt: order.paidAt ? order.paidAt.toISOString() : null,
          receiptNote: order.paymentReceiptNote ?? null,
        },
        totalPrice: order.totalPrice.toNumber(),
        deliveryFee: order.deliveryFee?.toNumber() ?? 0,
        couponDiscount: order.couponDiscount?.toNumber() ?? 0,
        isFirstOrder: order.isFirstOrder,
        desiredDate: order.desiredDate ?? null,
        zipCode: order.zipCode ?? null,
        street: order.street ?? null,
        neighborhood: order.neighborhood ?? null,
        city: order.city ?? null,
        state: order.state ?? null,
        addressNumber: order.addressNumber ?? null,
        addressComplement: order.addressComplement ?? null,
        notes: order.notes ?? null,
        createdAt: order.createdAt,
        customer: { id: order.customer.id, name: order.customer.name, phone: order.customer.phone },
        items: order.items.map((item: CreatedOrder["items"][number]) => ({
          id: item.id,
          productId: item.productId,
          productName: item.product.name,
          quantity: item.quantity,
          price: item.price.toNumber(),
        })),
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "JSON invalido." }, { status: 400 });
    if (error instanceof BadRequestError) return Response.json({ error: error.message }, { status: 400 });
    console.error("Erro ao criar pedido:", error);
    return Response.json({ error: "Nao foi possivel criar o pedido." }, { status: 500 });
  }
}

type ListedOrder = {
  id: string; status: string; deliveryMethod: "DELIVERY" | "PICKUP";
  deliveryOrder?: number | null; paymentMethod: "PIX" | "CASH";
  paymentStatus: "PENDING" | "CONFIRMED" | "FAILED" | "EXPIRED";
  paidAt?: Date | null; paymentReceiptNote?: string | null;
  totalPrice: DecimalLike; deliveryFee?: DecimalLike | null;
  couponDiscount?: DecimalLike | null; isFirstOrder: boolean;
  desiredDate?: string | null; zipCode?: string | null; street?: string | null;
  neighborhood?: string | null; city?: string | null; state?: string | null;
  addressNumber?: string | null; addressComplement?: string | null; notes?: string | null;
  createdAt: Date;
  customer: { id: string; name: string; phone: string };
  items: Array<{ quantity: number; price: DecimalLike; product: { name: string } }>;
};

export async function GET() {
  try {
    const includeDeliveryOrder = await hasOrderDeliveryOrderColumn();
    const orders = (await prisma.order.findMany({
      select: {
        ...buildOrderSelect(includeDeliveryOrder),
        items: {
          select: {
            quantity: true,
            price: true,
            product: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    })) as ListedOrder[];

    return Response.json(
      orders.map((order) => ({
        id: order.id,
        status: mapDbStatusToApi(order.status),
        deliveryMethod: order.deliveryMethod,
        deliveryOrder: getDeliveryOrderValue(order, includeDeliveryOrder),
        paymentMethod: order.paymentMethod,
        payment: {
          status: order.paymentStatus,
          paidAt: order.paidAt?.toISOString() ?? null,
          receiptNote: order.paymentReceiptNote ?? null,
        },
        totalPrice: order.totalPrice.toNumber(),
        deliveryFee: order.deliveryFee?.toNumber() ?? 0,
        couponDiscount: order.couponDiscount?.toNumber() ?? 0,
        isFirstOrder: order.isFirstOrder,
        desiredDate: order.desiredDate ?? null,
        zipCode: order.zipCode ?? null,
        street: order.street ?? null,
        neighborhood: order.neighborhood ?? null,
        city: order.city ?? null,
        state: order.state ?? null,
        addressNumber: order.addressNumber ?? null,
        addressComplement: order.addressComplement ?? null,
        notes: order.notes ?? null,
        createdAt: order.createdAt,
        customer: order.customer,
        items: order.items.map((item) => ({
          quantity: item.quantity,
          price: item.price.toNumber(),
          product: item.product,
        })),
      })),
    );
  } catch (error) {
    console.error("Erro ao listar pedidos:", error);
    return Response.json({ error: "Nao foi possivel listar os pedidos." }, { status: 500 });
  }
}
