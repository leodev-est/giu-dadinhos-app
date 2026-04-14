import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createProductSchema = z.object({
  name: z.string().trim().min(1, "Nome do produto e obrigatorio."),
  price: z.number().positive("Preco deve ser maior que zero."),
  stockQuantity: z
    .number()
    .int("Estoque deve ser um numero inteiro.")
    .min(0, "Estoque nao pode ser negativo.")
    .optional(),
  active: z.boolean().optional(),
});

type DecimalLike = {
  toNumber: () => number;
};

type ProdutoRecord = {
  id: string;
  name: string;
  price: DecimalLike;
  active: boolean;
  stockQuantity: number;
  createdAt: Date;
};

function formatProduto(produto: ProdutoRecord) {
  return {
    id: produto.id,
    name: produto.name,
    price: produto.price.toNumber(),
    active: produto.active,
    stockQuantity: produto.stockQuantity,
    createdAt: produto.createdAt,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsedBody = createProductSchema.safeParse(body);

    if (!parsedBody.success) {
      return Response.json(
        {
          error: "Dados invalidos.",
          details: parsedBody.error.flatten(),
        },
        { status: 400 },
      );
    }

    const produto = (await prisma.product.create({
      data: {
        name: parsedBody.data.name,
        price: parsedBody.data.price.toFixed(2),
        ...(parsedBody.data.stockQuantity !== undefined
          ? { stockQuantity: parsedBody.data.stockQuantity }
          : {}),
        ...(parsedBody.data.active !== undefined
          ? { active: parsedBody.data.active }
          : {}),
      },
    })) as ProdutoRecord;

    return Response.json(formatProduto(produto), { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json(
        {
          error: "JSON invalido.",
        },
        { status: 400 },
      );
    }

    console.error("Erro ao criar produto:", error);

    return Response.json(
      {
        error: "Nao foi possivel criar o produto.",
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const produtos = (await prisma.product.findMany({
      orderBy: {
        createdAt: "desc",
      },
    })) as ProdutoRecord[];

    return Response.json(produtos.map(formatProduto));
  } catch (error) {
    console.error("Erro ao listar produtos:", error);

    return Response.json(
      {
        error: "Nao foi possivel listar os produtos.",
      },
      { status: 500 },
    );
  }
}
