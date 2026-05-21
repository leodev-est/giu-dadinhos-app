import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

type DecimalLike = {
  toNumber: () => number;
};

type CouponRecord = {
  id: string;
  code: string;
  type: "PERCENTAGE" | "FIXED";
  value: DecimalLike;
  active: boolean;
  maxUsage: number | null;
  usageCount: number;
  expiresAt: Date | null;
  createdAt: Date;
};

function formatCoupon(coupon: CouponRecord) {
  return {
    id: coupon.id,
    code: coupon.code,
    type: coupon.type,
    value: coupon.value.toNumber(),
    active: coupon.active,
    maxUsage: coupon.maxUsage,
    usageCount: coupon.usageCount,
    expiresAt: coupon.expiresAt ? coupon.expiresAt.toISOString() : null,
    createdAt: coupon.createdAt,
  };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;

    const coupon = (await prisma.coupon.findFirst({
      where: {
        code: { equals: code.toUpperCase(), mode: "insensitive" },
      },
    })) as CouponRecord | null;

    if (!coupon) {
      return Response.json({ error: "Cupom invalido." }, { status: 404 });
    }

    if (!coupon.active) {
      return Response.json({ error: "Cupom invalido." }, { status: 404 });
    }

    if (coupon.maxUsage !== null && coupon.usageCount >= coupon.maxUsage) {
      return Response.json({ error: "Cupom invalido." }, { status: 404 });
    }

    if (coupon.expiresAt !== null && coupon.expiresAt <= new Date()) {
      return Response.json({ error: "Cupom invalido." }, { status: 404 });
    }

    return Response.json(formatCoupon(coupon));
  } catch (error) {
    console.error("Erro ao buscar cupom:", error);

    return Response.json(
      { error: "Nao foi possivel buscar o cupom." },
      { status: 500 },
    );
  }
}

const patchCouponSchema = z.object({
  active: z.boolean(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const body = await request.json();
    const parsed = patchCouponSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Dados invalidos.", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const coupon = (await prisma.coupon.findFirst({
      where: {
        code: { equals: code.toUpperCase(), mode: "insensitive" },
      },
    })) as CouponRecord | null;

    if (!coupon) {
      return Response.json({ error: "Cupom nao encontrado." }, { status: 404 });
    }

    const updated = (await prisma.coupon.update({
      where: { id: coupon.id },
      data: { active: parsed.data.active },
    })) as CouponRecord;

    return Response.json(formatCoupon(updated));
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: "JSON invalido." }, { status: 400 });
    }

    console.error("Erro ao atualizar cupom:", error);

    return Response.json(
      { error: "Nao foi possivel atualizar o cupom." },
      { status: 500 },
    );
  }
}
