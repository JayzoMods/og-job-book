import { createHash } from "node:crypto";

export const KIT_JOURNAL_RELATIVE = "drizzle/meta/_journal.json";

export const LEDGER_TABLES = [
  "orgs",
  "customers",
  "jobs",
  "quotes",
  "quote_lines",
  "recurring_invoices",
  "recurring_invoice_lines",
  "invoices",
  "invoice_lines",
  "credit_notes",
  "credit_note_lines",
  "payments",
  "rate_card_items",
] as const;

export const CUSTOMERS_UNIQUE_INDEX = "customers_org_id_name_suburb_key";
export const RATE_CARD_UNIQUE_INDEX = "rate_card_items_org_id_description_unit_key";

export type KitJournalEntry = {
  tag: string;
  when: number;
  breakpoints: boolean;
};

export type KitJournal = {
  entries: KitJournalEntry[];
};

/** Empty, whitespace, junk JSON, or a journal with no usable tags → null. */
export function parseKitJournal(raw: string | null | undefined): KitJournal | null {
  const trimmed = String(raw ?? "").trim();
  if (trimmed === "") {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const entries = (parsed as { entries?: unknown }).entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    return null;
  }
  const mapped: KitJournalEntry[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return null;
    }
    const tag = (entry as { tag?: unknown }).tag;
    const when = (entry as { when?: unknown }).when;
    if (typeof tag !== "string" || tag.trim() === "") {
      return null;
    }
    if (typeof when !== "number" || !Number.isFinite(when)) {
      return null;
    }
    mapped.push({
      tag: tag.trim(),
      when,
      breakpoints: Boolean((entry as { breakpoints?: unknown }).breakpoints),
    });
  }
  return { entries: mapped };
}

/**
 * Existing local DBs were created by the old “run every .sql” script and have
 * no drizzle-kit log. Record the current journal without re-running CREATE.
 * Fresh databases (CI, new docker volume) skip this and run migrate.
 */
export function baselineShouldRun(
  orgsTableExists: boolean,
  appliedCount: number | null,
): boolean {
  if (appliedCount === null || appliedCount < 0 || !Number.isInteger(appliedCount)) {
    return false;
  }
  return orgsTableExists && appliedCount === 0;
}

export function sqlFileHash(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

export function journalSqlFileName(tag: string): string | null {
  const trimmed = tag.trim();
  if (trimmed === "" || trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("..")) {
    return null;
  }
  return `${trimmed}.sql`;
}
