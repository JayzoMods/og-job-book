"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { dollarsToCents, parseAudAmount } from "@/lib/ledger/money";
import { eq } from "drizzle-orm";
import { allocateDocNumber } from "@/db/allocate";
import { getDb, type AppDb } from "@/db/client";
import {
  findOrCreateCustomer,
  getCustomer,
  getInvoicesForJob,
  getJob,
  getOrg,
  getQuotesForJob,
  getRateItemsByIds,
  getRecurringById,
  isUuid,
  listRateItems,
} from "@/db/queries";
import {
  creditNoteLines,
  creditNotes,
  customers,
  invoiceLines,
  invoices,
  jobs,
  orgs,
  payments,
  quoteLines,
  quotes,
  rateCardItems,
  recurringInvoiceLines,
  recurringInvoices,
} from "@/db/schema";
import { seedDemo } from "@/db/seed";
import {
  parseAmountKind,
  parseLineUnit,
  parseTaxCode,
  PAYMENT_METHODS,
  todayIsoSydney,
  computeDocument,
  type PaymentMethod,
} from "@/lib/ledger/tax";
import {
  creditExceedsBalance,
  invoiceBalanceCents,
  parseCreditReason,
} from "@/lib/ledger/credit";
import {
  claimedCentsFromInvoices,
  claimExceedsRemaining,
  claimLineDescription,
  claimTaxCode,
  netRetentionHeldCents,
  nextJobStatusFromInvoices,
  parseClaimPercent,
  parseInvoiceKind,
  parseRetentionPercent,
  percentOfCents,
  remainingContractCents,
  retentionHeldCents,
  type InvoiceKind,
} from "@/lib/ledger/claim";
import {
  parseAccountName,
  parseAccountNumber,
  parseBsb,
  parsePayId,
} from "@/lib/ledger/pay";
import { parseCustomerName, parseSuburb } from "@/lib/ledger/customer";
import { parseEmail, parseJobNotes, parsePhone } from "@/lib/ledger/contact";
import {
  mergeRateAndTypedLines,
  parseRateDescription,
  parseRatePriceCents,
  rateItemToLine,
} from "@/lib/ledger/rate-card";
import { parseCostCents } from "@/lib/ledger/markup";
import {
  canIssueRecurring,
  endOnBeforeNext,
  nextIssueOn,
  parseOptionalIsoDate,
  parseRecurringFrequency,
  parseRecurringStatus,
} from "@/lib/ledger/recurring";
import {
  canReviseQuote,
  duplicateJobFields,
  hasDraftRevision,
  liveInvoiceCountOnQuote,
  shouldSupersedeOnSend,
} from "@/lib/ledger/revise";
import {
  defaultQuoteValidUntil,
  dueDateFromTerms,
  parseIsoDate,
  parsePaymentTermsDays,
} from "@/lib/ledger/terms";

function requireDb(): AppDb {
  const db = getDb();
  if (!db) {
    redirect("/?error=db");
  }
  return db;
}

const orgSchema = z.object({
  name: z.string().trim().min(1).max(120),
  abn: z.string().trim().max(20),
  address: z.string().trim().min(1).max(200),
  gstRegistered: z.enum(["yes", "no"]),
  paymentTermsDays: z.string(),
  accountName: z.string(),
  bsb: z.string(),
  accountNumber: z.string(),
  payId: z.string(),
  retentionPercent: z.string(),
});

const jobSchema = z.object({
  customerId: z.string(),
  customerName: z.string(),
  suburb: z.string(),
  description: z.string().trim().min(1).max(500),
  phone: z.string(),
  email: z.string(),
  notes: z.string(),
});

const paymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.string(),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  method: z.enum(PAYMENT_METHODS),
});

export async function loadDemoAction() {
  const db = requireDb();
  try {
    await seedDemo(db);
  } catch {
    redirect("/?error=db");
  }
  revalidatePath("/");
  redirect("/");
}

export async function saveOrgAction(formData: FormData) {
  const parsed = orgSchema.safeParse({
    name: formData.get("name"),
    abn: formData.get("abn"),
    address: formData.get("address"),
    gstRegistered: formData.get("gstRegistered") === "yes" ? "yes" : "no",
    paymentTermsDays: formData.get("paymentTermsDays") ?? "",
    accountName: formData.get("accountName") ?? "",
    bsb: formData.get("bsb") ?? "",
    accountNumber: formData.get("accountNumber") ?? "",
    payId: formData.get("payId") ?? "",
    retentionPercent: formData.get("retentionPercent") ?? "",
  });
  if (!parsed.success) {
    redirect("/?error=org");
  }
  const db = requireDb();
  const existing = await getOrg(db);
  const values = {
    name: parsed.data.name,
    abn: parsed.data.abn,
    address: parsed.data.address,
    gstRegistered: parsed.data.gstRegistered === "yes",
    paymentTermsDays: parsePaymentTermsDays(parsed.data.paymentTermsDays),
    accountName: parseAccountName(parsed.data.accountName),
    bsb: parseBsb(parsed.data.bsb),
    accountNumber: parseAccountNumber(parsed.data.accountNumber),
    payId: parsePayId(parsed.data.payId),
    retentionPercent: parseRetentionPercent(parsed.data.retentionPercent),
  };
  if (existing) {
    await db.update(orgs).set(values).where(eq(orgs.id, existing.id));
  } else {
    await db.insert(orgs).values(values);
  }
  revalidatePath("/");
  revalidatePath("/", "layout");
  redirect("/");
}

