export type OrderStatus =
  | "CREATED"
  | "READY"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED";

export const orderStatusConfig: Record<
  OrderStatus,
  { label: string; message: string }
> = {
  CREATED: {
    label: "Recebido",
    message: "Recebemos seu pedido com muito carinho.",
  },
  READY: {
    label: "Pronto",
    message: "Seu pedido esta pronto.",
  },
  OUT_FOR_DELIVERY: {
    label: "Saiu para entrega",
    message: "Seu pedido saiu para entrega.",
  },
  DELIVERED: {
    label: "Entregue",
    message: "Seu pedido foi entregue com sucesso.",
  },
  CANCELLED: {
    label: "Cancelado",
    message: "Houve um problema com seu pedido e ele foi cancelado.",
  },
};

const statusFromApiToDb = {
  CREATED: "PENDING",
  READY: "CONFIRMED",
  OUT_FOR_DELIVERY: "IN_PROGRESS",
  DELIVERED: "COMPLETED",
  CANCELLED: "CANCELED",
} as const;

const statusFromDbToApi: Record<string, OrderStatus> = {
  PENDING: "CREATED",
  CONFIRMED: "READY",
  IN_PROGRESS: "OUT_FOR_DELIVERY",
  COMPLETED: "DELIVERED",
  CANCELED: "CANCELLED",
};

export function mapApiStatusToDb(status: OrderStatus) {
  return statusFromApiToDb[status];
}

export function mapDbStatusToApi(status: string): OrderStatus {
  return statusFromDbToApi[status] ?? "CREATED";
}
