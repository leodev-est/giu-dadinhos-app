import { formatOrderAddress, formatOrderDesiredDate } from "@/lib/order-formatters";
import { orderStatusConfig } from "@/lib/order-status";

export type WhatsAppOrderStatus =
  | "CREATED"
  | "READY"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED";

export type WhatsAppOrderMessageInput = {
  id: string;
  status: WhatsAppOrderStatus;
  totalPrice: number;
  desiredDate?: string | null;
  zipCode?: string | null;
  street?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  addressNumber?: string | null;
  addressComplement?: string | null;
  notes?: string | null;
  customer: {
    name: string;
    phone: string;
  };
  items: Array<{
    quantity: number;
    product: {
      name: string;
    };
  }>;
};

export function formatWhatsAppOrderPrice(price: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(price);
}

function summarizeItems(order: WhatsAppOrderMessageInput) {
  return order.items
    .map((item) => `${item.product.name} x${item.quantity}`)
    .join(", ");
}

export function buildWhatsAppOrderMessage(
  order: WhatsAppOrderMessageInput,
  templateStatus: WhatsAppOrderStatus,
) {
  const itemsSummary = summarizeItems(order);
  const total = formatWhatsAppOrderPrice(order.totalPrice);
  const desiredDate = formatOrderDesiredDate(order.desiredDate);
  const address = formatOrderAddress(order);
  const statusConfig = orderStatusConfig[templateStatus];

  const templates: Record<WhatsAppOrderStatus, string[]> = {
    CREATED: [
      `Oi, ${order.customer.name}.`,
      "",
      statusConfig.message,
      "",
      `Itens: ${itemsSummary}`,
      `Total: ${total}`,
    ],
    READY: [
      `Oi, ${order.customer.name}.`,
      "",
      statusConfig.message,
      "",
      `Itens: ${itemsSummary}`,
      `Total: ${total}`,
    ],
    OUT_FOR_DELIVERY: [
      `Oi, ${order.customer.name}.`,
      "",
      statusConfig.message,
      "",
      `Itens: ${itemsSummary}`,
      `Total: ${total}`,
    ],
    DELIVERED: [
      `Oi, ${order.customer.name}.`,
      "",
      statusConfig.message,
      "",
      `Itens: ${itemsSummary}`,
      `Total: ${total}`,
    ],
    CANCELLED: [
      `Oi, ${order.customer.name}.`,
      "",
      statusConfig.message,
      "",
      `Itens: ${itemsSummary}`,
      `Total previsto: ${total}`,
      "Se quiser, podemos te ajudar a montar um novo pedido por aqui.",
    ],
  };

  const lines = [...templates[templateStatus]];

  if (desiredDate) {
    lines.push(`Para quando: ${desiredDate}`);
  }

  if (address) {
    lines.push(`Endereco: ${address}`);
  }

  if (order.notes?.trim()) {
    lines.push(`Observacao: ${order.notes.trim()}`);
  }

  return lines.join("\n");
}

export function normalizeWhatsAppPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");

  if (digits.length < 10) {
    return null;
  }

  if (digits.startsWith("55")) {
    return digits;
  }

  return `55${digits}`;
}

export function buildWhatsAppLink(phone: string, message: string) {
  const normalizedPhone = normalizeWhatsAppPhone(phone);

  if (!normalizedPhone) {
    return null;
  }

  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
}
