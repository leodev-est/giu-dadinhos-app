import { type AsaasWebhookEvent, getAsaasWebhookToken } from "@/lib/asaas";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const expectedToken = getAsaasWebhookToken();
    const receivedToken = request.headers.get("asaas-access-token")?.trim() ?? "";

    if (expectedToken && receivedToken !== expectedToken) {
      return Response.json(
        {
          error: "Webhook token invalido.",
        },
        { status: 401 },
      );
    }

    const payload = (await request.json()) as AsaasWebhookEvent;

    const paymentId = payload.payment?.id?.trim();
    const paymentStatus = payload.payment?.status?.trim();

    if (!paymentId || !paymentStatus) {
      return Response.json({ ok: true, ignored: true });
    }

    const order = (await prisma.order.findFirst({
      where: {
        paymentExternalId: paymentId,
      },
      select: {
        id: true,
      },
    })) as { id: string } | null;

    if (!order) {
      return Response.json({ ok: true, ignored: true });
    }

    if (paymentStatus === "RECEIVED" || paymentStatus === "CONFIRMED") {
      await prisma.order.update({
        where: {
          id: order.id,
        },
        data: {
          paymentStatus: "CONFIRMED",
          paidAt: new Date(),
        },
      });
    }

    if (
      paymentStatus === "OVERDUE" ||
      paymentStatus === "REFUNDED" ||
      paymentStatus === "RECEIVED_IN_CASH_UNDONE"
    ) {
      await prisma.order.update({
        where: {
          id: order.id,
        },
        data: {
          paymentStatus: "FAILED",
        },
      });
    }

    if (paymentStatus === "DELETED") {
      await prisma.order.update({
        where: {
          id: order.id,
        },
        data: {
          paymentStatus: "EXPIRED",
        },
      });
    }

    console.log("Webhook Asaas recebido:", payload);

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Erro ao processar webhook do Asaas:", error);

    return Response.json(
      {
        error: "Nao foi possivel processar o webhook do Asaas.",
      },
      { status: 500 },
    );
  }
}
