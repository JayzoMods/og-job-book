import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type AppDb = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as typeof globalThis & {
  jobBookPool?: Pool;
  jobBookDb?: AppDb;
};

export function databaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL?.trim();
  return url ? url : undefined;
}

/** Neon and sslmode=require need TLS. Local Docker on 5433 does not. */
export function databaseNeedsSsl(url: string): boolean {
  return url.includes("sslmode=require") || url.includes("neon.tech");
}

export function getDb(): AppDb | null {
  const url = databaseUrl();
  if (!url) {
    return null;
  }
  if (!globalForDb.jobBookPool) {
    globalForDb.jobBookPool = new Pool({
      connectionString: url,
      max: 1,
      connectionTimeoutMillis: 3000,
      ssl: databaseNeedsSsl(url) ? { rejectUnauthorized: true } : undefined,
    });
    globalForDb.jobBookDb = drizzle({ client: globalForDb.jobBookPool, schema });
  }
  return globalForDb.jobBookDb ?? null;
}
