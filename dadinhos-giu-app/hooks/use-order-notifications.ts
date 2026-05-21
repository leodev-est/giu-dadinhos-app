"use client";

import { useEffect, useRef } from "react";

type Order = { id: string; status: string; customer?: { name?: string } };

function requestNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "default") {
    void Notification.requestPermission();
  }
}

function sendNotification(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, icon: "/favicon.ico" });
  } catch { /* silent */ }
}

export function useOrderNotifications(orders: Order[]) {
  const prevOrdersRef = useRef<Map<string, string>>(new Map());
  const isFirstLoadRef = useRef(true);

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  useEffect(() => {
    if (orders.length === 0) return;

    const prevMap = prevOrdersRef.current;

    if (isFirstLoadRef.current) {
      const newMap = new Map(orders.map((o) => [o.id, o.status]));
      prevOrdersRef.current = newMap;
      isFirstLoadRef.current = false;
      return;
    }

    for (const order of orders) {
      const prevStatus = prevMap.get(order.id);
      if (prevStatus === undefined) {
        sendNotification(
          "Novo pedido recebido!",
          `${order.customer?.name ?? "Cliente"} fez um novo pedido.`,
        );
      } else if (prevStatus !== order.status) {
        sendNotification(
          "Pedido atualizado",
          `Pedido de ${order.customer?.name ?? "cliente"} passou para: ${order.status}.`,
        );
      }
    }

    prevOrdersRef.current = new Map(orders.map((o) => [o.id, o.status]));
  }, [orders]);
}
