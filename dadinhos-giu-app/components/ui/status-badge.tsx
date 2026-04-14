import type { HTMLAttributes, ReactNode } from "react";
import {
  orderStatusConfig,
  type OrderStatus as StatusVariant,
} from "@/lib/order-status";

type StatusBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  status: StatusVariant;
  children?: ReactNode;
};

const statusClasses: Record<StatusVariant, string> = {
  CREATED: "bg-[#8a6a4d] text-[#f5e6d3]",
  READY: "bg-accent text-text-contrast",
  OUT_FOR_DELIVERY: "bg-[#c9782f] text-[#fff1df]",
  DELIVERED: "bg-[#4f7a4f] text-[#eef8ea]",
  CANCELLED: "bg-[#6f2e26] text-[#fde8e2]",
};

export function StatusBadge({
  className = "",
  children,
  status,
  ...props
}: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold tracking-wide ${statusClasses[status]} ${className}`.trim()}
      {...props}
    >
      {children ?? orderStatusConfig[status].label}
    </span>
  );
}
