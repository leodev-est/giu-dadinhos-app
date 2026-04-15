import "dotenv/config";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Pool } = require("pg") as {
  Pool: new (config: { connectionString: string }) => {
    query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<{ exists: boolean }> }>;
    end: () => Promise<void>;
  };
};

let deliveryOrderColumnExistsPromise: Promise<boolean> | null = null;

export async function hasOrderDeliveryOrderColumn() {
  if (!deliveryOrderColumnExistsPromise) {
    deliveryOrderColumnExistsPromise = (async () => {
      const connectionString = process.env.DATABASE_URL;

      if (!connectionString) {
        return false;
      }

      const pool = new Pool({
        connectionString,
      });

      try {
        const result = await pool.query(
          `
            SELECT EXISTS (
              SELECT 1
              FROM information_schema.columns
              WHERE table_schema = 'public'
                AND table_name = 'Order'
                AND column_name = 'deliveryOrder'
            ) AS "exists"
          `,
        );

        return Boolean(result.rows[0]?.exists);
      } catch {
        return false;
      } finally {
        await pool.end();
      }
    })();
  }

  return deliveryOrderColumnExistsPromise;
}
