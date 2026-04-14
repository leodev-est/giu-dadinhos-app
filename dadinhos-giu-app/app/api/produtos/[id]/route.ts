import { prisma } from "@/lib/prisma";
import { z } from "zod";

const patchProductSchema = z
  .object({
    name: z.string().trim().min(1, "Nome do produto nao pode ser vazio.").optional(),
    price: z.number().positive("Preco deve ser maior que zero.").optional(),
    stockQuantity: z
      .number()
      .int("Estoque deve ser um numero inteiro.")
      .min(0, "Estoque nao pode ser negativo.")
      .optional(),
    active: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
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

async function getProdutoById(id: string) {
  return (await prisma.product.findUnique({
    where: {
      id,
    },
  })) as ProdutoRecord | null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const produto = await getProdutoById(id);

    if (!produto) {
      return Response.json(
        {
          error: "Produto nao encontrado.",
        },
        { status: 404 },
      );
    }

    return Response.json(formatProduto(produto));
  } catch (error) {
    console.error("Erro ao buscar produto:", error);

    return Response.json(
      {
        error: "Nao foi possivel buscar o produto.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsedBody = patchProductSchema.safeParse(body);

    if (!parsedBody.success) {
      return Response.json(
        {
          error: "Dados invalidos.",
          details: parsedBody.error.flatten(),
        },
        { status: 400 },
      );
    }

    const produtoExistente = await getProdutoById(id);

    if (!produtoExistente) {
      return Response.json(
        {
          error: "Produto nao encontrado.",
        },
        { status: 404 },
      );
    }

    const produtoAtualizado = (await prisma.product.update({
      where: {
        id,
      },
      data: {
        ...(parsedBody.data.name !== undefined
          ? { name: parsedBody.data.name }
          : {}),
        ...(parsedBody.data.price !== undefined
          ? { price: parsedBody.data.price.toFixed(2) }
          : {}),
        ...(parsedBody.data.stockQuantity !== undefined
          ? { stockQuantity: parsedBody.data.stockQuantity }
          : {}),
        ...(parsedBody.data.active !== undefined
          ? { active: parsedBody.data.active }
          : {}),
      },
    })) as ProdutoRecord;

    return Response.json(formatProduto(produtoAtualizado));
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json(
        {
          error: "JSON invalido.",
        },
        { status: 400 },
      );
    }

    console.error("Erro ao atualizar produto:", error);

    return Response.json(
      {
        error: "Nao foi possivel atualizar o produto.",
      },
      { status: 500 },
    );
  }
}
