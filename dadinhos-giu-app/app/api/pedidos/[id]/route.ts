import { prisma } from "@/lib/prisma";
import { hasOrderDeliveryOrderColumn } from "@/lib/order-delivery-order";
import {
  mapApiStatusToDb,
  mapDbStatusToApi,
  type OrderStatus,
} from "@/lib/order-status";
import { z } from "zod";

export const dynamic = "force-dynamic";

type DecimalLike = {
  toNumber: () => number;
};

type PedidoComRelacoes = {
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
    cpfCnpj?: string | null;
  };
  items: Array<{
    id: string;
    quantity: number;
    price: DecimalLike;
    product: {
      id: string;
      name: string;
      price: DecimalLike;
    };
  }>;
};

type PedidoHistoricoCliente = {
  id: string;
  status: string;
  totalPrice: DecimalLike;
  desiredDate?: string | null;
  createdAt: Date;
  items: Array<{
    id: string;
    quantity: number;
    product: {
      id: string;
      name: string;
    };
  }>;
};

const editableOrderFields = [
  "status",
  "deliveryMethod",
  "deliveryOrder",
  "desiredDate",
  "zipCode",
  "street",
  "neighborhood",
  "city",
  "state",
  "addressNumber",
  "addressComplement",
  "notes",
] as const;

const patchOrderSchema = z.object({
  status: z
    .enum(["CREATED", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"])
    .optional(),
  deliveryMethod: z.enum(["DELIVERY", "PICKUP"]).optional(),
  deliveryOrder: z.number().int().positive().nullable().optional(),
  desiredDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data desejada invalida.")
    .or(z.literal(""))
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

function buildPedidoSelect(includeDeliveryOrder: boolean) {
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
        cpfCnpj: true,
      },
    },
    items: {
      select: {
        id: true,
        quantity: true,
        price: true,
        product: {
          select: {
            id: true,
            name: true,
            price: true,
          },
        },
      },
    },
  };
}

function formatPedidoHistorico(pedido: PedidoHistoricoCliente, currentOrderId: string) {
  return {
    id: pedido.id,
    status: mapDbStatusToApi(pedido.status),
    totalPrice: pedido.totalPrice.toNumber(),
    desiredDate: pedido.desiredDate ?? null,
    createdAt: pedido.createdAt,
    isCurrentOrder: pedido.id === currentOrderId,
    items: pedido.items.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      product: {
        id: item.product.id,
        name: item.product.name,
      },
    })),
  };
}

function formatPedido(
  pedido: PedidoComRelacoes,
  includeDeliveryOrder: boolean,
) {
  return {
    id: pedido.id,
    status: mapDbStatusToApi(pedido.status),
    deliveryMethod: pedido.deliveryMethod,
    deliveryOrder: includeDeliveryOrder ? (pedido.deliveryOrder ?? null) : null,
    payment: {
      provider: pedido.paymentProvider,
      status: pedido.paymentStatus,
      externalId: pedido.paymentExternalId ?? null,
      pixCopyAndPaste: pedido.paymentQrCode ?? null,
      qrCodeImage: pedido.paymentQrCodeImage ?? null,
      expiresAt: pedido.paymentExpiresAt?.toISOString() ?? null,
      paidAt: pedido.paidAt?.toISOString() ?? null,
    },
    totalPrice: pedido.totalPrice.toNumber(),
    desiredDate: pedido.desiredDate ?? null,
    zipCode: pedido.zipCode ?? null,
    street: pedido.street ?? null,
    neighborhood: pedido.neighborhood ?? null,
    city: pedido.city ?? null,
    state: pedido.state ?? null,
    addressNumber: pedido.addressNumber ?? null,
    addressComplement: pedido.addressComplement ?? null,
    notes: pedido.notes ?? null,
    createdAt: pedido.createdAt,
    customer: {
      id: pedido.customer.id,
      name: pedido.customer.name,
      phone: pedido.customer.phone,
      cpfCnpj: pedido.customer.cpfCnpj ?? null,
    },
    items: pedido.items.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      price: item.price.toNumber(),
      product: {
        id: item.product.id,
        name: item.product.name,
        price: item.product.price.toNumber(),
      },
    })),
  };
}

async function getPedidoById(id: string, includeDeliveryOrder: boolean) {
  return (await prisma.order.findUnique({
    where: {
      id,
    },
    select: buildPedidoSelect(includeDeliveryOrder),
  })) as PedidoComRelacoes | null;
}