export async function createJobAction(formData: FormData) {
  const parsed = jobSchema.safeParse({
    customerId: formData.get("customerId") ?? "",
    customerName: formData.get("customerName") ?? "",
    suburb: formData.get("suburb") ?? "",
    description: formData.get("description"),
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) {
    redirect("/?error=job");
  }
  const phone = parsePhone(parsed.data.phone);
  const email = parseEmail(parsed.data.email);
  const notes = parseJobNotes(parsed.data.notes);
  if (phone === null || email === null || notes === null) {
    redirect("/?error=job");
  }
  const db = requireDb();
  const org = await getOrg(db);
  if (!org) {
    redirect("/?error=org");
  }
  const selectedId = parsed.data.customerId.trim();
  let customerId: string;
  if (selectedId !== "") {
    if (!isUuid(selectedId)) {
      redirect("/?error=job");
    }
    const customer = await getCustomer(db, selectedId);
    if (!customer || customer.orgId !== org.id) {
      redirect("/?error=job");
    }
    customerId = customer.id;
  } else {
    const name = parseCustomerName(parsed.data.customerName);
    const suburb = parseSuburb(parsed.data.suburb);
    if (!name || !suburb) {
      redirect("/?error=job");
    }
    customerId = await findOrCreateCustomer(db, org.id, name, suburb, {
      phone,
      email,
    });
  }
  const [created] = await db
    .insert(jobs)
    .values({
      orgId: org.id,
      customerId,
      description: parsed.data.description,
      notes,
      status: "enquiry",
    })
    .returning({ id: jobs.id });
  if (!created) {
    redirect("/?error=job");
  }
  revalidatePath("/");
  redirect(`/jobs/${created.id}`);
}

export async function duplicateJobAction(formData: FormData) {
  const jobId = String(formData.get("jobId") ?? "");
  if (!isUuid(jobId)) {
    redirect("/?error=job");
  }
  const db = requireDb();
  const job = await getJob(db, jobId);
  if (!job) {
    redirect("/?error=job");
  }
  const fields = duplicateJobFields(job);
  const [created] = await db
    .insert(jobs)
    .values({
      orgId: job.orgId,
      customerId: fields.customerId,
      description: fields.description,
      notes: fields.notes,
      status: fields.status,
      duplicatedFromJobId: fields.duplicatedFromJobId,
    })
    .returning({ id: jobs.id });
  if (!created) {
    redirect(`/jobs/${jobId}?error=job`);
  }
  revalidatePath("/");
  redirect(`/jobs/${created.id}`);
}

export async function saveCustomerAction(formData: FormData) {
  const customerId = String(formData.get("customerId") ?? "").trim();
  const name = parseCustomerName(String(formData.get("name") ?? ""));
  const suburb = parseSuburb(String(formData.get("suburb") ?? ""));
  const phone = parsePhone(String(formData.get("phone") ?? ""));
  const email = parseEmail(String(formData.get("email") ?? ""));
  if (!isUuid(customerId) || !name || !suburb || phone === null || email === null) {
    redirect("/?error=customer");
  }
  const db = requireDb();
  const org = await getOrg(db);
  if (!org) {
    redirect("/?error=org");
  }
  const customer = await getCustomer(db, customerId);
  if (!customer || customer.orgId !== org.id) {
    redirect("/?error=customer");
  }
  try {
    await db
      .update(customers)
      .set({ name, suburb, phone, email })
      .where(eq(customers.id, customer.id));
  } catch {
    redirect("/?error=customer");
  }
  revalidatePath("/");
  revalidatePath("/", "layout");
  redirect("/");
}

export async function saveRateItemAction(formData: FormData) {
  const rateItemId = String(formData.get("rateItemId") ?? "").trim();
  const description = parseRateDescription(String(formData.get("description") ?? ""));
  const unitPriceCents = parseRatePriceCents(String(formData.get("unitPrice") ?? ""));
  const cost = parseCostCents(String(formData.get("unitCost") ?? ""));
  const taxCode = parseTaxCode(String(formData.get("taxCode") ?? ""));
  const unit = parseLineUnit(String(formData.get("unit") ?? ""));
  const amountKind = parseAmountKind(String(formData.get("amountKind") ?? ""));
  if (!description || unitPriceCents === null || !cost.ok || taxCode === null) {
    redirect("/?error=rate");
  }
  const db = requireDb();
  const org = await getOrg(db);
  if (!org) {
    redirect("/?error=org");
  }
  try {
    if (rateItemId === "") {
      const existing = await listRateItems(db, org.id);
      await db.insert(rateCardItems).values({
        orgId: org.id,
        description,
        unit,
        unitPriceCents,
        unitCostCents: cost.cents,
        taxCode,
        amountKind,
        sortOrder: existing.length,
      });
    } else {
      if (!isUuid(rateItemId)) {
        redirect("/?error=rate");
      }
      const [item] = await getRateItemsByIds(db, org.id, [rateItemId]);
      if (!item) {
        redirect("/?error=rate");
      }
      await db
        .update(rateCardItems)
        .set({ description, unit, unitPriceCents, unitCostCents: cost.cents, taxCode, amountKind })
        .where(eq(rateCardItems.id, item.id));
    }
  } catch {
    redirect("/?error=rate");
  }
  revalidatePath("/");
  revalidatePath("/", "layout");
  redirect("/");
}

export async function deleteRateItemAction(formData: FormData) {
  const rateItemId = String(formData.get("rateItemId") ?? "").trim();
  if (!isUuid(rateItemId)) {
    redirect("/?error=rate");
  }
  const db = requireDb();
  const org = await getOrg(db);
  if (!org) {
    redirect("/?error=org");
  }
  const [item] = await getRateItemsByIds(db, org.id, [rateItemId]);
  if (!item) {
    redirect("/?error=rate");
  }
  await db.delete(rateCardItems).where(eq(rateCardItems.id, item.id));
  revalidatePath("/");
  revalidatePath("/", "layout");
  redirect("/");
}

export async function saveJobNotesAction(formData: FormData) {
  const jobId = String(formData.get("jobId") ?? "").trim();
  const notes = parseJobNotes(String(formData.get("notes") ?? ""));
  if (!isUuid(jobId) || notes === null) {
    redirect(isUuid(jobId) ? `/jobs/${jobId}?error=notes` : "/?error=job");
  }
  const db = requireDb();
  const job = await getJob(db, jobId);
  if (!job) {
    redirect("/?error=job");
  }
  await db.update(jobs).set({ notes }).where(eq(jobs.id, job.id));
  revalidatePath("/");
  revalidatePath(`/jobs/${job.id}`);
  redirect(`/jobs/${job.id}`);
}

function readLineResult(formData: FormData) {
  const descriptions = formData.getAll("line_description").map(String);
  const quantities = formData.getAll("line_qty").map(String);
  const prices = formData.getAll("line_price").map(String);
  const costs = formData.getAll("line_cost").map(String);
  const taxes = formData.getAll("line_tax").map(String);
  const kinds = formData.getAll("line_kind").map(String);
  const units = formData.getAll("line_unit").map(String);
  const lines = [];
  let costInvalid = false;
  for (let i = 0; i < descriptions.length; i += 1) {
    const description = descriptions[i]?.trim() ?? "";
    if (description === "") {
      continue;
    }
    const quantity = Number(quantities[i]);
    const dollars = parseAudAmount(prices[i] ?? "");
    const taxCode = parseTaxCode(taxes[i] ?? "");
    const cost = parseCostCents(costs[i] ?? "");
    if (!cost.ok) {
      costInvalid = true;
      continue;
    }
    if (!Number.isFinite(quantity) || quantity <= 0 || dollars === null || !taxCode) {
      continue;
    }
    lines.push({
      description,
      quantity,
      unit: parseLineUnit(units[i]),
      unitPriceCents: dollarsToCents(dollars),
      unitCostCents: cost.cents,
      taxCode,
      amountKind: parseAmountKind(kinds[i] ?? "inclusive"),
      sortOrder: lines.length,
    });
  }
  return { lines, costInvalid };
}

function readLines(formData: FormData) {
  return readLineResult(formData).lines;
}

function readValidUntil(formData: FormData, fallback: string): string {
  return parseIsoDate(String(formData.get("valid_until") ?? "")) ?? fallback;
}

type IssuedLine = {
  description: string;
  quantity: number;
  unit: string;
  unitPriceCents: number;
  taxCode: string;
  amountKind: string;
  sortOrder: number;
};

async function syncJobStatus(db: AppDb, jobId: string) {
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

async function insertIssuedInvoice(
  tx: Parameters<Parameters<AppDb["transaction"]>[0]>[0],
  input: {
    orgId: string;
    jobId: string;
    quoteId: string | null;
    recurringInvoiceId?: string | null;
    kind: InvoiceKind;
    claimPercent: number | null;
    retentionPercent: number;
    gstRegistered: boolean;
    termsDays: number;
    dueDate: string;
    lines: IssuedLine[];
  },
) {
  const totals = computeDocument(
    input.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      unit: parseLineUnit(line.unit),
      taxCode: parseTaxCode(line.taxCode) ?? "GST",
      amountKind: parseAmountKind(line.amountKind),
    })),
    input.gstRegistered,
  );
  const skipHold = input.kind === "retention" || input.kind === "recurring";
  const held = skipHold ? 0 : retentionHeldCents(totals.totalCents, input.retentionPercent);
  const docNumber = await allocateDocNumber(tx, input.orgId, "invoice");
  const [invoice] = await tx
    .insert(invoices)
    .values({
      jobId: input.jobId,
      quoteId: input.quoteId,
      recurringInvoiceId: input.recurringInvoiceId ?? null,
      docNumber,
      status: "sent",
      dueDate: input.dueDate,
      paymentTermsDays: input.termsDays,
      kind: input.kind,
      claimPercent: input.claimPercent,
      retentionPercent: skipHold ? 0 : input.retentionPercent,
      retentionHeldCents: held,
    })
    .returning({ id: invoices.id });
  if (!invoice) {
    throw new Error("invoice insert failed");
  }
  await tx.insert(invoiceLines).values(
    input.lines.map((line) => ({
      invoiceId: invoice.id,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unitPriceCents: line.unitPriceCents,
      taxCode: line.taxCode,
      amountKind: line.amountKind,
      sortOrder: line.sortOrder,
    })),
  );
  await tx.update(jobs).set({ status: "invoiced" }).where(eq(jobs.id, input.jobId));
}

