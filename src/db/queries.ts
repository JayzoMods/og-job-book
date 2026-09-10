import { and, asc, eq, inArray } from "drizzle-orm";
import { orgOwnsResource } from "@/lib/ledger/auth";
import { nextJobStatusFromInvoices } from "@/lib/ledger/claim";
import { creditedCentsFromNotes, invoiceBalanceCents } from "@/lib/ledger/credit";
import { canIssueRecurring, nextIssueOn, recurringIsDue } from "@/lib/ledger/recurring";
import { parseShareToken } from "@/lib/ledger/share";
import {
  computeDocument,
  parseAmountKind,
  parseLineUnit,
  parseTaxCode,
  type DocumentTotals,
  type LineInput,
  type PaymentMethod,
} from "@/lib/ledger/tax";
import { dueDateFromTerms, parsePaymentTermsDays } from "@/lib/ledger/terms";
import { allocateDocNumber } from "./allocate";
import type { AppDb } from "./client";
import {
  creditNoteLines,
  creditNotes,
  customers,
  invoiceLines,
  invoices,
  jobs,
  orgMembers,
  orgs,
  payments,
  quoteLines,
  quotes,
  rateCardItems,
  recurringInvoiceLines,
  recurringInvoices,
} from "./schema";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(id: string): boolean {
  return UUID_RE.test(id);
}

export type OrgRow = typeof orgs.$inferSelect;
export type CustomerRow = typeof customers.$inferSelect;
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
  unitCostCents?: number | null;
  taxCode: string;
  amountKind: string;
  sortOrder: number;
};

export type JobWithCustomer = JobRow & {
  customerName: string;
  suburb: string;
  customerPhone: string;
  customerEmail: string;
};

export type CustomerWithJobCount = CustomerRow & {
  jobCount: number;
};

