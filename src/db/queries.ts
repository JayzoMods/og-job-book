import { asc, eq } from "drizzle-orm";
import { creditedCentsFromNotes } from "@/lib/ledger/credit";
import {
  computeDocument,
  parseAmountKind,
  parseLineUnit,
  parseTaxCode,
  type DocumentTotals,
  type LineInput,
} from "@/lib/ledger/tax";
import type { AppDb } from "./client";
import {
  creditNoteLines,
  creditNotes,
  invoiceLines,
  invoices,
  jobs,
  orgs,
  payments,
  quoteLines,
  quotes,
} from "./schema";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(id: string): boolean {
  return UUID_RE.test(id);
}

export type OrgRow = typeof orgs.$inferSelect;
export type JobRow = typeof jobs.$inferSelect;
export type QuoteRow = typeof quotes.$inferSelect;
export type InvoiceRow = typeof invoices.$inferSelect;
export type PaymentRow = typeof payments.$inferSelect;
export type LineRow = {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPriceCents: number;
  taxCode: string;
  amountKind: string;
  sortOrder: number;
};

export type QuoteWithTotals = QuoteRow & {
  lines: LineRow[];
  totals: DocumentTotals;
};

export type CreditNoteRow = typeof creditNotes.$inferSelect;

export type CreditNoteWithTotals = CreditNoteRow & {
  lines: LineRow[];
  totals: DocumentTotals;
  againstDocNumber: string;
};

export type InvoiceWithTotals = InvoiceRow & {
  lines: LineRow[];
  totals: DocumentTotals;
  paidCents: number;
  creditedCents: number;
  payments: PaymentRow[];
  creditNotes: CreditNoteWithTotals[];
};

export async function getOrg(db: AppDb): Promise<OrgRow | null> {
  const [org] = await db.select().from(orgs).orderBy(asc(orgs.createdAt)).limit(1);
  return org ?? null;
}

export async function listJobs(db: AppDb, orgId: string): Promise<JobRow[]> {
  return db
    .select()
    .from(jobs)
    .where(eq(jobs.orgId, orgId))
    .orderBy(asc(jobs.createdAt));
}

export async function getJob(db: AppDb, jobId: string): Promise<JobRow | null> {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  return job ?? null;
}

async function gstRegisteredForJob(
  db: AppDb,
  jobId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ gstRegistered: orgs.gstRegistered })
    .from(jobs)
    .innerJoin(orgs, eq(jobs.orgId, orgs.id))
    .where(eq(jobs.id, jobId))
    .limit(1);
  return row?.gstRegistered ?? true;
}

function toLineInput(line: LineRow): LineInput {
  return {
    description: line.description,
    quantity: line.quantity,
    unitPriceCents: line.unitPriceCents,
    unit: parseLineUnit(line.unit),
    taxCode: parseTaxCode(line.taxCode) ?? "GST",
    amountKind: parseAmountKind(line.amountKind),
  };
}

async function loadCreditNotesForInvoice(
  db: AppDb,
  invoice: { id: string; docNumber: string },
  gstRegistered: boolean,
): Promise<CreditNoteWithTotals[]> {
  const noteRows = await db
    .select()
    .from(creditNotes)
    .where(eq(creditNotes.invoiceId, invoice.id))
    .orderBy(asc(creditNotes.createdAt));
  const result: CreditNoteWithTotals[] = [];
  for (const note of noteRows) {
    const lines = await db
      .select()
      .from(creditNoteLines)
      .where(eq(creditNoteLines.creditNoteId, note.id))
      .orderBy(asc(creditNoteLines.sortOrder));
    result.push({
      ...note,
      lines,
      totals: computeDocument(lines.map(toLineInput), gstRegistered),
      againstDocNumber: invoice.docNumber,
    });
  }
  return result;
}

export async function getQuoteById(
  db: AppDb,
  quoteId: string,
): Promise<QuoteWithTotals | null> {
  const [quote] = await db.select().from(quotes).where(eq(quotes.id, quoteId)).limit(1);
  if (!quote) {
    return null;
  }
  const lines = await db
    .select()
    .from(quoteLines)
    .where(eq(quoteLines.quoteId, quote.id))
    .orderBy(asc(quoteLines.sortOrder));
  const gstRegistered = await gstRegisteredForJob(db, quote.jobId);
  return {
    ...quote,
    lines,
    totals: computeDocument(lines.map(toLineInput), gstRegistered),
  };
}

