import { eq, sql } from "drizzle-orm";
import { formatDocNumber } from "../lib/ledger/numbers";
import type { AppDb } from "./client";
import { orgs } from "./schema";

type AppTx = Parameters<Parameters<AppDb["transaction"]>[0]>[0];

export async function allocateDocNumber(
  db: AppDb | AppTx,
  orgId: string,
  kind: "quote" | "invoice" | "credit",
): Promise<string> {
  if (kind === "quote") {
    const [row] = await db
      .update(orgs)
      .set({ nextQuoteSeq: sql`${orgs.nextQuoteSeq} + 1` })
      .where(eq(orgs.id, orgId))
      .returning({ seq: orgs.nextQuoteSeq });
    if (!row) {
      throw new Error("Organisation not found.");
    }
    return formatDocNumber("Q", row.seq);
  }
  if (kind === "credit") {
    const [row] = await db
      .update(orgs)
      .set({ nextCreditSeq: sql`${orgs.nextCreditSeq} + 1` })
      .where(eq(orgs.id, orgId))
      .returning({ seq: orgs.nextCreditSeq });
    if (!row) {
      throw new Error("Organisation not found.");
    }
    return formatDocNumber("CN", row.seq);
  }
  const [row] = await db
    .update(orgs)
    .set({ nextInvoiceSeq: sql`${orgs.nextInvoiceSeq} + 1` })
    .where(eq(orgs.id, orgId))
    .returning({ seq: orgs.nextInvoiceSeq });
  if (!row) {
    throw new Error("Organisation not found.");
  }
  return formatDocNumber("INV", row.seq);
}