export async function createQuoteAction(formData: FormData) {
  const jobId = String(formData.get("jobId") ?? "");
  if (!isUuid(jobId)) {
    redirect("/?error=job");
  }
  const typedResult = readLineResult(formData);
  if (typedResult.costInvalid) {
    redirect(`/jobs/${jobId}?error=cost`);
  }
  const typed = typedResult.lines;
  const rateIds = formData.getAll("rateItemId").map(String).filter(isUuid);
  const validUntil = readValidUntil(formData, defaultQuoteValidUntil(todayIsoSydney()));
  const db = requireDb();
  const job = await getJob(db, jobId);
  if (!job || job.status === "cancelled") {
    redirect(`/jobs/${jobId}?error=quote`);
  }
  const rateItems = await getRateItemsByIds(db, job.orgId, rateIds);
  const rateLines = rateItems
    .map((item, index) => rateItemToLine(item, index))
    .filter((line): line is NonNullable<typeof line> => line !== null);
  const lines = mergeRateAndTypedLines(rateLines, typed);
  if (lines.length === 0) {
    redirect(`/jobs/${jobId}?error=lines`);
  }
  try {
    await db.transaction(async (tx) => {
      const docNumber = await allocateDocNumber(tx, job.orgId, "quote");
      const [quote] = await tx
        .insert(quotes)
        .values({ jobId, docNumber, status: "draft", validUntil })
        .returning({ id: quotes.id });
      if (!quote) {
        throw new Error("quote insert failed");
      }
      await tx.insert(quoteLines).values(
        lines.map((line) => ({
          quoteId: quote.id,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          unitPriceCents: line.unitPriceCents,
          unitCostCents: line.unitCostCents ?? null,
          taxCode: line.taxCode,
          amountKind: line.amountKind,
          sortOrder: line.sortOrder,
        })),
      );
    });
  } catch {
    redirect(`/jobs/${jobId}?error=quote`);
  }
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}

