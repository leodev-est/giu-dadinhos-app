import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

type LoyaltyCardRecord = {
  id: string;
  customerId: string;
  stars: number;
  totalGrams: number;
  redeemedRewards: number;
  createdAt: Date;
  updatedAt: Date;
};

function formatLoyaltyCard(card: LoyaltyCardRecord) {
  const pendingRewards = Math.floor(card.stars / 10) - card.redeemedRewards;

  return {
    stars: card.stars,
    totalGrams: card.totalGrams,
    redeemedRewards: card.redeemedRewards,
    pendingRewards,
  };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ customerId: string }> },
) {
  try {
    const { customerId } = await context.params;

    const card = (await prisma.loyaltyCard.findUnique({
      where: { customerId },
    })) as LoyaltyCardRecord | null;

    if (!card) {
      return Response.json({
        stars: 0,
        totalGrams: 0,
        redeemedRewards: 0,
        pendingRewards: 0,
      });
    }

    return Response.json(formatLoyaltyCard(card));
  } catch (error) {
    console.error("Erro ao buscar fidelidade:", error);

    return Response.json(
      { error: "Nao foi possivel buscar o cartao de fidelidade." },
      { status: 500 },
    );
  }
}

const patchLoyaltySchema = z.object({
  redeemedRewards: z
    .number()
    .int("Resgates devem ser um numero inteiro.")
    .nonnegative("Resgates nao podem ser negativos."),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ customerId: string }> },
) {
  try {
    const { customerId } = await context.params;
    const body = await request.json();
    const parsed = patchLoyaltySchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Dados invalidos.", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const existing = (await prisma.loyaltyCard.findUnique({
      where: { customerId },
    })) as LoyaltyCardRecord | null;

    if (!existing) {
      return Response.json(
        { error: "Cartao de fidelidade nao encontrado." },
        { status: 404 },
      );
    }

    const maxRedeemable = Math.floor(existing.stars / 10);

    if (parsed.data.redeemedRewards > maxRedeemable) {
      return Response.json(
        {
          error: `Numero de resgates (${parsed.data.redeemedRewards}) nao pode ser maior que o total disponivel (${maxRedeemable}).`,
        },
        { status: 400 },
      );
    }

    const updated = (await prisma.loyaltyCard.update({
      where: { customerId },
      data: { redeemedRewards: parsed.data.redeemedRewards },
    })) as LoyaltyCardRecord;

    return Response.json(formatLoyaltyCard(updated));
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: "JSON invalido." }, { status: 400 });
    }

    console.error("Erro ao atualizar fidelidade:", error);

    return Response.json(
      { error: "Nao foi possivel atualizar o cartao de fidelidade." },
      { status: 500 },
    );
  }
}
