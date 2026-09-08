import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const root = dirname(fileURLToPath(import.meta.url));
const drizzleDir = join(root, "../drizzle");

function databaseUrlFromEnvFile() {
  const envPath = join(root, "../.env.local");
  if (!existsSync(envPath)) {
    return undefined;
  }
  const line = readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((row) => row.startsWith("DATABASE_URL="));
  if (!line) {
    return undefined;
  }
  return line.slice("DATABASE_URL=".length).trim().replace(/^['"]|['"]$/g, "");
}

const url = process.env.DATABASE_URL?.trim() || databaseUrlFromEnvFile();
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const files = readdirSync(drizzleDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

const needsSsl = url.includes("sslmode=require") || url.includes("neon.tech");
const client = new Client({
  connectionString: url,
  ssl: needsSsl ? { rejectUnauthorized: true } : undefined,
});

await client.connect();
for (const file of files) {
  const sql = readFileSync(join(drizzleDir, file), "utf8");
  await client.query(sql);
  console.log(`Applied drizzle/${file}`);
}
await client.end();
