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

export async function GET() {
  try {
    const coupons = (await prisma.coupon.findMany({
      orderBy: { createdAt: "desc" },
    })) as CouponRecord[];

    return Response.json(coupons.map(formatCoupon));
  } catch (error) {
    console.error("Erro ao listar cupons:", error);

    return Response.json(
      { error: "Nao foi possivel listar os cupons." },
      { status: 500 },
    );
  }
}

const createCouponSchema = z.object({
  code: z.string().trim().min(1, "Codigo e obrigatorio."),
  type: z.enum(["PERCENTAGE", "FIXED"]),
  value: z.number().positive("Valor deve ser maior que zero."),
  maxUsage: z
    .number()
    .int("Uso maximo deve ser um numero inteiro.")
    .positive("Uso maximo deve ser maior que zero.")
    .optional(),
  expiresAt: z
    .string()
    .datetime({ message: "Data de expiracao invalida." })
    .optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = createCouponSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Dados invalidos.", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { code, type, value, maxUsage, expiresAt } = parsed.data;

    const normalizedCode = code.toUpperCase();

    const existing = await prisma.coupon.findUnique({
      where: { code: normalizedCode },
    });

    if (existing) {
      return Response.json(
        { error: "Ja existe um cupom com este codigo." },
        { status: 409 },
      );
    }

    const coupon = (await prisma.coupon.create({
      data: {
        code: normalizedCode,
        type,
        value: value.toFixed(2),
        ...(maxUsage !== undefined ? { maxUsage } : {}),
        ...(expiresAt !== undefined ? { expiresAt: new Date(expiresAt) } : {}),
      },
    })) as CouponRecord;

    return Response.json(formatCoupon(coupon), { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: "JSON invalido." }, { status: 400 });
    }

    console.error("Erro ao criar cupom:", error);

    return Response.json(
      { error: "Nao foi possivel criar o cupom." },
      { status: 500 },
    );
  }
}
