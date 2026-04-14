import "dotenv/config";
import { PrismaClient } from "../node_modules/.prisma/client/index.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const { Pool } = pg;

const seedProducts = [
  { name: "Dadinho 250g", price: "20.00", active: true },
  { name: "Dadinho 500g", price: "38.00", active: true },
];

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL nao configurada.");
}

const pool = new Pool({
  connectionString,
});

const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

async function main() {
  for (const product of seedProducts) {
    const existingProduct = await prisma.product.findFirst({
      where: {
        name: product.name,
      },
    });

    if (existingProduct) {
      await prisma.product.update({
        where: {
          id: existingProduct.id,
        },
        data: {
          price: product.price,
          active: product.active,
        },
      });

      continue;
    }

    await prisma.product.create({
      data: product,
    });
  }

  console.log("Seed de produtos executado com sucesso.");
}

main()
  .catch((error) => {
    console.error("Erro ao executar seed de produtos:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
