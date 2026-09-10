"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { dollarsToCents, parseAudAmount } from "@/lib/ledger/money";
import { eq } from "drizzle-orm";
import { allocateDocNumber } from "@/db/allocate";
import { getDb, type AppDb } from "@/db/client";
import {
  findOrCreateCustomer,
  getCustomer,
  getCreditNoteById,
  getInvoiceById,
  getInvoicesForJob,
  getJob,
  getJobInOrg,
  getOrg,
  getOrgForUser,
  getQuoteById,
  getQuoteByShareToken,
  getQuotesForJob,
  getRateItemsByIds,
  getRecurringById,
  isUuid,
  issueRecurringInvoice,
  listCustomers,
  listJobs,
  listRateItems,
  recordInvoicePayment,
  syncJobStatus,
  type OrgRow,
} from "@/db/queries";
import {
  creditNoteLines,
  creditNotes,
  customers,
  invoiceLines,
  invoices,
  jobs,
  orgMembers,
  orgs,
  quoteLines,
  quotes,
  rateCardItems,
  recurringInvoiceLines,
  recurringInvoices,
} from "@/db/schema";
import { insertDemoLedger, seedDemo } from "@/db/seed";
import { randomUUID } from "node:crypto";
import { canLoadDemo, authConfigured, trialWriteAllowed } from "@/lib/ledger/auth";
import { demoSeed } from "@/data/demo-seed";
import { canApplySampleBooks, remapDemoSeed } from "@/lib/ledger/templates";
import { resolveAuthUser } from "@/lib/session";
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
import { parseInspectionFields } from "@/lib/ledger/inspection";
import {
  mergeRateAndTypedLines,
  parseRateDescription,
  parseRatePriceCents,
  rateItemToLine,
} from "@/lib/ledger/rate-card";
import { parseCostCents } from "@/lib/ledger/markup";
import {
  endOnBeforeNext,
  parseOptionalIsoDate,
  parseRecurringFrequency,
  parseRecurringStatus,
} from "@/lib/ledger/recurring";
import { runDueRecurringQueue } from "@/lib/queue/run";
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
import {
  parseRecipientEmail,
  sendDocumentEmail,
  type EmailDocumentKind,
} from "@/lib/ledger/email";
import {
  canRespondToSharedQuote,
  canShareQuote,
  generateShareToken,
  parseShareToken,
  quoteSharePath,
  resolveShareToken,
} from "@/lib/ledger/share";
import { createCheckoutSession } from "@/lib/ledger/stripe";
import {
  invoiceDateForWrite,
  parseAccountingLines,
  writeAccountingDocument,
  type AccountingDocumentKind,
  type AccountingProvider,
} from "@/lib/ledger/accounting";

function requireDb(): AppDb {
  const db = getDb();
  if (!db) {
    redirect("/?error=db");
  }
  return db;
}

async function requireOrg(db: AppDb): Promise<OrgRow> {
  if (authConfigured()) {
    const user = await resolveAuthUser();
    if (!user) {
      redirect("/sign-in");
    }
    if (
      !trialWriteAllowed({
        isAdmin: user.isAdmin,
        trialStartedAt: user.trialStartedAt,
        now: new Date(),
      })
    ) {
      redirect("/?error=trial");
    }
    const org = await getOrgForUser(db, user.id);
    if (!org) {
      redirect("/?error=member");
    }
    return org;
  }
  const first = await getOrg(db);
  if (!first) {
    redirect("/?error=org");
  }
  return first;
}

async function requireDbOrg(): Promise<{ db: AppDb; org: OrgRow }> {
  const db = requireDb();
  const org = await requireOrg(db);
  return { db, org };
}

async function requestOrigin(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "";
  if (!host) {
    return "";
  }
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
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
  propertyAddress: z.string(),
  vendorName: z.string(),
  purchaserName: z.string(),
  reportType: z.string(),
});

const paymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.string(),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  method: z.enum(PAYMENT_METHODS),
});

export async function loadDemoAction() {
  if (!canLoadDemo(authConfigured())) {
    redirect("/?error=auth");
  }
  const db = requireDb();
  try {
    await seedDemo(db);
  } catch {
    redirect("/?error=db");
  }
  revalidatePath("/");
  redirect("/");
}