export async function getInvoiceById(
  db: AppDb,
  invoiceId: string,
): Promise<InvoiceWithTotals | null> {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  if (!invoice) {
    return null;
  }
  const lines = await db
    .select()
    .from(invoiceLines)
    .where(eq(invoiceLines.invoiceId, invoice.id))
    .orderBy(asc(invoiceLines.sortOrder));
  const paymentRows = await db
    .select()
    .from(payments)
    .where(eq(payments.invoiceId, invoice.id))
    .orderBy(asc(payments.paidOn));
  const paidCents = paymentRows.reduce((sum, row) => sum + row.amountCents, 0);
  const gstRegistered = await gstRegisteredForJob(db, invoice.jobId);
  const creditNoteList = await loadCreditNotesForInvoice(db, invoice, gstRegistered);
  return {
    ...invoice,
    lines,
    totals: computeDocument(lines.map(toLineInput), gstRegistered),
    paidCents,
    creditedCents: creditedCentsFromNotes(
      creditNoteList.map((note) => ({
        status: note.status,
        totalCents: note.totals.totalCents,
      })),
    ),
    payments: paymentRows,
    creditNotes: creditNoteList,
  };
}

export async function getQuotesForJob(
  db: AppDb,
  jobId: string,
): Promise<QuoteWithTotals[]> {
  const quoteRows = await db
    .select()
    .from(quotes)
    .where(eq(quotes.jobId, jobId))
    .orderBy(asc(quotes.createdAt));
  const gstRegistered = await gstRegisteredForJob(db, jobId);

  const result: QuoteWithTotals[] = [];
  for (const quote of quoteRows) {
    const lines = await db
      .select()
      .from(quoteLines)
      .where(eq(quoteLines.quoteId, quote.id))
      .orderBy(asc(quoteLines.sortOrder));
    result.push({
      ...quote,
      lines,
      totals: computeDocument(lines.map(toLineInput), gstRegistered),
    });
  }
  return result;
}

export async function getInvoicesForJob(
  db: AppDb,
  jobId: string,
): Promise<InvoiceWithTotals[]> {
  const invoiceRows = await db
    .select()
    .from(invoices)
    .where(eq(invoices.jobId, jobId))
    .orderBy(asc(invoices.createdAt));
  const gstRegistered = await gstRegisteredForJob(db, jobId);

  const result: InvoiceWithTotals[] = [];
  for (const invoice of invoiceRows) {
    const lines = await db
      .select()
      .from(invoiceLines)
      .where(eq(invoiceLines.invoiceId, invoice.id))
      .orderBy(asc(invoiceLines.sortOrder));
    const paymentRows = await db
      .select()
      .from(payments)
      .where(eq(payments.invoiceId, invoice.id))
      .orderBy(asc(payments.paidOn));
    const paidCents = paymentRows.reduce((sum, row) => sum + row.amountCents, 0);
    const creditNoteList = await loadCreditNotesForInvoice(db, invoice, gstRegistered);
    result.push({
      ...invoice,
      lines,
      totals: computeDocument(lines.map(toLineInput), gstRegistered),
      paidCents,
      creditedCents: creditedCentsFromNotes(
        creditNoteList.map((note) => ({
          status: note.status,
          totalCents: note.totals.totalCents,
        })),
      ),
      payments: paymentRows,
      creditNotes: creditNoteList,
    });
  }
  return result;
}

export async function getCreditNoteById(
  db: AppDb,
  creditNoteId: string,
): Promise<CreditNoteWithTotals | null> {
  const [note] = await db
    .select()
    .from(creditNotes)
    .where(eq(creditNotes.id, creditNoteId))
    .limit(1);
  if (!note) {
    return null;
  }
  const [invoice] = await db
    .select({ docNumber: invoices.docNumber })
    .from(invoices)
    .where(eq(invoices.id, note.invoiceId))
    .limit(1);
  const lines = await db
    .select()
    .from(creditNoteLines)
    .where(eq(creditNoteLines.creditNoteId, note.id))
    .orderBy(asc(creditNoteLines.sortOrder));
  const gstRegistered = await gstRegisteredForJob(db, note.jobId);
  return {
    ...note,
    lines,
    totals: computeDocument(lines.map(toLineInput), gstRegistered),
    againstDocNumber: invoice?.docNumber ?? "",
  };
}
