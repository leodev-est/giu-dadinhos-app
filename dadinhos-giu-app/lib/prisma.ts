import "dotenv/config";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaClient } = require("../node_modules/.prisma/client") as {
  PrismaClient: new (options: unknown) => unknown;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaPg } = require("@prisma/adapter-pg") as {
  PrismaPg: new (pool: unknown) => unknown;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Pool } = require("pg") as {
  Pool: new (config: { connectionString: string }) => unknown;
};

type PrismaDb = {
  $transaction: <T>(callback: (tx: PrismaDb) => Promise<T>) => Promise<T>;
  customer: {
    findFirst: (args: unknown) => Promise<unknown>;
    upsert: (args: unknown) => Promise<unknown>;
    update: (args: unknown) => Promise<unknown>;
    create: (args: unknown) => Promise<unknown>;
  };
  product: {
    create: (args: unknown) => Promise<unknown>;
    findMany: (args: unknown) => Promise<unknown[]>;
    findUnique: (args: unknown) => Promise<unknown>;
    update: (args: unknown) => Promise<unknown>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
  order: {
    create: (args: unknown) => Promise<unknown>;
    findFirst: (args: unknown) => Promise<unknown>;
    findMany: (args: unknown) => Promise<unknown[]>;
    findUnique: (args: unknown) => Promise<unknown>;
    update: (args: unknown) => Promise<unknown>;
  };
};

const globalForPrisma = globalThis as {
  prisma?: PrismaDb;
};

function createPrismaClient(): PrismaDb {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL nao configurada.");
  }

  const pool = new Pool({
    connectionString,
  });

  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
  }) as PrismaDb;
}

export const prisma: PrismaDb = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
