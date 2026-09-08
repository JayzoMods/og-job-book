"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { dollarsToCents, parseAudAmount } from "@/lib/ledger/money";
import { eq } from "drizzle-orm";
import { allocateDocNumber } from "@/db/allocate";
import { getDb, type AppDb } from "@/db/client";
import {
  getInvoicesForJob,
  getJob,
  getOrg,
  getQuotesForJob,
  isUuid,
} from "@/db/queries";
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
  customerName: z.string().trim().min(1).max(120),
  suburb: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(500),
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
    customerName: formData.get("customerName"),
    suburb: formData.get("suburb"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    redirect("/?error=job");
  }
  const db = requireDb();
  const org = await getOrg(db);
  if (!org) {
    redirect("/?error=org");
  }
  const [created] = await db
    .insert(jobs)
    .values({
      orgId: org.id,
      customerName: parsed.data.customerName,
      suburb: parsed.data.suburb,
      description: parsed.data.description,
      status: "enquiry",
    })
    .returning({ id: jobs.id });
  if (!created) {
    redirect("/?error=job");
  }
  revalidatePath("/");
  redirect(`/jobs/${created.id}`);
}

function readLines(formData: FormData) {
  const descriptions = formData.getAll("line_description").map(String);
  const quantities = formData.getAll("line_qty").map(String);
  const prices = formData.getAll("line_price").map(String);
  const taxes = formData.getAll("line_tax").map(String);
  const kinds = formData.getAll("line_kind").map(String);
  const units = formData.getAll("line_unit").map(String);
  const lines = [];
  for (let i = 0; i < descriptions.length; i += 1) {
    const description = descriptions[i]?.trim() ?? "";
    if (description === "") {
      continue;
    }
    const quantity = Number(quantities[i]);
    const dollars = parseAudAmount(prices[i] ?? "");
    const taxCode = parseTaxCode(taxes[i] ?? "");
    if (!Number.isFinite(quantity) || quantity <= 0 || dollars === null || !taxCode) {
      continue;
    }
    lines.push({
      description,
      quantity,
      unit: parseLineUnit(units[i]),
      unitPriceCents: dollarsToCents(dollars),
      taxCode,
      amountKind: parseAmountKind(kinds[i] ?? "inclusive"),
      sortOrder: lines.length,
    });
  }
  return lines;
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
    quoteId: string;
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
  const held =
    input.kind === "retention"
      ? 0
      : retentionHeldCents(totals.totalCents, input.retentionPercent);
  const docNumber = await allocateDocNumber(tx, input.orgId, "invoice");
  const [invoice] = await tx
    .insert(invoices)
    .values({
      jobId: input.jobId,
      quoteId: input.quoteId,
      docNumber,
      status: "sent",
      dueDate: input.dueDate,
      paymentTermsDays: input.termsDays,
      kind: input.kind,
      claimPercent: input.claimPercent,
      retentionPercent: input.kind === "retention" ? 0 : input.retentionPercent,
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
  const lines = readLines(formData);
  if (lines.length === 0) {
    redirect(`/jobs/${jobId}?error=lines`);
  }
  const validUntil = readValidUntil(formData, defaultQuoteValidUntil(todayIsoSydney()));
  const db = requireDb();
  const job = await getJob(db, jobId);
  if (!job || job.status === "cancelled") {
    redirect(`/jobs/${jobId}?error=quote`);
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

export async function sendQuoteAction(formData: FormData) {
  const quoteId = String(formData.get("quoteId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  if (!isUuid(quoteId) || !isUuid(jobId)) {
    redirect("/?error=job");
  }
  const db = requireDb();
  await db.update(quotes).set({ status: "sent" }).where(eq(quotes.id, quoteId));
  const job = await getJob(db, jobId);
  if (job && (job.status === "enquiry" || job.status === "quoted")) {
    await db.update(jobs).set({ status: "quoted" }).where(eq(jobs.id, jobId));
  }
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
  const lines = readLines(formData);
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
