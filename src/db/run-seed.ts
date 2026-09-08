import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "./client";
import { seedDemo } from "./seed";

const root = dirname(fileURLToPath(import.meta.url));

function loadDatabaseUrlFromEnvFile() {
  const envPath = join(root, "../../.env.local");
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

const db = getDb();
if (!db) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

void seedDemo(db).then(() => {
  console.log("Seeded Harbourline Inspections demo org");
  process.exit(0);
});