export async function applySampleBooksAction() {
  if (!authConfigured()) {
    redirect("/?error=auth");
  }
  const db = requireDb();
  const user = await resolveAuthUser();
  if (!user) {
    redirect("/sign-in");
  }
  if (
    !trialWriteAllowed({
      isAdmin: user.isAdmin,
      trialStartedAt: user.trialStartedAt,
      now: new Date(),
    })
  ) {
    redirect("/?error=trial");
  }
  const existing = await getOrgForUser(db, user.id);
  if (existing) {
    const [jobList, customerList, rateList] = await Promise.all([
      listJobs(db, existing.id),
      listCustomers(db, existing.id),
      listRateItems(db, existing.id),
    ]);
    if (
      !canApplySampleBooks({
        authOn: true,
        trialWriteAllowed: true,
        jobCount: jobList.length,
        customerCount: customerList.length,
        rateCount: rateList.length,
      })
    ) {
      redirect("/?error=template");
    }
  }
  const orgId = existing?.id ?? randomUUID();
  const remapped = remapDemoSeed(demoSeed, {
    orgId,
    nextId: () => randomUUID(),
    nextShareToken: () => generateShareToken(),
  });
  if (!remapped) {
    redirect("/?error=template");
  }
  try {
    if (existing) {
      await db
        .update(orgs)
        .set({
          nextQuoteSeq: Math.max(existing.nextQuoteSeq, remapped.org.nextQuoteSeq),
          nextInvoiceSeq: Math.max(existing.nextInvoiceSeq, remapped.org.nextInvoiceSeq),
          nextCreditSeq: Math.max(existing.nextCreditSeq, remapped.org.nextCreditSeq),
        })
        .where(eq(orgs.id, existing.id));
      await insertDemoLedger(db, remapped, { insertOrg: false });
    } else {
      await insertDemoLedger(db, remapped, { insertOrg: true });
      await db.insert(orgMembers).values({ orgId, userId: user.id });
    }
  } catch {
    redirect("/?error=db");
  }
  revalidatePath("/");
  revalidatePath("/", "layout");
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
  const db = requireDb();
  if (authConfigured()) {
    const user = await resolveAuthUser();
    if (!user) {
      redirect("/sign-in");
    }
    if (
      !trialWriteAllowed({
        isAdmin: user.isAdmin,
        trialStartedAt: user.trialStartedAt,
        now: new Date(),
      })
    ) {
      redirect("/?error=trial");
    }
    const existing = await getOrgForUser(db, user.id);
    if (existing) {
      await db.update(orgs).set(values).where(eq(orgs.id, existing.id));
    } else {
      const [created] = await db.insert(orgs).values(values).returning({ id: orgs.id });
      if (!created) {
        redirect("/?error=org");
      }
      await db.insert(orgMembers).values({ orgId: created.id, userId: user.id });
    }
  } else {
    const existing = await getOrg(db);
    if (existing) {
      await db.update(orgs).set(values).where(eq(orgs.id, existing.id));
    } else {
      await db.insert(orgs).values(values);
    }
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
    propertyAddress: formData.get("propertyAddress") ?? "",
    vendorName: formData.get("vendorName") ?? "",
    purchaserName: formData.get("purchaserName") ?? "",
    reportType: formData.get("reportType") ?? "",
  });
  if (!parsed.success) {
    redirect("/?error=job");
  }
  const phone = parsePhone(parsed.data.phone);
  const email = parseEmail(parsed.data.email);
  const notes = parseJobNotes(parsed.data.notes);
  const inspection = parseInspectionFields({
    propertyAddress: parsed.data.propertyAddress,
    vendorName: parsed.data.vendorName,
    purchaserName: parsed.data.purchaserName,
    reportType: parsed.data.reportType,
  });
  if (phone === null || email === null || notes === null || inspection === null) {
    redirect("/?error=job");
  }
  const { db, org } = await requireDbOrg();
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
      propertyAddress: inspection.propertyAddress,
      vendorName: inspection.vendorName,
      purchaserName: inspection.purchaserName,
      reportType: inspection.reportType,
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
  const { db, org } = await requireDbOrg();
  const job = await getJobInOrg(db, jobId, org.id);
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
      propertyAddress: fields.propertyAddress,
      vendorName: fields.vendorName,
      purchaserName: fields.purchaserName,
      reportType: fields.reportType,
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
  const { db, org } = await requireDbOrg();
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
  const { db, org } = await requireDbOrg();
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
  const { db, org } = await requireDbOrg();
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
  const { db, org } = await requireDbOrg();
  const job = await getJobInOrg(db, jobId, org.id);
  if (!job) {
    redirect("/?error=job");
  }
  await db.update(jobs).set({ notes }).where(eq(jobs.id, job.id));
  revalidatePath("/");
  revalidatePath(`/jobs/${job.id}`);
  redirect(`/jobs/${job.id}`);
}

