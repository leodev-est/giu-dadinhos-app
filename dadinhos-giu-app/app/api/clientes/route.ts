import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type DecimalLike = {
  toNumber: () => number;
};

type CustomerWithAggregates = {
  id: string;
  name: string;
  phone: string;
  createdAt: Date;
  orders: Array<{
    totalPrice: DecimalLike;
    createdAt: Date;
  }>;
  loyaltyCard: {
    stars: number;
    totalGrams: number;
    redeemedRewards: number;
  } | null;
};

export async function GET() {
  try {
    const customers = (await prisma.customer.findMany({
      select: {
        id: true,
        name: true,
        phone: true,
        createdAt: true,
        orders: {
          select: {
            totalPrice: true,
            createdAt: true,
          },
        },
        loyaltyCard: {
          select: {
            stars: true,
            totalGrams: true,
            redeemedRewards: true,
          },
        },
      },
    })) as CustomerWithAggregates[];

    const formatted = customers
      .map((customer) => {
        const orderCount = customer.orders.length;

        const totalSpent = customer.orders.reduce(
          (sum, order) => sum + order.totalPrice.toNumber(),
          0,
        );

        const lastOrderAt =
          orderCount > 0
            ? customer.orders.reduce((latest, order) =>
                order.createdAt > latest.createdAt ? order : latest,
              ).createdAt
            : null;

        const loyaltyCard = customer.loyaltyCard
          ? {
              stars: customer.loyaltyCard.stars,
              totalGrams: customer.loyaltyCard.totalGrams,
              redeemedRewards: customer.loyaltyCard.redeemedRewards,
              pendingRewards:
                Math.floor(customer.loyaltyCard.stars / 10) -
                customer.loyaltyCard.redeemedRewards,
            }
          : null;

        return {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          createdAt: customer.createdAt,
          orderCount,
          totalSpent,
          lastOrderAt,
          loyaltyCard,
          isFirstTimeCustomer: orderCount === 1,
        };
      })
      .sort((a, b) => {
        if (a.lastOrderAt === null && b.lastOrderAt === null) return 0;
        if (a.lastOrderAt === null) return 1;
        if (b.lastOrderAt === null) return -1;
        return b.lastOrderAt.getTime() - a.lastOrderAt.getTime();
      });

    return Response.json(formatted);
  } catch (error) {
    console.error("Erro ao listar clientes:", error);

    return Response.json(
      { error: "Nao foi possivel listar os clientes." },
      { status: 500 },
    );
  }
}