export async function appendRateItemsAction(formData: FormData) {
  const quoteId = String(formData.get("quoteId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  if (!isUuid(quoteId) || !isUuid(jobId)) {
    redirect("/?error=job");
  }
  const rateIds = formData.getAll("rateItemId").map(String).filter(isUuid);
  const db = requireDb();
  const job = await getJob(db, jobId);
  const quoteList = await getQuotesForJob(db, jobId);
  const quote = quoteList.find((row) => row.id === quoteId);
  if (!job || job.status === "cancelled" || !quote || quote.status !== "draft") {
    redirect(`/jobs/${jobId}?error=rate`);
  }
  const rateItems = await getRateItemsByIds(db, job.orgId, rateIds);
  const rateLines = rateItems
    .map((item, index) => rateItemToLine(item, quote.lines.length + index))
    .filter((line): line is NonNullable<typeof line> => line !== null);
  if (rateLines.length === 0) {
    redirect(`/jobs/${jobId}?error=rate`);
  }
  await db.insert(quoteLines).values(
    rateLines.map((line) => ({
      quoteId,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unitPriceCents: line.unitPriceCents,
      unitCostCents: line.unitCostCents,
      taxCode: line.taxCode,
      amountKind: line.amountKind,
      sortOrder: line.sortOrder,
    })),
  );
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}

export async function reviseQuoteAction(formData: FormData) {
  const quoteId = String(formData.get("quoteId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  if (!isUuid(quoteId) || !isUuid(jobId)) {
    redirect("/?error=job");
  }
  const db = requireDb();
  const job = await getJob(db, jobId);
  const quoteList = await getQuotesForJob(db, jobId);
  const invoiceList = await getInvoicesForJob(db, jobId);
  const quote = quoteList.find((row) => row.id === quoteId);
  if (!job || !quote || quote.lines.length === 0) {
    redirect(`/jobs/${jobId}?error=revise`);
  }
  if (
    !canReviseQuote({
      jobStatus: job.status,
      quoteStatus: quote.status,
      liveInvoiceCount: liveInvoiceCountOnQuote(
        invoiceList.map((invoice) => ({
          quoteId: invoice.quoteId,
          status: invoice.status,
        })),
        quoteId,
      ),
      hasDraftRevision: hasDraftRevision(
        quoteList.map((row) => ({
          revisedFromQuoteId: row.revisedFromQuoteId,
          status: row.status,
        })),
        quoteId,
      ),
    })
  ) {
    redirect(`/jobs/${jobId}?error=revise`);
  }
  const validUntil = defaultQuoteValidUntil(todayIsoSydney());
  try {
    await db.transaction(async (tx) => {
      const docNumber = await allocateDocNumber(tx, job.orgId, "quote");
      const [created] = await tx
        .insert(quotes)
        .values({
          jobId,
          docNumber,
          status: "draft",
          validUntil,
          revisedFromQuoteId: quote.id,
        })
        .returning({ id: quotes.id });
      if (!created) {
        throw new Error("quote insert failed");
      }
      await tx.insert(quoteLines).values(
        quote.lines.map((line, index) => ({
          quoteId: created.id,
          description: line.description,
          quantity: line.quantity,
          unit: parseLineUnit(line.unit),
          unitPriceCents: line.unitPriceCents,
          unitCostCents: line.unitCostCents ?? null,
          taxCode: parseTaxCode(line.taxCode) ?? "GST",
          amountKind: parseAmountKind(line.amountKind),
          sortOrder: index,
        })),
      );
    });
  } catch {
    redirect(`/jobs/${jobId}?error=revise`);
  }
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}

export async function sendQuoteAction(formData: FormData) {
  const quoteId = String(formData.get("quoteId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  if (!isUuid(quoteId) || !isUuid(jobId)) {
    redirect("/?error=job");
  }
  const db = requireDb();
  const quoteList = await getQuotesForJob(db, jobId);
  const quote = quoteList.find((row) => row.id === quoteId);
  if (!quote || quote.status !== "draft") {
    redirect(`/jobs/${jobId}?error=quote`);
  }
  const job = await getJob(db, jobId);
  if (!job || job.status === "cancelled") {
    redirect(`/jobs/${jobId}?error=quote`);
  }
  const source = quote.revisedFromQuoteId
    ? quoteList.find((row) => row.id === quote.revisedFromQuoteId)
    : undefined;
  const supersede = source ? shouldSupersedeOnSend(source.status) : false;
  await db.transaction(async (tx) => {
    await tx.update(quotes).set({ status: "sent" }).where(eq(quotes.id, quoteId));
    if (source && supersede) {
      await tx
        .update(quotes)
        .set({ status: "superseded" })
        .where(eq(quotes.id, source.id));
    }
    if (job.status === "enquiry" || job.status === "quoted") {
      await tx.update(jobs).set({ status: "quoted" }).where(eq(jobs.id, jobId));
    } else if (job.status === "accepted" && supersede && source?.status === "accepted") {
      await tx.update(jobs).set({ status: "quoted" }).where(eq(jobs.id, jobId));
    }
  });
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}

export async function acceptQuoteAction(formData: FormData) {
  const quoteId = String(formData.get("quoteId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  if (!isUuid(quoteId) || !isUuid(jobId)) {
    redirect("/?error=job");
  }
  const db = requireDb();
  const quoteList = await getQuotesForJob(db, jobId);
  const quote = quoteList.find((row) => row.id === quoteId);
  if (!quote || quote.status !== "sent") {
    redirect(`/jobs/${jobId}?error=quote`);
  }
  await db.update(quotes).set({ status: "accepted" }).where(eq(quotes.id, quoteId));
  const job = await getJob(db, jobId);
  if (job && job.status !== "invoiced" && job.status !== "paid" && job.status !== "cancelled") {
    await db.update(jobs).set({ status: "accepted" }).where(eq(jobs.id, jobId));
  }
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}

export async function declineQuoteAction(formData: FormData) {
  const quoteId = String(formData.get("quoteId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  if (!isUuid(quoteId) || !isUuid(jobId)) {
    redirect("/?error=job");
  }
  const db = requireDb();
  const quoteList = await getQuotesForJob(db, jobId);
  const quote = quoteList.find((row) => row.id === quoteId);
  if (!quote || quote.status !== "sent") {
    redirect(`/jobs/${jobId}?error=quote`);
  }
  await db.update(quotes).set({ status: "declined" }).where(eq(quotes.id, quoteId));
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}

export async function issueInvoiceAction(formData: FormData) {
  const quoteId = String(formData.get("quoteId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  if (!isUuid(quoteId) || !isUuid(jobId)) {
    redirect("/?error=job");
  }
  const db = requireDb();
  const quoteList = await getQuotesForJob(db, jobId);
  const quote = quoteList.find((row) => row.id === quoteId);
  if (!quote || quote.status !== "accepted") {
    redirect(`/jobs/${jobId}?error=invoice`);
  }
  const job = await getJob(db, jobId);
  if (!job || job.status === "cancelled") {
    redirect(`/jobs/${jobId}?error=invoice`);
  }
  const org = await getOrg(db);
  if (!org) {
    redirect(`/jobs/${jobId}?error=invoice`);
  }
  const existing = await getInvoicesForJob(db, jobId);
  const claimed = claimedCentsFromInvoices(
    existing.map((invoice) => ({
      quoteId: invoice.quoteId,
      status: invoice.status,
      kind: invoice.kind,
      totalCents: invoice.totals.totalCents,
    })),
    quoteId,
  );
  if (claimed > 0) {
    redirect(`/jobs/${jobId}?error=invoice`);
  }
  const termsDays = parsePaymentTermsDays(org.paymentTermsDays);
  const dueDate = dueDateFromTerms(todayIsoSydney(), termsDays);
  const retentionPercent = parseRetentionPercent(org.retentionPercent);
  try {
    await db.transaction(async (tx) => {
      await insertIssuedInvoice(tx, {
        orgId: job.orgId,
        jobId,
        quoteId,
        kind: "standard",
        claimPercent: null,
        retentionPercent,
        gstRegistered: org.gstRegistered,
        termsDays,
        dueDate,
        lines: quote.lines.map((line, index) => ({
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          unitPriceCents: line.unitPriceCents,
          taxCode: line.taxCode,
          amountKind: line.amountKind,
          sortOrder: index,
        })),
      });
    });
  } catch {
    redirect(`/jobs/${jobId}?error=invoice`);
  }
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}

export async function issueClaimAction(formData: FormData) {
  const quoteId = String(formData.get("quoteId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  const kindRaw = String(formData.get("kind") ?? "");
  const remainder = String(formData.get("remainder") ?? "") === "yes";
  if (!isUuid(quoteId) || !isUuid(jobId)) {
    redirect("/?error=job");
  }
  const kind = parseInvoiceKind(kindRaw);
  if (kind !== "deposit" && kind !== "progress") {
    redirect(`/jobs/${jobId}?error=claim`);
  }
  const db = requireDb();
  const quoteList = await getQuotesForJob(db, jobId);
  const quote = quoteList.find((row) => row.id === quoteId);
  if (!quote || quote.status !== "accepted") {
    redirect(`/jobs/${jobId}?error=claim`);
  }
  const job = await getJob(db, jobId);
  if (!job || job.status === "cancelled") {
    redirect(`/jobs/${jobId}?error=claim`);
  }
  const org = await getOrg(db);
  if (!org) {
    redirect(`/jobs/${jobId}?error=claim`);
  }
  const existing = await getInvoicesForJob(db, jobId);
  const remaining = remainingContractCents(
    quote.totals.totalCents,
    claimedCentsFromInvoices(
      existing.map((invoice) => ({
        quoteId: invoice.quoteId,
        status: invoice.status,
        kind: invoice.kind,
        totalCents: invoice.totals.totalCents,
      })),
      quoteId,
    ),
  );
  const percent = remainder ? null : parseClaimPercent(String(formData.get("percent") ?? ""));
  if (!remainder && percent === null) {
    redirect(`/jobs/${jobId}?error=claim`);
  }
  const claimCents = remainder
    ? remaining
    : percentOfCents(quote.totals.totalCents, percent ?? 0);
  if (claimCents <= 0 || claimExceedsRemaining(claimCents, remaining)) {
    redirect(`/jobs/${jobId}?error=claim`);
  }
  const termsDays = parsePaymentTermsDays(org.paymentTermsDays);
  const dueDate = dueDateFromTerms(todayIsoSydney(), termsDays);
  const retentionPercent = parseRetentionPercent(org.retentionPercent);
  const taxCode = claimTaxCode(quote.lines.map((line) => line.taxCode));
  try {
    await db.transaction(async (tx) => {
      await insertIssuedInvoice(tx, {
        orgId: job.orgId,
        jobId,
        quoteId,
        kind,
        claimPercent: remainder ? null : percent,
        retentionPercent,
        gstRegistered: org.gstRegistered,
        termsDays,
        dueDate,
        lines: [
          {
            description: claimLineDescription({
              kind,
              quoteDocNumber: quote.docNumber,
              percent,
              remainder,
            }),
            quantity: 1,
            unit: "each",
            unitPriceCents: claimCents,
            taxCode,
            amountKind: "inclusive",
            sortOrder: 0,
          },
        ],
      });
    });
  } catch {
    redirect(`/jobs/${jobId}?error=claim`);
  }
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}

export async function issueVariationAction(formData: FormData) {
  const quoteId = String(formData.get("quoteId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  if (!isUuid(quoteId) || !isUuid(jobId)) {
    redirect("/?error=job");
  }
  const lines = readLines(formData);
  if (lines.length === 0) {
    redirect(`/jobs/${jobId}?error=variation`);
  }
  const db = requireDb();
  const quoteList = await getQuotesForJob(db, jobId);
  const quote = quoteList.find((row) => row.id === quoteId);
  if (!quote || quote.status !== "accepted") {
    redirect(`/jobs/${jobId}?error=variation`);
  }
  const job = await getJob(db, jobId);
  if (!job || job.status === "cancelled") {
    redirect(`/jobs/${jobId}?error=variation`);
  }
  const org = await getOrg(db);
  if (!org) {
    redirect(`/jobs/${jobId}?error=variation`);
  }
  const totals = computeDocument(lines, org.gstRegistered);
  if (totals.totalCents <= 0) {
    redirect(`/jobs/${jobId}?error=variation`);
  }
  const termsDays = parsePaymentTermsDays(org.paymentTermsDays);
  const dueDate = dueDateFromTerms(todayIsoSydney(), termsDays);
  const retentionPercent = parseRetentionPercent(org.retentionPercent);
  try {
    await db.transaction(async (tx) => {
      await insertIssuedInvoice(tx, {
        orgId: job.orgId,
        jobId,
        quoteId,
        kind: "variation",
        claimPercent: null,
        retentionPercent,
        gstRegistered: org.gstRegistered,
        termsDays,
        dueDate,
        lines,
      });
    });
  } catch {
    redirect(`/jobs/${jobId}?error=variation`);
  }
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}

export async function issueRetentionReleaseAction(formData: FormData) {
  const quoteId = String(formData.get("quoteId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  if (!isUuid(quoteId) || !isUuid(jobId)) {
    redirect("/?error=job");
  }
  const dollars = parseAudAmount(String(formData.get("amount") ?? ""));
  const db = requireDb();
  const quoteList = await getQuotesForJob(db, jobId);
  const quote = quoteList.find((row) => row.id === quoteId);
  if (!quote || quote.status !== "accepted" || dollars === null || dollars <= 0) {
    redirect(`/jobs/${jobId}?error=retention`);
  }
  const job = await getJob(db, jobId);
  if (!job || job.status === "cancelled") {
    redirect(`/jobs/${jobId}?error=retention`);
  }
  const org = await getOrg(db);
  if (!org) {
    redirect(`/jobs/${jobId}?error=retention`);
  }
  const existing = await getInvoicesForJob(db, jobId);
  const held = netRetentionHeldCents(
    existing.map((invoice) => ({
      quoteId: invoice.quoteId,
      status: invoice.status,
      kind: invoice.kind,
      retentionHeldCents: invoice.retentionHeldCents,
      totalCents: invoice.totals.totalCents,
    })),
    quoteId,
  );
  const amountCents = dollarsToCents(dollars);
  if (amountCents <= 0 || amountCents > held) {
    redirect(`/jobs/${jobId}?error=retention`);
  }
  const termsDays = parsePaymentTermsDays(org.paymentTermsDays);
  const dueDate = dueDateFromTerms(todayIsoSydney(), termsDays);
  const taxCode = claimTaxCode(quote.lines.map((line) => line.taxCode));
  try {
    await db.transaction(async (tx) => {
      await insertIssuedInvoice(tx, {
        orgId: job.orgId,
        jobId,
        quoteId,
        kind: "retention",
        claimPercent: null,
        retentionPercent: 0,
        gstRegistered: org.gstRegistered,
        termsDays,
        dueDate,
        lines: [
          {
            description: claimLineDescription({
              kind: "retention",
              quoteDocNumber: quote.docNumber,
              percent: null,
              remainder: false,
            }),
            quantity: 1,
            unit: "each",
            unitPriceCents: amountCents,
            taxCode,
            amountKind: "inclusive",
            sortOrder: 0,
          },
        ],
      });
    });
  } catch {
    redirect(`/jobs/${jobId}?error=retention`);
  }
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}

export async function recordPaymentAction(formData: FormData) {
  const parsed = paymentSchema.safeParse({
    invoiceId: formData.get("invoiceId"),
    amount: formData.get("amount"),
    paidOn: formData.get("paidOn"),
    method: formData.get("method"),
  });
  const jobId = String(formData.get("jobId") ?? "");
  if (!parsed.success || !isUuid(jobId)) {
    redirect(`/jobs/${jobId}?error=payment`);
  }
  const dollars = parseAudAmount(parsed.data.amount);
  if (dollars === null || dollars <= 0) {
    redirect(`/jobs/${jobId}?error=payment`);
  }
  const db = requireDb();
  const invoiceList = await getInvoicesForJob(db, jobId);
  const invoice = invoiceList.find((row) => row.id === parsed.data.invoiceId);
  if (!invoice || invoice.status === "void") {
    redirect(`/jobs/${jobId}?error=payment`);
  }
  const amountCents = dollarsToCents(dollars);
  await db.insert(payments).values({
    invoiceId: invoice.id,
    amountCents,
    paidOn: parsed.data.paidOn,
    method: parsed.data.method as PaymentMethod,
  });
  const remainingAfter = invoiceBalanceCents(
    invoice.totals.totalCents,
    invoice.paidCents + amountCents,
    invoice.creditedCents,
    invoice.retentionHeldCents,
  );
  if (remainingAfter <= 0 && invoice.totals.totalCents > 0) {
    await db.update(invoices).set({ status: "paid" }).where(eq(invoices.id, invoice.id));
  }
  await syncJobStatus(db, jobId);
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}

export async function replaceQuoteLinesAction(formData: FormData) {
  const quoteId = String(formData.get("quoteId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  if (!isUuid(quoteId) || !isUuid(jobId)) {
    redirect("/?error=job");
  }
  const parsedLines = readLineResult(formData);
  if (parsedLines.costInvalid) {
    redirect(`/jobs/${jobId}?error=cost`);
  }
  const lines = parsedLines.lines;
  if (lines.length === 0) {
    redirect(`/jobs/${jobId}?error=lines`);
  }
  const db = requireDb();
  const quoteList = await getQuotesForJob(db, jobId);
  const quote = quoteList.find((row) => row.id === quoteId);
  if (!quote || quote.status !== "draft") {
    redirect(`/jobs/${jobId}?error=quote`);
  }
  const validUntil = readValidUntil(formData, quote.validUntil);
  await db.delete(quoteLines).where(eq(quoteLines.quoteId, quoteId));
  await db.insert(quoteLines).values(
    lines.map((line) => ({
      quoteId,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unitPriceCents: line.unitPriceCents,
      unitCostCents: line.unitCostCents,
      taxCode: line.taxCode,
      amountKind: line.amountKind,
      sortOrder: line.sortOrder,
    })),
  );
  await db.update(quotes).set({ validUntil }).where(eq(quotes.id, quoteId));
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}

export async function deleteDraftQuoteAction(formData: FormData) {
  const quoteId = String(formData.get("quoteId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  if (!isUuid(quoteId) || !isUuid(jobId)) {
    redirect("/?error=job");
  }
  const db = requireDb();
  const quoteList = await getQuotesForJob(db, jobId);
  const quote = quoteList.find((row) => row.id === quoteId);
  if (!quote || quote.status !== "draft") {
    redirect(`/jobs/${jobId}?error=quote`);
  }
  await db.delete(quotes).where(eq(quotes.id, quoteId));
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}

export async function cancelJobAction(formData: FormData) {
  const jobId = String(formData.get("jobId") ?? "");
  if (!isUuid(jobId)) {
    redirect("/?error=job");
  }
  const db = requireDb();
  const job = await getJob(db, jobId);
  if (!job || job.status === "paid") {
    redirect(`/jobs/${jobId}?error=cancel`);
  }
  const invoiceList = await getInvoicesForJob(db, jobId);
  for (const invoice of invoiceList) {
    if (invoice.status !== "paid") {
      await db.update(invoices).set({ status: "void" }).where(eq(invoices.id, invoice.id));
    }
  }
  await db.update(jobs).set({ status: "cancelled" }).where(eq(jobs.id, jobId));
  revalidatePath("/");
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}

export async function voidInvoiceAction(formData: FormData) {
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  if (!isUuid(invoiceId) || !isUuid(jobId)) {
    redirect("/?error=job");
  }
  const db = requireDb();
  const invoiceList = await getInvoicesForJob(db, jobId);
  const invoice = invoiceList.find((row) => row.id === invoiceId);
  if (!invoice || invoice.status === "paid" || invoice.status === "void") {
    redirect(`/jobs/${jobId}?error=void`);
  }
  await db.update(invoices).set({ status: "void" }).where(eq(invoices.id, invoiceId));
  await syncJobStatus(db, jobId);
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}

export async function issueCreditNoteAction(formData: FormData) {
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  if (!isUuid(invoiceId) || !isUuid(jobId)) {
    redirect("/?error=job");
  }
  const lines = readLines(formData);
  if (lines.length === 0) {
    redirect(`/jobs/${jobId}?error=lines`);
  }
  const reason = parseCreditReason(String(formData.get("reason") ?? ""));
  const db = requireDb();
  const job = await getJob(db, jobId);
  if (!job || job.status === "cancelled") {
    redirect(`/jobs/${jobId}?error=credit`);
  }
  const invoiceList = await getInvoicesForJob(db, jobId);
  const invoice = invoiceList.find((row) => row.id === invoiceId);
  if (!invoice || invoice.status === "void") {
    redirect(`/jobs/${jobId}?error=credit`);
  }
  const org = await getOrg(db);
  if (!org) {
    redirect(`/jobs/${jobId}?error=credit`);
  }
  const totals = computeDocument(lines, org.gstRegistered);
  const balance = invoiceBalanceCents(
    invoice.totals.totalCents,
    invoice.paidCents,
    invoice.creditedCents,
    invoice.retentionHeldCents,
  );
  if (totals.totalCents <= 0 || creditExceedsBalance(totals.totalCents, balance)) {
    redirect(`/jobs/${jobId}?error=credit`);
  }
  try {
    await db.transaction(async (tx) => {
      const docNumber = await allocateDocNumber(tx, job.orgId, "credit");
      const [note] = await tx
        .insert(creditNotes)
        .values({
          invoiceId,
          jobId,
          docNumber,
          status: "issued",
          reason,
        })
        .returning({ id: creditNotes.id });
      if (!note) {
        throw new Error("credit insert failed");
      }
      await tx.insert(creditNoteLines).values(
        lines.map((line, index) => ({
          creditNoteId: note.id,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          unitPriceCents: line.unitPriceCents,
          taxCode: line.taxCode,
          amountKind: line.amountKind,
          sortOrder: index,
        })),
      );
    });
  } catch {
    redirect(`/jobs/${jobId}?error=credit`);
  }
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}

export async function voidCreditNoteAction(formData: FormData) {
  const creditNoteId = String(formData.get("creditNoteId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  if (!isUuid(creditNoteId) || !isUuid(jobId)) {
    redirect("/?error=job");
  }
  const db = requireDb();
  const invoiceList = await getInvoicesForJob(db, jobId);
  const note = invoiceList
    .flatMap((invoice) => invoice.creditNotes)
    .find((row) => row.id === creditNoteId);
  if (!note || note.status !== "issued") {
    redirect(`/jobs/${jobId}?error=credit`);
  }
  await db
    .update(creditNotes)
    .set({ status: "void" })
    .where(eq(creditNotes.id, creditNoteId));
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}

export async function saveRecurringAction(formData: FormData) {
  const jobId = String(formData.get("jobId") ?? "");
  const recurringIdRaw = String(formData.get("recurringId") ?? "").trim();
  if (!isUuid(jobId)) {
    redirect("/?error=job");
  }
  const frequency = parseRecurringFrequency(String(formData.get("frequency") ?? ""));
  const next = parseIsoDate(String(formData.get("nextIssueOn") ?? ""));
  const endParsed = parseOptionalIsoDate(String(formData.get("endOn") ?? ""));
  const lines = readLines(formData);
  if (
    !frequency ||
    !next ||
    !endParsed.ok ||
    lines.length === 0 ||
    endOnBeforeNext(next, endParsed.value)
  ) {
    redirect(`/jobs/${jobId}?error=recurring`);
  }
  const db = requireDb();
  const job = await getJob(db, jobId);
  if (!job || job.status === "cancelled") {
    redirect(`/jobs/${jobId}?error=recurring`);
  }
  const lineValues = lines.map((line) => ({
    description: line.description,
    quantity: line.quantity,
    unit: line.unit,
    unitPriceCents: line.unitPriceCents,
    taxCode: line.taxCode,
    amountKind: line.amountKind,
    sortOrder: line.sortOrder,
  }));
  const isCreate = recurringIdRaw === "";
  if (!isCreate && !isUuid(recurringIdRaw)) {
    redirect(`/jobs/${jobId}?error=recurring`);
  }
  if (!isCreate) {
    const existing = await getRecurringById(db, recurringIdRaw);
    if (!existing || existing.jobId !== jobId) {
      redirect(`/jobs/${jobId}?error=recurring`);
    }
  }
  try {
    if (isCreate) {
      await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(recurringInvoices)
          .values({
            jobId,
            frequency,
            nextIssueOn: next,
            endOn: endParsed.value,
            status: "active",
          })
          .returning({ id: recurringInvoices.id });
        if (!created) {
          throw new Error("recurring insert failed");
        }
        await tx.insert(recurringInvoiceLines).values(
          lineValues.map((line) => ({
            ...line,
            recurringInvoiceId: created.id,
          })),
        );
      });
    } else {
      await db.transaction(async (tx) => {
        await tx
          .update(recurringInvoices)
          .set({
            frequency,
            nextIssueOn: next,
            endOn: endParsed.value,
          })
          .where(eq(recurringInvoices.id, recurringIdRaw));
        await tx
          .delete(recurringInvoiceLines)
          .where(eq(recurringInvoiceLines.recurringInvoiceId, recurringIdRaw));
        await tx.insert(recurringInvoiceLines).values(
          lineValues.map((line) => ({
            ...line,
            recurringInvoiceId: recurringIdRaw,
          })),
        );
      });
    }
  } catch {
    redirect(`/jobs/${jobId}?error=recurring`);
  }
  revalidatePath("/");
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}

export async function setRecurringStatusAction(formData: FormData) {
  const jobId = String(formData.get("jobId") ?? "");
  const recurringId = String(formData.get("recurringId") ?? "");
  const status = parseRecurringStatus(String(formData.get("status") ?? ""));
  if (!isUuid(jobId) || !isUuid(recurringId)) {
    redirect("/?error=job");
  }
  const db = requireDb();
  const job = await getJob(db, jobId);
  const existing = await getRecurringById(db, recurringId);
  if (!job || job.status === "cancelled" || !existing || existing.jobId !== jobId) {
    redirect(`/jobs/${jobId}?error=recurring`);
  }
  await db
    .update(recurringInvoices)
    .set({ status })
    .where(eq(recurringInvoices.id, recurringId));
  revalidatePath("/");
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}

export async function deleteRecurringAction(formData: FormData) {
  const jobId = String(formData.get("jobId") ?? "");
  const recurringId = String(formData.get("recurringId") ?? "");
  if (!isUuid(jobId) || !isUuid(recurringId)) {
    redirect("/?error=job");
  }
  const db = requireDb();
  const existing = await getRecurringById(db, recurringId);
  if (!existing || existing.jobId !== jobId) {
    redirect(`/jobs/${jobId}?error=recurring`);
  }
  await db.delete(recurringInvoices).where(eq(recurringInvoices.id, recurringId));
  revalidatePath("/");
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}

export async function issueRecurringAction(formData: FormData) {
  const jobId = String(formData.get("jobId") ?? "");
  const recurringId = String(formData.get("recurringId") ?? "");
  if (!isUuid(jobId) || !isUuid(recurringId)) {
    redirect("/?error=job");
  }
  const db = requireDb();
  const job = await getJob(db, jobId);
  const template = await getRecurringById(db, recurringId);
  const org = await getOrg(db);
  if (!job || !template || !org || template.jobId !== jobId) {
    redirect(`/jobs/${jobId}?error=recurring`);
  }
  if (
    !canIssueRecurring({
      status: template.status,
      frequency: template.frequency,
      nextIssueOn: template.nextIssueOn,
      endOn: template.endOn,
      hasLines: template.lines.length > 0,
      jobStatus: job.status,
    })
  ) {
    redirect(`/jobs/${jobId}?error=recurring`);
  }
  const advanced = nextIssueOn(template.nextIssueOn, template.frequency);
  if (!advanced) {
    redirect(`/jobs/${jobId}?error=recurring`);
  }
  const termsDays = parsePaymentTermsDays(org.paymentTermsDays);
  const dueDate = dueDateFromTerms(todayIsoSydney(), termsDays);
  try {
    await db.transaction(async (tx) => {
      await insertIssuedInvoice(tx, {
        orgId: job.orgId,
        jobId,
        quoteId: null,
        recurringInvoiceId: template.id,
        kind: "recurring",
        claimPercent: null,
        retentionPercent: 0,
        gstRegistered: org.gstRegistered,
        termsDays,
        dueDate,
        lines: template.lines.map((line, index) => ({
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          unitPriceCents: line.unitPriceCents,
          taxCode: line.taxCode,
          amountKind: line.amountKind,
          sortOrder: index,
        })),
      });
      await tx
        .update(recurringInvoices)
        .set({ nextIssueOn: advanced })
        .where(eq(recurringInvoices.id, template.id));
    });
  } catch {
    redirect(`/jobs/${jobId}?error=recurring`);
  }
  revalidatePath("/");
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}
