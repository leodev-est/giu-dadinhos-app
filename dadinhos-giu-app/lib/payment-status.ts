export type PaymentStatus =
  | "PENDING"
  | "CONFIRMED"
  | "FAILED"
  | "EXPIRED";

export const paymentStatusConfig: Record<
  PaymentStatus,
  { label: string; tone: "neutral" | "success" | "warning" | "danger" }
> = {
  PENDING: {
    label: "Aguardando pagamento",
    tone: "warning",
  },
  CONFIRMED: {
    label: "Pago",
    tone: "success",
  },
  FAILED: {
    label: "Falhou",
    tone: "danger",
  },
  EXPIRED: {
    label: "Expirado",
    tone: "neutral",
  },
};
