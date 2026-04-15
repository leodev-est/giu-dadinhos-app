import {
  createDynamicPixPayment,
  isAsaasPixEnabled,
  type AsaasDynamicPixPayment,
} from "@/lib/asaas";
import { prisma } from "@/lib/prisma";
import { hasOrderDeliveryOrderColumn } from "@/lib/order-delivery-order";
import { mapApiStatusToDb, mapDbStatusToApi } from "@/lib/order-status";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createOrderSchema = z.object({
  customer: z.object({
    name: z.string().trim().min(1, "Nome do cliente e obrigatorio."),
    phone: z
      .string()
      .trim()
      .min(8, "Telefone invalido.")
      .max(20, "Telefone invalido."),
  }),
  items: z
    .array(
      z.object({
        productId: z.string().trim().min(1, "Produto e obrigatorio."),
        quantity: z
          .number()
          .int("Quantidade deve ser um numero inteiro.")
          .positive("Quantidade deve ser maior que zero."),
      }),
    )
    .min(1, "O pedido deve ter ao menos um item."),
  deliveryMethod: z.enum(["DELIVERY", "PICKUP"]),
  desiredDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data desejada invalida.")
    .optional(),
  zipCode: z.string().trim().max(12, "CEP invalido.").optional(),
  street: z.string().trim().max(120, "Rua invalida.").optional(),
  neighborhood: z.string().trim().max(120, "Bairro invalido.").optional(),
  city: z.string().trim().max(120, "Cidade invalida.").optional(),
  state: z.string().trim().max(2, "Estado invalido.").optional(),
  addressNumber: z.string().trim().max(20, "Numero invalido.").optional(),
  addressComplement: z
    .string()
    .trim()
    .max(120, "Complemento invalido.")
    .optional(),
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
};

type CustomerRecord = {
  id: string;
  name: string;
  phone: string;
};

function buildOrderSelect(includeDeliveryOrder: boolean) {
  return {
    id: true,
    status: true,
    deliveryMethod: true,
    ...(includeDeliveryOrder ? { deliveryOrder: true } : {}),
    paymentProvider: true,
    paymentStatus: true,
    paymentExternalId: true,
    paymentQrCode: true,
    paymentQrCodeImage: true,
    paymentExpiresAt: true,
    paidAt: true,
    totalPrice: true,
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
    customer: {
      select: {
        id: true,
        name: true,
        phone: true,
      },
    },
    items: {
      select: {
        id: true,
        productId: true,
        quantity: true,
        price: true,
        product: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    },
  };
}

function getDeliveryOrderValue(
  order: { deliveryOrder?: number | null },
  includeDeliveryOrder: boolean,
) {
  return includeDeliveryOrder ? (order.deliveryOrder ?? null) : null;
}

type CreatedOrder = {
  id: string;
  status: string;
  deliveryMethod: "DELIVERY" | "PICKUP";
  deliveryOrder?: number | null;
  paymentProvider: "MANUAL_PIX" | "ASAAS";
  paymentStatus: "PENDING" | "CONFIRMED" | "FAILED" | "EXPIRED";
  paymentExternalId?: string | null;
  paymentQrCode?: string | null;
  paymentQrCodeImage?: string | null;
  paymentExpiresAt?: Date | null;
  paidAt?: Date | null;
  totalPrice: DecimalLike;
  desiredDate?: string | null;
  zipCode?: string | null;
  street?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  addressNumber?: string | null;
  addressComplement?: string | null;
  notes?: string | null;
  createdAt: Date;
  customer: {
    id: string;
    name: string;
    phone: string;
  };
  items: Array<{
    id: string;
    productId: string;
    quantity: number;
    price: DecimalLike;
    product: {
      id: string;
      name: string;
    };
  }>;
};

function getTodayDateInSaoPaulo() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

function normalizeItems(items: CreateOrderInput["items"]) {
  const itemsByProductId = new Map<string, number>();

  for (const item of items) {
    const currentQuantity = itemsByProductId.get(item.productId) ?? 0;
    itemsByProductId.set(item.productId, currentQuantity + item.quantity);
  }

  return Array.from(itemsByProductId, ([productId, quantity]) => ({
    productId,
    quantity,
  }));
}

function getOptionalString(value?: string) {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : undefined;
}

export async function POST(request: Request) {
  try {
    const includeDeliveryOrder = await hasOrderDeliveryOrderColumn();
    const body = await request.json();
    const parsedBody = createOrderSchema.safeParse(body);

    if (!parsedBody.success) {
      return Response.json(
        {
          error: "Dados invalidos.",
          details: parsedBody.error.flatten(),
        },
        { status: 400 },
      );
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
      return Response.json(
        {
          error: "Preencha o endereco completo para entrega.",
        },
        { status: 400 },
      );
    }

    const normalizedItems = normalizeItems(parsedBody.data.items);
    const productIds = normalizedItems.map((item) => item.productId);

    const order = await prisma.$transaction(async (tx: typeof prisma) => {
      const [existingCustomer, products] = (await Promise.all([
        tx.customer.findFirst({
          where: {
            phone: parsedBody.data.customer.phone,
          },
        }),
        tx.product.findMany({
          where: {
            id: {
              in: productIds,
            },
          },
        }),
      ])) as [CustomerRecord | null, ProductRecord[]];

      const customer = existingCustomer
        ? ((await tx.customer.update({
            where: {
              id: existingCustomer.id,
            },
            data: {
              name: parsedBody.data.customer.name,
            },
          })) as CustomerRecord)
        : ((await tx.customer.create({
            data: {
              name: parsedBody.data.customer.name,
              phone: parsedBody.data.customer.phone,
            },
          })) as CustomerRecord);

      if (products.length !== productIds.length) {
        const foundIds = new Set(products.map((product) => product.id));
        const missingProductIds = productIds.filter((id) => !foundIds.has(id));

        throw new BadRequestError(
          `Produtos nao encontrados: ${missingProductIds.join(", ")}`,
        );
      }

      const productsById = new Map(
        products.map((product) => [product.id, product] as const),
      );

      const orderItems = normalizedItems.map((item) => {
        const product = productsById.get(item.productId);

        if (!product) {
          throw new Error(`Produto nao encontrado: ${item.productId}`);
        }

        if (!product.active) {
          throw new BadRequestError(
            `${product.name} nao esta disponivel no momento.`,
          );
        }

        return {
          productId: product.id,
          productName: product.name,
          quantity: item.quantity,
          price: product.price,
          stockQuantity: product.stockQuantity,
          lineTotal: product.price.toNumber() * item.quantity,
        };
      });

      const totalPrice = orderItems.reduce(
        (total, item) => total + item.lineTotal,
        0,
      );

      for (const item of orderItems) {
        if (item.stockQuantity <= 0) {
          continue;
        }

        const updatedProduct = await tx.product.updateMany({
          where: {
            id: item.productId,
            active: true,
            stockQuantity: {
              gt: 0,
            },
          },
          data: {
            stockQuantity: {
              decrement: Math.min(item.quantity, item.stockQuantity),
            },
          },
        });

        if (updatedProduct.count === 0) {
          throw new BadRequestError(
            `O estoque de ${item.productName} mudou enquanto voce finalizava o pedido. Atualize a pagina e tente novamente.`,
          );
        }
      }

      return tx.order.create({
        data: {
          customerId: customer.id,
          status: mapApiStatusToDb("CREATED"),
          deliveryMethod: parsedBody.data.deliveryMethod,
          paymentProvider: "MANUAL_PIX",
          paymentStatus: "PENDING",
          totalPrice: totalPrice.toFixed(2),
          ...(getOptionalString(parsedBody.data.desiredDate)
            ? { desiredDate: parsedBody.data.desiredDate }
            : {}),
          ...(parsedBody.data.deliveryMethod === "DELIVERY" &&
          getOptionalString(parsedBody.data.zipCode)
            ? { zipCode: parsedBody.data.zipCode }
            : {}),
          ...(parsedBody.data.deliveryMethod === "DELIVERY" &&
          getOptionalString(parsedBody.data.street)
            ? { street: parsedBody.data.street }
            : {}),
          ...(parsedBody.data.deliveryMethod === "DELIVERY" &&
          getOptionalString(parsedBody.data.neighborhood)
            ? { neighborhood: parsedBody.data.neighborhood }
            : {}),
          ...(parsedBody.data.deliveryMethod === "DELIVERY" &&
          getOptionalString(parsedBody.data.city)
            ? { city: parsedBody.data.city }
            : {}),
          ...(parsedBody.data.deliveryMethod === "DELIVERY" &&
          getOptionalString(parsedBody.data.state)
            ? { state: parsedBody.data.state }
            : {}),
          ...(parsedBody.data.deliveryMethod === "DELIVERY" &&
          getOptionalString(parsedBody.data.addressNumber)
            ? { addressNumber: parsedBody.data.addressNumber }
            : {}),
          ...(parsedBody.data.deliveryMethod === "DELIVERY" &&
          getOptionalString(parsedBody.data.addressComplement)
            ? { addressComplement: parsedBody.data.addressComplement }
            : {}),
          ...(getOptionalString(parsedBody.data.notes)
            ? { notes: parsedBody.data.notes }
            : {}),
          items: {
            create: orderItems.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              price: item.price.toString(),
            })),
          },
        },
        select: buildOrderSelect(includeDeliveryOrder),
      }) as Promise<CreatedOrder>;
    });

    let payment: AsaasDynamicPixPayment | null = null;
    let paymentWarning: string | null = null;

    if (isAsaasPixEnabled()) {
      try {
        payment = await createDynamicPixPayment({
          orderId: order.id,
          customerName: order.customer.name,
          customerPhone: order.customer.phone,
          totalPrice: order.totalPrice.toNumber(),
          dueDate: order.desiredDate ?? getTodayDateInSaoPaulo(),
        });

        await prisma.order.update({
          where: {
            id: order.id,
          },
          data: {
            paymentProvider: "ASAAS",
            paymentStatus: "PENDING",
            paymentExternalId: payment.externalId,
            paymentQrCode: payment.pixCopyAndPaste,
            paymentQrCodeImage: payment.qrCodeImage,
            paymentExpiresAt: payment.expiresAt
              ? new Date(payment.expiresAt)
              : null,
          },
        });
      } catch (error) {
        console.error("Erro ao gerar cobranca Pix dinamica no Asaas:", error);
        paymentWarning =
          "Nao foi possivel gerar a cobranca Pix dinamica agora. Exibindo o Pix manual como fallback.";
      }
    }

    return Response.json(
      {
        id: order.id,
        status: mapDbStatusToApi(order.status),
        deliveryMethod: order.deliveryMethod,
        deliveryOrder: getDeliveryOrderValue(order, includeDeliveryOrder),
        payment: {
          provider: payment?.provider ?? order.paymentProvider,
          status: payment ? "PENDING" : order.paymentStatus,
          externalId: payment?.externalId ?? order.paymentExternalId ?? null,
          pixCopyAndPaste:
            payment?.pixCopyAndPaste ?? order.paymentQrCode ?? null,
          qrCodeImage:
            payment?.qrCodeImage ?? order.paymentQrCodeImage ?? null,
          expiresAt:
            payment?.expiresAt ??
            (order.paymentExpiresAt ? order.paymentExpiresAt.toISOString() : null),
          paidAt: order.paidAt ? order.paidAt.toISOString() : null,
        },
        totalPrice: order.totalPrice.toNumber(),
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
        customer: {
          id: order.customer.id,
          name: order.customer.name,
          phone: order.customer.phone,
        },
        items: order.items.map((item: CreatedOrder["items"][number]) => ({
          id: item.id,
          productId: item.productId,
          productName: item.product.name,
          quantity: item.quantity,
          price: item.price.toNumber(),
        })),
        paymentWarning,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json(
        {
          error: "JSON invalido.",
        },
        { status: 400 },
      );
    }

    if (error instanceof BadRequestError) {
      return Response.json(
        {
          error: error.message,
        },
        { status: 400 },
      );
    }

    console.error("Erro ao criar pedido:", error);

    return Response.json(
      {
        error: "Nao foi possivel criar o pedido.",
      },
      { status: 500 },
    );
  }
}