async function getHistoricoCliente(customerId: string) {
  return (await prisma.order.findMany({
    where: {
      customerId,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      status: true,
      totalPrice: true,
      desiredDate: true,
      createdAt: true,
      items: {
        select: {
          id: true,
          quantity: true,
          product: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  })) as PedidoHistoricoCliente[];
}

function hasEditableFields(payload: Record<string, unknown>) {
  return editableOrderFields.some((field) =>
    Object.prototype.hasOwnProperty.call(payload, field),
  );
}

function getNullableString(value?: string) {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const includeDeliveryOrder = await hasOrderDeliveryOrderColumn();
    const pedido = await getPedidoById(id, includeDeliveryOrder);

    if (!pedido) {
      return Response.json(
        {
          error: "Pedido nao encontrado.",
        },
        { status: 404 },
      );
    }

    const historicoCliente = await getHistoricoCliente(pedido.customer.id);

    return Response.json({
      ...formatPedido(pedido, includeDeliveryOrder),
      customerHistory: historicoCliente.map((item) =>
        formatPedidoHistorico(item, pedido.id),
      ),
    });
  } catch (error) {
    console.error("Erro ao buscar pedido:", error);

    return Response.json(
      {
        error: "Nao foi possivel buscar o pedido.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const includeDeliveryOrder = await hasOrderDeliveryOrderColumn();
    const body = (await request.json()) as Record<string, unknown>;

    if (!hasEditableFields(body)) {
      return Response.json(
        {
          error: "Informe ao menos um campo para atualizar.",
        },
        { status: 400 },
      );
    }

    const parsedBody = patchOrderSchema.safeParse(body);

    if (!parsedBody.success) {
      return Response.json(
        {
          error: "Dados invalidos.",
          details: parsedBody.error.flatten(),
        },
        { status: 400 },
      );
    }

    const pedidoExistente = await getPedidoById(id, includeDeliveryOrder);

    if (!pedidoExistente) {
      return Response.json(
        {
          error: "Pedido nao encontrado.",
        },
        { status: 404 },
      );
    }

    const updateData: Record<string, string | number | null> = {};

    if (Object.prototype.hasOwnProperty.call(body, "status")) {
      updateData.status = mapApiStatusToDb(
        parsedBody.data.status as OrderStatus,
      );
    }

    if (Object.prototype.hasOwnProperty.call(body, "deliveryMethod")) {
      updateData.deliveryMethod = parsedBody.data.deliveryMethod ?? "DELIVERY";
    }

    if (Object.prototype.hasOwnProperty.call(body, "deliveryOrder")) {
      if (!includeDeliveryOrder) {
        return Response.json(
          {
            error: "A ordenacao de rota ainda nao esta disponivel neste ambiente.",
          },
          { status: 409 },
        );
      }

      updateData.deliveryOrder = parsedBody.data.deliveryOrder ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(body, "desiredDate")) {
      updateData.desiredDate = getNullableString(parsedBody.data.desiredDate);
    }

    if (Object.prototype.hasOwnProperty.call(body, "zipCode")) {
      updateData.zipCode = getNullableString(parsedBody.data.zipCode);
    }

    if (Object.prototype.hasOwnProperty.call(body, "street")) {
      updateData.street = getNullableString(parsedBody.data.street);
    }

    if (Object.prototype.hasOwnProperty.call(body, "neighborhood")) {
      updateData.neighborhood = getNullableString(parsedBody.data.neighborhood);
    }

    if (Object.prototype.hasOwnProperty.call(body, "city")) {
      updateData.city = getNullableString(parsedBody.data.city);
    }

    if (Object.prototype.hasOwnProperty.call(body, "state")) {
      updateData.state = getNullableString(parsedBody.data.state);
    }

    if (Object.prototype.hasOwnProperty.call(body, "addressNumber")) {
      updateData.addressNumber = getNullableString(parsedBody.data.addressNumber);
    }

    if (Object.prototype.hasOwnProperty.call(body, "addressComplement")) {
      updateData.addressComplement = getNullableString(
        parsedBody.data.addressComplement,
      );
    }

    if (Object.prototype.hasOwnProperty.call(body, "notes")) {
      updateData.notes = getNullableString(parsedBody.data.notes);
    }

    const nextDeliveryMethod =
      (updateData.deliveryMethod as "DELIVERY" | "PICKUP" | undefined) ??
      pedidoExistente.deliveryMethod;

    if (nextDeliveryMethod === "PICKUP") {
      updateData.deliveryOrder = null;
      updateData.zipCode = null;
      updateData.street = null;
      updateData.neighborhood = null;
      updateData.city = null;
      updateData.state = null;
      updateData.addressNumber = null;
      updateData.addressComplement = null;
    }

    const pedidoAtualizado = (await prisma.order.update({
      where: {
        id,
      },
      data: updateData,
      select: buildPedidoSelect(includeDeliveryOrder),
    })) as PedidoComRelacoes;

    const historicoCliente = await getHistoricoCliente(pedidoAtualizado.customer.id);

    return Response.json({
      ...formatPedido(pedidoAtualizado, includeDeliveryOrder),
      customerHistory: historicoCliente.map((item) =>
        formatPedidoHistorico(item, pedidoAtualizado.id),
      ),
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json(
        {
          error: "JSON invalido.",
        },
        { status: 400 },
      );
    }

    console.error("Erro ao atualizar pedido:", error);

    return Response.json(
      {
        error: "Nao foi possivel atualizar o pedido.",
      },
      { status: 500 },
    );
  }
}