export async function saveInspectionAction(formData: FormData) {
  const jobId = String(formData.get("jobId") ?? "").trim();
  const inspection = parseInspectionFields({
    propertyAddress: String(formData.get("propertyAddress") ?? ""),
    vendorName: String(formData.get("vendorName") ?? ""),
    purchaserName: String(formData.get("purchaserName") ?? ""),
    reportType: String(formData.get("reportType") ?? ""),
  });
  if (!isUuid(jobId) || inspection === null) {
    redirect(isUuid(jobId) ? `/jobs/${jobId}?error=inspection` : "/?error=job");
  }
  const { db, org } = await requireDbOrg();
  const job = await getJobInOrg(db, jobId, org.id);
  if (!job) {
    redirect("/?error=job");
  }
  await db
    .update(jobs)
    .set({
      propertyAddress: inspection.propertyAddress,
      vendorName: inspection.vendorName,
      purchaserName: inspection.purchaserName,
      reportType: inspection.reportType,
    })
    .where(eq(jobs.id, job.id));
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
  const { db, org } = await requireDbOrg();
  const job = await getJobInOrg(db, jobId, org.id);
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
  const { db, org } = await requireDbOrg();
  const job = await getJobInOrg(db, jobId, org.id);
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
  const { db, org } = await requireDbOrg();
  const job = await getJobInOrg(db, jobId, org.id);
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
  const { db, org } = await requireDbOrg();
  const quoteList = await getQuotesForJob(db, jobId);
  const quote = quoteList.find((row) => row.id === quoteId);
  if (!quote || quote.status !== "draft") {
    redirect(`/jobs/${jobId}?error=quote`);
  }
  const job = await getJobInOrg(db, jobId, org.id);
  if (!job || job.status === "cancelled") {
    redirect(`/jobs/${jobId}?error=quote`);
  }
  const source = quote.revisedFromQuoteId
    ? quoteList.find((row) => row.id === quote.revisedFromQuoteId)
    : undefined;
  const supersede = source ? shouldSupersedeOnSend(source.status) : false;
  await db.transaction(async (tx) => {
    await tx
      .update(quotes)
      .set({ status: "sent", shareToken: generateShareToken() })
      .where(eq(quotes.id, quoteId));
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

async function emailDocumentAndRedirect(input: {
  jobId: string;
  kind: EmailDocumentKind;
  documentId: string;
}) {
  if (!isUuid(input.jobId) || !isUuid(input.documentId)) {
    redirect("/?error=job");
  }
  const db = requireDb();
  const org = await requireOrg(db);
  const job = await getJobInOrg(db, input.jobId, org.id);
  if (!job || !org) {
    redirect(`/jobs/${input.jobId}?error=email`);
  }
  const to = parseRecipientEmail(job.customerEmail);
  const origin = await requestOrigin();

  if (input.kind === "quote") {
    const quote = await getQuoteById(db, input.documentId);
    if (!quote || quote.jobId !== job.id) {
      redirect(`/jobs/${job.id}?error=email`);
    }
    const result = await sendDocumentEmail({
      kind: "quote",
      status: quote.status,
      docNumber: quote.docNumber,
      orgName: org.name,
      abn: org.abn,
      gstRegistered: org.gstRegistered,
      gstCents: quote.totals.gstCents,
      totalCents: quote.totals.totalCents,
      jobId: job.id,
      documentId: quote.id,
      shareToken: quote.shareToken,
      to,
      origin,
    });
    if (result.status !== "sent") {
      redirect(`/jobs/${job.id}?error=email`);
    }
  } else {
    const invoice = await getInvoiceById(db, input.documentId);
    if (!invoice || invoice.jobId !== job.id) {
      redirect(`/jobs/${job.id}?error=email`);
    }
    const result = await sendDocumentEmail({
      kind: "invoice",
      status: invoice.status,
      docNumber: invoice.docNumber,
      orgName: org.name,
      abn: org.abn,
      gstRegistered: org.gstRegistered,
      gstCents: invoice.totals.gstCents,
      totalCents: invoice.totals.totalCents,
      jobId: job.id,
      documentId: invoice.id,
      to,
      origin,
    });
    if (result.status !== "sent") {
      redirect(`/jobs/${job.id}?error=email`);
    }
  }

  revalidatePath(`/jobs/${job.id}`);
  redirect(`/jobs/${job.id}?emailed=1`);
}

export async function emailQuoteAction(formData: FormData) {
  await emailDocumentAndRedirect({
    jobId: String(formData.get("jobId") ?? ""),
    kind: "quote",
    documentId: String(formData.get("quoteId") ?? ""),
  });
}

export async function emailInvoiceAction(formData: FormData) {
  await emailDocumentAndRedirect({
    jobId: String(formData.get("jobId") ?? ""),
    kind: "invoice",
    documentId: String(formData.get("invoiceId") ?? ""),
  });
}

export async function payInvoiceWithCardAction(formData: FormData) {
  const jobId = String(formData.get("jobId") ?? "");
  const invoiceId = String(formData.get("invoiceId") ?? "");
  if (!isUuid(jobId) || !isUuid(invoiceId)) {
    redirect("/?error=job");
  }
  const { db, org } = await requireDbOrg();
  const job = await getJobInOrg(db, jobId, org.id);
  const invoice = await getInvoiceById(db, invoiceId);
  if (!job || !invoice || invoice.jobId !== job.id) {
    redirect(`/jobs/${jobId}?error=stripe`);
  }
  const remainingCents = invoiceBalanceCents(
    invoice.totals.totalCents,
    invoice.paidCents,
    invoice.creditedCents,
    invoice.retentionHeldCents,
  );
  const origin = await requestOrigin();
  const result = await createCheckoutSession({
    invoiceId: invoice.id,
    jobId: job.id,
    docNumber: invoice.docNumber,
    status: invoice.status,
    remainingCents,
    origin,
    customerEmail: parseRecipientEmail(job.customerEmail),
  });
  if (result.status !== "created") {
    redirect(`/jobs/${job.id}?error=stripe`);
  }
  redirect(result.url);
}

export async function writeAccountingAction(formData: FormData) {
  const jobId = String(formData.get("jobId") ?? "");
  const documentId = String(formData.get("id") ?? "");
  const providerRaw = String(formData.get("provider") ?? "");
  const kindRaw = String(formData.get("kind") ?? "");
  if (!isUuid(jobId) || !isUuid(documentId)) {
    redirect("/?error=job");
  }
  if (providerRaw !== "xero" && providerRaw !== "myob") {
    redirect(`/jobs/${jobId}?error=accounting`);
  }
  if (kindRaw !== "invoice" && kindRaw !== "credit") {
    redirect(`/jobs/${jobId}?error=accounting`);
  }
  const provider = providerRaw as AccountingProvider;
  const kind = kindRaw as AccountingDocumentKind;
  const { db, org } = await requireDbOrg();
  const job = await getJobInOrg(db, jobId, org.id);
  if (!job) {
    redirect(`/jobs/${jobId}?error=accounting`);
  }
  if (!job || !org) {
    redirect(`/jobs/${jobId}?error=accounting`);
  }

  if (kind === "invoice") {
    const invoice = await getInvoiceById(db, documentId);
    if (!invoice || invoice.jobId !== job.id) {
      redirect(`/jobs/${job.id}?error=accounting`);
    }
    const issuedOn =
      invoiceDateForWrite(invoice.dueDate, invoice.paymentTermsDays) ?? invoice.dueDate;
    const result = await writeAccountingDocument({
      provider,
      kind: "invoice",
      status: invoice.status,
      docNumber: invoice.docNumber,
      customerName: job.customerName,
      jobDescription: job.description,
      issuedOn,
      dueDate: invoice.dueDate,
      gstRegistered: org.gstRegistered,
      lines: parseAccountingLines(invoice.lines),
    });
    if (result.status !== "written") {
      redirect(`/jobs/${job.id}?error=accounting`);
    }
  } else {
    const note = await getCreditNoteById(db, documentId);
    if (!note || note.jobId !== job.id) {
      redirect(`/jobs/${job.id}?error=accounting`);
    }
    const result = await writeAccountingDocument({
      provider,
      kind: "credit",
      status: note.status,
      docNumber: note.docNumber,
      customerName: job.customerName,
      jobDescription: job.description,
      issuedOn: todayIsoSydney(note.createdAt),
      gstRegistered: org.gstRegistered,
      lines: parseAccountingLines(note.lines),
      againstDocNumber: note.againstDocNumber,
    });
    if (result.status !== "written") {
      redirect(`/jobs/${job.id}?error=accounting`);
    }
  }

  revalidatePath(`/jobs/${job.id}`);
  redirect(`/jobs/${job.id}?accounting=1`);
}

export async function acceptQuoteAction(formData: FormData) {
  const quoteId = String(formData.get("quoteId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  if (!isUuid(quoteId) || !isUuid(jobId)) {
    redirect("/?error=job");
  }
  const { db, org } = await requireDbOrg();
  const job = await getJobInOrg(db, jobId, org.id);
  const quoteList = await getQuotesForJob(db, jobId);
  const quote = quoteList.find((row) => row.id === quoteId);
  if (!job || !quote || quote.status !== "sent") {
    redirect(`/jobs/${jobId}?error=quote`);
  }
  await db.update(quotes).set({ status: "accepted" }).where(eq(quotes.id, quoteId));
  if (job.status !== "invoiced" && job.status !== "paid" && job.status !== "cancelled") {
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
  const { db, org } = await requireDbOrg();
  const quoteList = await getQuotesForJob(db, jobId);
  const quote = quoteList.find((row) => row.id === quoteId);
  if (!quote || quote.status !== "sent") {
    redirect(`/jobs/${jobId}?error=quote`);
  }
  const job = await getJobInOrg(db, jobId, org.id);
  if (!job) {
    redirect(`/jobs/${jobId}?error=quote`);
  }
  await db.update(quotes).set({ status: "declined" }).where(eq(quotes.id, quoteId));
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}

export async function writeQuoteShareAction(formData: FormData) {
  const quoteId = String(formData.get("quoteId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  const rotate = String(formData.get("rotate") ?? "") === "1";
  if (!isUuid(quoteId) || !isUuid(jobId)) {
    redirect("/?error=job");
  }
  const { db, org } = await requireDbOrg();
  const quote = await getQuoteById(db, quoteId);
  const job = await getJobInOrg(db, jobId, org.id);
  if (!quote || !job || quote.jobId !== job.id) {
    redirect(`/jobs/${jobId}?error=share`);
  }
  if (!canShareQuote(quote.status)) {
    redirect(`/jobs/${jobId}?error=share`);
  }
  const previous = parseShareToken(quote.shareToken);
  const token = resolveShareToken({ existing: quote.shareToken, rotate });
  if (token !== quote.shareToken) {
    await db.update(quotes).set({ shareToken: token }).where(eq(quotes.id, quote.id));
  }
  revalidatePath(`/jobs/${jobId}`);
  if (previous) {
    revalidatePath(quoteSharePath(previous));
  }
  revalidatePath(quoteSharePath(token));
  redirect(`/jobs/${jobId}?share=1`);
}

export async function respondToSharedQuoteAction(formData: FormData) {
  const token = parseShareToken(String(formData.get("token") ?? ""));
  const decision = String(formData.get("decision") ?? "");
  if (!token || (decision !== "accept" && decision !== "decline")) {
    redirect("/");
  }
  const db = requireDb();
  const quote = await getQuoteByShareToken(db, token);
  if (!quote) {
    redirect("/");
  }
  const path = quoteSharePath(token);
  const job = await getJob(db, quote.jobId);
  if (!job || job.status === "cancelled" || !canRespondToSharedQuote(quote.status)) {
    redirect(`${path}?error=share`);
  }
  if (decision === "accept") {
    await db.update(quotes).set({ status: "accepted" }).where(eq(quotes.id, quote.id));
    if (job.status !== "invoiced" && job.status !== "paid") {
      await db.update(jobs).set({ status: "accepted" }).where(eq(jobs.id, job.id));
    }
  } else {
    await db.update(quotes).set({ status: "declined" }).where(eq(quotes.id, quote.id));
  }
  revalidatePath(path);
  revalidatePath(`/jobs/${job.id}`);
  redirect(path);
}

export async function issueInvoiceAction(formData: FormData) {
  const quoteId = String(formData.get("quoteId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  if (!isUuid(quoteId) || !isUuid(jobId)) {
    redirect("/?error=job");
  }
  const { db, org } = await requireDbOrg();
  const quoteList = await getQuotesForJob(db, jobId);
  const quote = quoteList.find((row) => row.id === quoteId);
  if (!quote || quote.status !== "accepted") {
    redirect(`/jobs/${jobId}?error=invoice`);
  }
  const job = await getJobInOrg(db, jobId, org.id);
  if (!job || job.status === "cancelled") {
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
  const { db, org } = await requireDbOrg();
  const quoteList = await getQuotesForJob(db, jobId);
  const quote = quoteList.find((row) => row.id === quoteId);
  if (!quote || quote.status !== "accepted") {
    redirect(`/jobs/${jobId}?error=claim`);
  }
  const job = await getJobInOrg(db, jobId, org.id);
  if (!job || job.status === "cancelled") {
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
  const { db, org } = await requireDbOrg();
  const quoteList = await getQuotesForJob(db, jobId);
  const quote = quoteList.find((row) => row.id === quoteId);
  if (!quote || quote.status !== "accepted") {
    redirect(`/jobs/${jobId}?error=variation`);
  }
  const job = await getJobInOrg(db, jobId, org.id);
  if (!job || job.status === "cancelled") {
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
  const { db, org } = await requireDbOrg();
  const quoteList = await getQuotesForJob(db, jobId);
  const quote = quoteList.find((row) => row.id === quoteId);
  if (!quote || quote.status !== "accepted" || dollars === null || dollars <= 0) {
    redirect(`/jobs/${jobId}?error=retention`);
  }
  const job = await getJobInOrg(db, jobId, org.id);
  if (!job || job.status === "cancelled") {
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
  const { db, org } = await requireDbOrg();
  const job = await getJobInOrg(db, jobId, org.id);
  if (!job) {
    redirect(`/jobs/${jobId}?error=payment`);
  }
  const invoiceList = await getInvoicesForJob(db, jobId);
  const invoice = invoiceList.find((row) => row.id === parsed.data.invoiceId);
  if (!invoice || invoice.status === "void") {
    redirect(`/jobs/${jobId}?error=payment`);
  }
  const amountCents = dollarsToCents(dollars);
  await recordInvoicePayment(db, invoice, {
    amountCents,
    paidOn: parsed.data.paidOn,
    method: parsed.data.method as PaymentMethod,
  });
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
  const { db, org } = await requireDbOrg();
  const job = await getJobInOrg(db, jobId, org.id);
  if (!job) {
    redirect(`/jobs/${jobId}?error=quote`);
  }
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
  const { db, org } = await requireDbOrg();
  const job = await getJobInOrg(db, jobId, org.id);
  if (!job) {
    redirect(`/jobs/${jobId}?error=quote`);
  }
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
  const { db, org } = await requireDbOrg();
  const job = await getJobInOrg(db, jobId, org.id);
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
  const { db, org } = await requireDbOrg();
  const job = await getJobInOrg(db, jobId, org.id);
  if (!job) {
    redirect(`/jobs/${jobId}?error=void`);
  }
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
  const { db, org } = await requireDbOrg();
  const job = await getJobInOrg(db, jobId, org.id);
  if (!job || job.status === "cancelled") {
    redirect(`/jobs/${jobId}?error=credit`);
  }
  const invoiceList = await getInvoicesForJob(db, jobId);
  const invoice = invoiceList.find((row) => row.id === invoiceId);
  if (!invoice || invoice.status === "void") {
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
  const { db, org } = await requireDbOrg();
  const job = await getJobInOrg(db, jobId, org.id);
  if (!job) {
    redirect(`/jobs/${jobId}?error=credit`);
  }
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
  const { db, org } = await requireDbOrg();
  const job = await getJobInOrg(db, jobId, org.id);
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
  const { db, org } = await requireDbOrg();
  const job = await getJobInOrg(db, jobId, org.id);
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
  const { db, org } = await requireDbOrg();
  const job = await getJobInOrg(db, jobId, org.id);
  const existing = await getRecurringById(db, recurringId);
  if (!job || !existing || existing.jobId !== job.id) {
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
  const { db, org } = await requireDbOrg();
  const template = await getRecurringById(db, recurringId);
  if (!template || template.jobId !== jobId) {
    redirect(`/jobs/${jobId}?error=recurring`);
  }
  const outcome = await issueRecurringInvoice(db, {
    recurringId,
    today: todayIsoSydney(),
    orgId: org.id,
    requireDue: false,
  });
  if (!outcome.ok) {
    redirect(`/jobs/${jobId}?error=recurring`);
  }
  revalidatePath("/");
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}

export async function queueDueRecurringAction() {
  const { db, org } = await requireDbOrg();
  const result = await runDueRecurringQueue({
    db,
    orgId: org.id,
    today: todayIsoSydney(),
  });
  if (result.status !== "queued") {
    redirect("/?error=queue");
  }
  revalidatePath("/");
  redirect("/?queued=1");
}
