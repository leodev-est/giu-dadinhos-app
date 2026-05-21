import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type DecimalLike = { toNumber: () => number };

type OrderItemRecord = {
  quantity: number;
  price: DecimalLike;
  product: { id: string; name: string; price: DecimalLike };
  order: {
    status: string;
    createdAt: Date;
    totalPrice: DecimalLike;
    deliveryMethod: string;
    couponDiscount: DecimalLike | null;
  };
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const dateFilter =
      from && to
        ? { createdAt: { gte: new Date(from), lte: new Date(to + "T23:59:59.999Z") } }
        : {};

    const [items, totalOrdersResult] = await Promise.all([
      prisma.orderItem.findMany({
        where: { order: { ...dateFilter, status: { not: "CANCELADO" } } },
        select: {
          quantity: true,
          price: true,
          product: { select: { id: true, name: true, price: true } },
          order: {
            select: {
              status: true,
              createdAt: true,
              totalPrice: true,
              deliveryMethod: true,
              couponDiscount: true,
            },
          },
        },
      }) as Promise<OrderItemRecord[]>,
      prisma.order.aggregate({
        where: { status: { not: "CANCELADO" }, ...dateFilter },
        _sum: { totalPrice: true },
        _count: { id: true },
      }),
    ]);

    const productMap = new Map<string, { id: string; name: string; quantity: number; revenue: number }>();

    for (const item of items) {
      const existing = productMap.get(item.product.id);
      const lineRevenue = item.price.toNumber() * item.quantity;
      if (existing) {
        existing.quantity += item.quantity;
        existing.revenue += lineRevenue;
      } else {
        productMap.set(item.product.id, {
          id: item.product.id,
          name: item.product.name,
          quantity: item.quantity,
          revenue: lineRevenue,
        });
      }
    }

    const topProducts = Array.from(productMap.values()).sort((a, b) => b.quantity - a.quantity);

    const totalRevenue = (totalOrdersResult._sum.totalPrice as DecimalLike | null)?.toNumber() ?? 0;
    const totalOrders = totalOrdersResult._count.id;

    const deliveryCounts = items.reduce(
      (acc, item) => {
        if (item.order.deliveryMethod === "DELIVERY") acc.delivery += 1;
        else acc.pickup += 1;
        return acc;
      },
      { delivery: 0, pickup: 0 },
    );

    const totalCouponDiscount = items.reduce((sum, item) => {
      return sum + (item.order.couponDiscount?.toNumber() ?? 0);
    }, 0);

    return Response.json({
      totalOrders,
      totalRevenue,
      totalCouponDiscount,
      deliveryCounts,
      topProducts,
    });
  } catch (error) {
    console.error("Erro ao gerar relatorio:", error);
    return Response.json({ error: "Nao foi possivel gerar o relatorio." }, { status: 500 });
  }
}
