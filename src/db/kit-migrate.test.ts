import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { customers, invoices, jobs, quotes, rateCardItems } from "./schema";
import {
  CUSTOMERS_UNIQUE_INDEX,
  LEDGER_TABLES,
  RATE_CARD_UNIQUE_INDEX,
  baselineShouldRun,
  journalSqlFileName,
  parseKitJournal,
  sqlFileHash,
} from "./kit-migrate";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const drizzleDir = join(repoRoot, "drizzle");
const journalPath = join(drizzleDir, "meta/_journal.json");

describe("parseKitJournal", () => {
  it("rejects empty and whitespace", () => {
    expect(parseKitJournal("")).toBeNull();
    expect(parseKitJournal("   ")).toBeNull();
    expect(parseKitJournal(null)).toBeNull();
    expect(parseKitJournal(undefined)).toBeNull();
  });

  it("rejects junk JSON and a journal with no entries", () => {
    expect(parseKitJournal("{")).toBeNull();
    expect(parseKitJournal("[]")).toBeNull();
    expect(parseKitJournal("{}")).toBeNull();
    expect(parseKitJournal('{"entries":[]}')).toBeNull();
    expect(parseKitJournal('{"entries":[{"tag":"","when":1}]}')).toBeNull();
    expect(parseKitJournal('{"entries":[{"tag":"0000_init","when":"now"}]}')).toBeNull();
  });

  it("accepts a drizzle-kit journal with one tag", () => {
    expect(
      parseKitJournal(
        '{"version":"7","dialect":"postgresql","entries":[{"idx":0,"version":"7","when":1,"tag":"0000_init","breakpoints":true}]}',
      ),
    ).toEqual({
      entries: [{ tag: "0000_init", when: 1, breakpoints: true }],
    });
  });
});

describe("baselineShouldRun", () => {
  it("baselines only when orgs already exist and the kit log is empty", () => {
    expect(baselineShouldRun(true, 0)).toBe(true);
    expect(baselineShouldRun(false, 0)).toBe(false);
    expect(baselineShouldRun(true, 1)).toBe(false);
    expect(baselineShouldRun(true, null)).toBe(false);
    expect(baselineShouldRun(true, -1)).toBe(false);
    expect(baselineShouldRun(true, 1.5)).toBe(false);
  });
});

describe("journalSqlFileName", () => {
  it("rejects empty and path-shaped tags", () => {
    expect(journalSqlFileName("")).toBeNull();
    expect(journalSqlFileName("  ")).toBeNull();
    expect(journalSqlFileName("../secret")).toBeNull();
    expect(journalSqlFileName("foo/bar")).toBeNull();
  });

  it("maps a kit tag to a .sql file in drizzle/", () => {
    expect(journalSqlFileName("0000_init")).toBe("0000_init.sql");
  });
});

describe("sqlFileHash", () => {
  it("hashes empty SQL and is stable", () => {
    expect(sqlFileHash("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sqlFileHash("CREATE TABLE orgs ();")).toBe(
      sqlFileHash("CREATE TABLE orgs ();"),
    );
  });
});

describe("schema unique indexes and self-FKs", () => {
  it("keeps the live unique index names on customers and the rate card", () => {
    const customerIndexes = getTableConfig(customers).indexes.map(
      (index) => index.config.name,
    );
    const rateIndexes = getTableConfig(rateCardItems).indexes.map(
      (index) => index.config.name,
    );
    expect(customerIndexes).toContain(CUSTOMERS_UNIQUE_INDEX);
    expect(rateIndexes).toContain(RATE_CARD_UNIQUE_INDEX);
  });

  it("declares the self and recurring foreign keys that handwritten SQL already had", () => {
    const jobFks = getTableConfig(jobs).foreignKeys.map((fk) =>
      fk.reference().columns.map((column) => column.name).join(","),
    );
    const quoteFks = getTableConfig(quotes).foreignKeys.map((fk) =>
      fk.reference().columns.map((column) => column.name).join(","),
    );
    const invoiceFks = getTableConfig(invoices).foreignKeys.map((fk) =>
      fk.reference().columns.map((column) => column.name).join(","),
    );
    expect(jobFks).toContain("duplicated_from_job_id");
    expect(quoteFks).toContain("revised_from_quote_id");
    expect(invoiceFks).toContain("recurring_invoice_id");
  });
});

describe("drizzle-kit journal on disk", () => {
  it("is the path of record: journal tags match SQL, and SQL creates every ledger table", () => {
    expect(existsSync(journalPath)).toBe(true);
    const journal = parseKitJournal(readFileSync(journalPath, "utf8"));
    expect(journal).not.toBeNull();
    const migrations = readMigrationFiles({ migrationsFolder: drizzleDir });
    expect(migrations.length).toBe(journal!.entries.length);
    expect(migrations.length).toBeGreaterThanOrEqual(1);

    const sql = journal!.entries
      .map((entry) => {
        const name = journalSqlFileName(entry.tag);
        expect(name).not.toBeNull();
        const path = join(drizzleDir, name!);
        expect(existsSync(path)).toBe(true);
        const contents = readFileSync(path, "utf8");
        expect(sqlFileHash(contents)).toBe(migrations.find((row) => row.folderMillis === entry.when)?.hash);
        return contents;
      })
      .join("\n");

    for (const table of LEDGER_TABLES) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE(?: IF NOT EXISTS)? "${table}"`, "i"));
    }
    expect(sql).toContain(CUSTOMERS_UNIQUE_INDEX);
    expect(sql).toContain(RATE_CARD_UNIQUE_INDEX);
  });
});