export type QuoteWithTotals = QuoteRow & {
  lines: LineRow[];
  totals: DocumentTotals;
  revisedFromDocNumber: string | null;
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

export async function getOrgById(db: AppDb, orgId: string): Promise<OrgRow | null> {
  const [org] = await db.select().from(orgs).where(eq(orgs.id, orgId)).limit(1);
  return org ?? null;
}

export async function getOrgForClerkUser(
  db: AppDb,
  clerkUserId: string,
): Promise<OrgRow | null> {
  const [row] = await db
    .select({ org: orgs })
    .from(orgMembers)
    .innerJoin(orgs, eq(orgMembers.orgId, orgs.id))
    .where(eq(orgMembers.clerkUserId, clerkUserId))
    .limit(1);
  return row?.org ?? null;
}

export async function getCustomer(
  db: AppDb,
  customerId: string,
): Promise<CustomerRow | null> {
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  return customer ?? null;
}

export async function listCustomers(
  db: AppDb,
  orgId: string,
): Promise<CustomerWithJobCount[]> {
  const customerRows = await db
    .select()
    .from(customers)
    .where(eq(customers.orgId, orgId))
    .orderBy(asc(customers.name), asc(customers.suburb));
  const jobRows = await db
    .select({ customerId: jobs.customerId })
    .from(jobs)
    .where(eq(jobs.orgId, orgId));
  const counts = new Map<string, number>();
  for (const row of jobRows) {
    counts.set(row.customerId, (counts.get(row.customerId) ?? 0) + 1);
  }
  return customerRows.map((row) => ({
    ...row,
    jobCount: counts.get(row.id) ?? 0,
  }));
}

export async function findCustomerByNameSuburb(
  db: AppDb,
  orgId: string,
  name: string,
  suburb: string,
): Promise<CustomerRow | null> {
  const [customer] = await db
    .select()
    .from(customers)
    .where(
      and(
        eq(customers.orgId, orgId),
        eq(customers.name, name),
        eq(customers.suburb, suburb),
      ),
    )
    .limit(1);
  return customer ?? null;
}

export async function findOrCreateCustomer(
  db: AppDb,
  orgId: string,
  name: string,
  suburb: string,
  contact: { phone: string; email: string } = { phone: "", email: "" },
): Promise<string> {
  const existing = await findCustomerByNameSuburb(db, orgId, name, suburb);
  if (existing) {
    return existing.id;
  }
  try {
    const [created] = await db
      .insert(customers)
      .values({
        orgId,
        name,
        suburb,
        phone: contact.phone,
        email: contact.email,
      })
      .returning({ id: customers.id });
    if (created) {
      return created.id;
    }
  } catch {
    const raced = await findCustomerByNameSuburb(db, orgId, name, suburb);
    if (raced) {
      return raced.id;
    }
  }
  const fallback = await findCustomerByNameSuburb(db, orgId, name, suburb);
  if (!fallback) {
    throw new Error("Could not create customer.");
  }
  return fallback.id;
}

function toJobWithCustomer(row: {
  job: JobRow;
  customerName: string;
  suburb: string;
  customerPhone: string;
  customerEmail: string;
}): JobWithCustomer {
  return {
    ...row.job,
    customerName: row.customerName,
    suburb: row.suburb,
    customerPhone: row.customerPhone,
    customerEmail: row.customerEmail,
  };
}

export async function listJobs(db: AppDb, orgId: string): Promise<JobWithCustomer[]> {
  const rows = await db
    .select({
      job: jobs,
      customerName: customers.name,
      suburb: customers.suburb,
      customerPhone: customers.phone,
      customerEmail: customers.email,
    })
    .from(jobs)
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .where(eq(jobs.orgId, orgId))
    .orderBy(asc(jobs.createdAt));
  return rows.map(toJobWithCustomer);
}

export async function listJobsForCustomer(
  db: AppDb,
  customerId: string,
): Promise<JobWithCustomer[]> {
  const rows = await db
    .select({
      job: jobs,
      customerName: customers.name,
      suburb: customers.suburb,
      customerPhone: customers.phone,
      customerEmail: customers.email,
    })
    .from(jobs)
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .where(eq(jobs.customerId, customerId))
    .orderBy(asc(jobs.createdAt));
  return rows.map(toJobWithCustomer);
}

export async function getInvoicesForCustomer(
  db: AppDb,
  customerId: string,
): Promise<Array<InvoiceWithTotals & { jobDescription: string }>> {
  const jobList = await listJobsForCustomer(db, customerId);
  const lists = await Promise.all(
    jobList.map(async (job) => {
      const invoices = await getInvoicesForJob(db, job.id);
      return invoices.map((invoice) => ({
        ...invoice,
        jobDescription: job.description,
      }));
    }),
  );
  return lists.flat();
}

export async function getJob(db: AppDb, jobId: string): Promise<JobWithCustomer | null> {
  const [row] = await db
    .select({
      job: jobs,
      customerName: customers.name,
      suburb: customers.suburb,
      customerPhone: customers.phone,
      customerEmail: customers.email,
    })
    .from(jobs)
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .where(eq(jobs.id, jobId))
    .limit(1);
  return row ? toJobWithCustomer(row) : null;
}

export async function getJobInOrg(
  db: AppDb,
  jobId: string,
  orgId: string,
): Promise<JobWithCustomer | null> {
  const job = await getJob(db, jobId);
  if (!job || !orgOwnsResource(job.orgId, orgId)) {
    return null;
  }
  return job;
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

async function lookupRevisedFromDocNumber(
  db: AppDb,
  revisedFromQuoteId: string | null,
  known?: Map<string, string>,
): Promise<string | null> {
  if (!revisedFromQuoteId) {
    return null;
  }
  const cached = known?.get(revisedFromQuoteId);
  if (cached) {
    return cached;
  }
  const [source] = await db
    .select({ docNumber: quotes.docNumber })
    .from(quotes)
    .where(eq(quotes.id, revisedFromQuoteId))
    .limit(1);
  return source?.docNumber ?? null;
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
    revisedFromDocNumber: await lookupRevisedFromDocNumber(db, quote.revisedFromQuoteId),
  };
}

export async function getQuoteByShareToken(
  db: AppDb,
  token: string,
): Promise<QuoteWithTotals | null> {
  const parsed = parseShareToken(token);
  if (!parsed) {
    return null;
  }
  const [quote] = await db
    .select()
    .from(quotes)
    .where(eq(quotes.shareToken, parsed))
    .limit(1);
  if (!quote) {
    return null;
  }
  return getQuoteById(db, quote.id);
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
  const numbers = new Map(quoteRows.map((quote) => [quote.id, quote.docNumber]));

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
      revisedFromDocNumber: await lookupRevisedFromDocNumber(
        db,
        quote.revisedFromQuoteId,
        numbers,
      ),
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

export async function syncJobStatus(db: AppDb, jobId: string): Promise<void> {
  const job = await getJob(db, jobId);
  if (!job || job.status === "cancelled") {
    return;
  }
  const invoiceList = await getInvoicesForJob(db, jobId);
  const next = nextJobStatusFromInvoices(invoiceList);
  if (job.status !== next) {
    await db.update(jobs).set({ status: next }).where(eq(jobs.id, jobId));
  }
}

export async function recordInvoicePayment(
  db: AppDb,
  invoice: InvoiceWithTotals,
  input: { amountCents: number; paidOn: string; method: PaymentMethod },
): Promise<{ paymentId: string; remainingCents: number; invoiceStatus: string }> {
  const [row] = await db
    .insert(payments)
    .values({
      invoiceId: invoice.id,
      amountCents: input.amountCents,
      paidOn: input.paidOn,
      method: input.method,
    })
    .returning({ id: payments.id });
  if (!row) {
    throw new Error("Payment insert failed.");
  }
  const remainingCents = invoiceBalanceCents(
    invoice.totals.totalCents,
    invoice.paidCents + input.amountCents,
    invoice.creditedCents,
    invoice.retentionHeldCents,
  );
  let invoiceStatus = invoice.status;
  if (remainingCents <= 0 && invoice.totals.totalCents > 0) {
    await db.update(invoices).set({ status: "paid" }).where(eq(invoices.id, invoice.id));
    invoiceStatus = "paid";
  }
  await syncJobStatus(db, invoice.jobId);
  return { paymentId: row.id, remainingCents, invoiceStatus };
}

export type JobLedger = {
  job: JobWithCustomer;
  quotes: QuoteWithTotals[];
  invoices: InvoiceWithTotals[];
};

export async function getLedgerForOrg(db: AppDb, orgId: string): Promise<JobLedger[]> {
  const jobList = await listJobs(db, orgId);
  return Promise.all(
    jobList.map(async (job) => ({
      job,
      quotes: await getQuotesForJob(db, job.id),
      invoices: await getInvoicesForJob(db, job.id),
    })),
  );
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

export type RecurringRow = typeof recurringInvoices.$inferSelect;

export type RecurringWithTotals = RecurringRow & {
  lines: LineRow[];
  totals: DocumentTotals;
};

export type RecurringDueRow = RecurringWithTotals & {
  jobDescription: string;
  customerName: string;
  suburb: string;
  jobStatus: string;
};

export type RateCardItemRow = typeof rateCardItems.$inferSelect;

export async function listRateItems(db: AppDb, orgId: string): Promise<RateCardItemRow[]> {
  return db
    .select()
    .from(rateCardItems)
    .where(eq(rateCardItems.orgId, orgId))
    .orderBy(asc(rateCardItems.sortOrder), asc(rateCardItems.description));
}

export async function getRateItemsByIds(
  db: AppDb,
  orgId: string,
  ids: string[],
): Promise<RateCardItemRow[]> {
  if (ids.length === 0) {
    return [];
  }
  const rows = await db
    .select()
    .from(rateCardItems)
    .where(and(eq(rateCardItems.orgId, orgId), inArray(rateCardItems.id, ids)));
  const order = new Map(ids.map((id, index) => [id, index]));
  return rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

async function withRecurringLines(
  db: AppDb,
  row: RecurringRow,
  gstRegistered: boolean,
): Promise<RecurringWithTotals> {
  const lines = await db
    .select()
    .from(recurringInvoiceLines)
    .where(eq(recurringInvoiceLines.recurringInvoiceId, row.id))
    .orderBy(asc(recurringInvoiceLines.sortOrder));
  return {
    ...row,
    lines,
    totals: computeDocument(lines.map(toLineInput), gstRegistered),
  };
}

export async function getRecurringForJob(
  db: AppDb,
  jobId: string,
): Promise<RecurringWithTotals[]> {
  const rows = await db
    .select()
    .from(recurringInvoices)
    .where(eq(recurringInvoices.jobId, jobId))
    .orderBy(asc(recurringInvoices.nextIssueOn), asc(recurringInvoices.createdAt));
  const gstRegistered = await gstRegisteredForJob(db, jobId);
  const result: RecurringWithTotals[] = [];
  for (const row of rows) {
    result.push(await withRecurringLines(db, row, gstRegistered));
  }
  return result;
}

export async function getRecurringById(
  db: AppDb,
  recurringId: string,
): Promise<RecurringWithTotals | null> {
  const [row] = await db
    .select()
    .from(recurringInvoices)
    .where(eq(recurringInvoices.id, recurringId))
    .limit(1);
  if (!row) {
    return null;
  }
  const gstRegistered = await gstRegisteredForJob(db, row.jobId);
  return withRecurringLines(db, row, gstRegistered);
}

export async function listRecurringForOrg(
  db: AppDb,
  orgId: string,
): Promise<RecurringDueRow[]> {
  const rows = await db
    .select({
      recurring: recurringInvoices,
      jobDescription: jobs.description,
      jobStatus: jobs.status,
      customerName: customers.name,
      suburb: customers.suburb,
      gstRegistered: orgs.gstRegistered,
    })
    .from(recurringInvoices)
    .innerJoin(jobs, eq(recurringInvoices.jobId, jobs.id))
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .innerJoin(orgs, eq(jobs.orgId, orgs.id))
    .where(eq(jobs.orgId, orgId))
    .orderBy(asc(recurringInvoices.nextIssueOn), asc(recurringInvoices.createdAt));
  const result: RecurringDueRow[] = [];
  for (const row of rows) {
    const withLines = await withRecurringLines(db, row.recurring, row.gstRegistered);
    result.push({
      ...withLines,
      jobDescription: row.jobDescription,
      customerName: row.customerName,
      suburb: row.suburb,
      jobStatus: row.jobStatus,
    });
  }
  return result;
}

class RecurringIssueRace extends Error {
  constructor() {
    super("recurring issue race");
  }
}

export type IssueRecurringOutcome =
  | {
      ok: true;
      invoiceId: string;
      docNumber: string;
      jobId: string;
      nextIssueOn: string;
    }
  | { ok: false; reason: "missing" | "not_due" };

export async function issueRecurringInvoice(
  db: AppDb,
  input: {
    recurringId: string;
    today: string;
    orgId?: string;
    requireDue: boolean;
  },
): Promise<IssueRecurringOutcome> {
  const template = await getRecurringById(db, input.recurringId);
  if (!template) {
    return { ok: false, reason: "missing" };
  }
  const job = input.orgId
    ? await getJobInOrg(db, template.jobId, input.orgId)
    : await getJob(db, template.jobId);
  if (!job) {
    return { ok: false, reason: "missing" };
  }
  const org = await getOrgById(db, job.orgId);
  if (!org) {
    return { ok: false, reason: "missing" };
  }
  const gate = {
    status: template.status,
    frequency: template.frequency,
    nextIssueOn: template.nextIssueOn,
    endOn: template.endOn,
    hasLines: template.lines.length > 0,
    jobStatus: job.status,
  };
  if (input.requireDue) {
    if (!recurringIsDue(gate, input.today)) {
      return { ok: false, reason: "not_due" };
    }
  } else if (!canIssueRecurring(gate)) {
    return { ok: false, reason: "not_due" };
  }
  const advanced = nextIssueOn(template.nextIssueOn, template.frequency);
  if (!advanced) {
    return { ok: false, reason: "not_due" };
  }
  const termsDays = parsePaymentTermsDays(org.paymentTermsDays);
  const dueDate = dueDateFromTerms(input.today, termsDays);
  try {
    return await db.transaction(async (tx) => {
      const docNumber = await allocateDocNumber(tx, job.orgId, "invoice");
      const [invoice] = await tx
        .insert(invoices)
        .values({
          jobId: job.id,
          quoteId: null,
          recurringInvoiceId: template.id,
          docNumber,
          status: "sent",
          dueDate,
          paymentTermsDays: termsDays,
          kind: "recurring",
          claimPercent: null,
          retentionPercent: 0,
          retentionHeldCents: 0,
        })
        .returning({ id: invoices.id });
      if (!invoice) {
        throw new Error("invoice insert failed");
      }
      await tx.insert(invoiceLines).values(
        template.lines.map((line, index) => ({
          invoiceId: invoice.id,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          unitPriceCents: line.unitPriceCents,
          taxCode: line.taxCode,
          amountKind: line.amountKind,
          sortOrder: index,
        })),
      );
      await tx.update(jobs).set({ status: "invoiced" }).where(eq(jobs.id, job.id));
      const [moved] = await tx
        .update(recurringInvoices)
        .set({ nextIssueOn: advanced })
        .where(
          and(
            eq(recurringInvoices.id, template.id),
            eq(recurringInvoices.nextIssueOn, template.nextIssueOn),
          ),
        )
        .returning({ id: recurringInvoices.id });
      if (!moved) {
        throw new RecurringIssueRace();
      }
      return {
        ok: true as const,
        invoiceId: invoice.id,
        docNumber,
        jobId: job.id,
        nextIssueOn: advanced,
      };
    });
  } catch (error) {
    if (error instanceof RecurringIssueRace) {
      return { ok: false, reason: "not_due" };
    }
    throw error;
  }
}