type ListedOrder = {
  id: string;
  status: string;
  deliveryMethod: "DELIVERY" | "PICKUP";
  deliveryOrder?: number | null;
  paymentProvider: "MANUAL_PIX" | "ASAAS";
  paymentStatus: "PENDING" | "CONFIRMED" | "FAILED" | "EXPIRED";
  paymentExternalId?: string | null;
  paymentQrCode?: string | null;
  paymentQrCodeImage?: string | null;
  paymentExpiresAt?: Date | null;
  paidAt?: Date | null;
  totalPrice: DecimalLike;
  desiredDate?: string | null;
  zipCode?: string | null;
  street?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  addressNumber?: string | null;
  addressComplement?: string | null;
  notes?: string | null;
  createdAt: Date;
  customer: {
    id: string;
    name: string;
    phone: string;
  };
  items: Array<{
    quantity: number;
    price: DecimalLike;
    product: {
      name: string;
    };
  }>;
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
            product: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    })) as ListedOrder[];

    return Response.json(
      orders.map((order) => ({
        id: order.id,
        status: mapDbStatusToApi(order.status),
        deliveryMethod: order.deliveryMethod,
        deliveryOrder: getDeliveryOrderValue(order, includeDeliveryOrder),
        payment: {
          provider: order.paymentProvider,
          status: order.paymentStatus,
          externalId: order.paymentExternalId ?? null,
          pixCopyAndPaste: order.paymentQrCode ?? null,
          qrCodeImage: order.paymentQrCodeImage ?? null,
          expiresAt: order.paymentExpiresAt?.toISOString() ?? null,
          paidAt: order.paidAt?.toISOString() ?? null,
        },
        totalPrice: order.totalPrice.toNumber(),
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

    return Response.json(
      {
        error: "Nao foi possivel listar os pedidos.",
      },
      { status: 500 },
    );
  }
}
