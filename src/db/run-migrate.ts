import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import {
  baselineShouldRun,
  journalSqlFileName,
  parseKitJournal,
  sqlFileHash,
} from "./kit-migrate";

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(root, "../..");
const drizzleDir = join(repoRoot, "drizzle");

function loadDatabaseUrlFromEnvFile() {
  const envPath = join(repoRoot, ".env.local");
  if (!existsSync(envPath)) {
    return;
  }
  const line = readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((row) => row.startsWith("DATABASE_URL="));
  if (!line) {
    return;
  }
  const value = line.slice("DATABASE_URL=".length).trim().replace(/^['"]|['"]$/g, "");
  if (value && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = value;
  }
}

loadDatabaseUrlFromEnvFile();

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const journalPath = join(drizzleDir, "meta/_journal.json");
if (!existsSync(journalPath)) {
  console.error("Missing drizzle/meta/_journal.json. Run npm run db:generate.");
  process.exit(1);
}

const journal = parseKitJournal(readFileSync(journalPath, "utf8"));
if (!journal) {
  console.error("drizzle/meta/_journal.json is empty or junk.");
  process.exit(1);
}

const needsSsl = url.includes("sslmode=require") || url.includes("neon.tech");
const pool = new Pool({
  connectionString: url,
  max: 1,
  ssl: needsSsl ? { rejectUnauthorized: true } : undefined,
});

async function tableExists(schema: string, name: string): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    `select exists (
      select 1
      from information_schema.tables
      where table_schema = $1 and table_name = $2
    ) as exists`,
    [schema, name],
  );
  return Boolean(result.rows[0]?.exists);
}

async function appliedCount(): Promise<number | null> {
  if (!(await tableExists("drizzle", "__drizzle_migrations"))) {
    return 0;
  }
  const result = await pool.query<{ n: number }>(
    `select count(*)::int as n from drizzle.__drizzle_migrations`,
  );
  const n = result.rows[0]?.n;
  return typeof n === "number" && Number.isInteger(n) ? n : null;
}

async function baselineExistingSchema() {
  await pool.query(`create schema if not exists drizzle`);
  await pool.query(`
    create table if not exists drizzle.__drizzle_migrations (
      id serial primary key,
      hash text not null,
      created_at bigint
    )
  `);
  for (const entry of journal!.entries) {
    const fileName = journalSqlFileName(entry.tag);
    if (!fileName) {
      throw new Error(`Unsafe journal tag: ${entry.tag}`);
    }
    const sql = readFileSync(join(drizzleDir, fileName), "utf8");
    await pool.query(
      `insert into drizzle.__drizzle_migrations ("hash", "created_at") values ($1, $2)`,
      [sqlFileHash(sql), entry.when],
    );
  }
  console.log("Baselined existing schema onto the drizzle-kit journal");
}

async function apply() {
  try {
    const orgsExists = await tableExists("public", "orgs");
    const applied = await appliedCount();
    if (baselineShouldRun(orgsExists, applied)) {
      await baselineExistingSchema();
    }
    await migrate(drizzle(pool), { migrationsFolder: drizzleDir });
    console.log("Applied drizzle-kit migrations");
  } finally {
    await pool.end();
  }
}

void apply().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
