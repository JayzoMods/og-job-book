import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "@/db/client";
import { issueRecurringInvoice } from "@/db/queries";
import { parseRedisUrl } from "@/lib/ledger/queue";
import { todayIsoSydney } from "@/lib/ledger/tax";
import { createIssueRecurringWorker } from "@/lib/queue/bullmq";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function loadEnvKey(name: string) {
  if (process.env[name]?.trim()) {
    return;
  }
  const envPath = join(repoRoot, ".env.local");
  if (!existsSync(envPath)) {
    return;
  }
  const line = readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((row) => row.startsWith(`${name}=`));
  if (!line) {
    return;
  }
  const value = line.slice(`${name}=`.length).trim().replace(/^['"]|['"]$/g, "");
  if (value) {
    process.env[name] = value;
  }
}

loadEnvKey("DATABASE_URL");
loadEnvKey("REDIS_URL");

if (!parseRedisUrl(process.env.REDIS_URL)) {
  console.error("REDIS_URL is not set. Queue worker is off.");
  process.exit(1);
}

const db = getDb();
if (!db) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const worker = createIssueRecurringWorker(async (recurringInvoiceId) => {
  const outcome = await issueRecurringInvoice(db, {
    recurringId: recurringInvoiceId,
    today: todayIsoSydney(),
    requireDue: true,
  });
  if (outcome.ok) {
    console.log(`Issued ${outcome.docNumber} for ${recurringInvoiceId}`);
    return;
  }
  if (outcome.reason === "missing" || outcome.reason === "not_due") {
    return;
  }
});

worker.on("error", (error) => {
  console.error(error);
});

console.log("OG Job Book queue worker listening");
