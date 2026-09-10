import { sql } from "drizzle-orm";
import { demoSeed, type DemoSeed } from "../data/demo-seed";
import type { AppDb } from "./client";
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
} from "./schema";

export async function insertDemoLedger(
  db: AppDb,
  seed: DemoSeed,
  options: { insertOrg: boolean },
): Promise<void> {
  if (options.insertOrg) {
    await db.insert(orgs).values({
      id: seed.org.id,
      name: seed.org.name,
      abn: seed.org.abn,
      gstRegistered: seed.org.gstRegistered,
      address: seed.org.address,
      paymentTermsDays: seed.org.paymentTermsDays,
      accountName: seed.org.accountName,
      bsb: seed.org.bsb,
      accountNumber: seed.org.accountNumber,
      payId: seed.org.payId,
      retentionPercent: seed.org.retentionPercent,
      nextQuoteSeq: seed.org.nextQuoteSeq,
      nextInvoiceSeq: seed.org.nextInvoiceSeq,
      nextCreditSeq: seed.org.nextCreditSeq,
    });
  }

  await db.insert(customers).values(
    seed.customers.map((customer) => ({
      id: customer.id,
      orgId: seed.org.id,
      name: customer.name,
      suburb: customer.suburb,
      phone: customer.phone,
      email: customer.email,
    })),
  );

  await db.insert(jobs).values(
    seed.jobs.map((job) => ({
      id: job.id,
      orgId: seed.org.id,
      customerId: job.customerId,
      description: job.description,
      notes: job.notes,
      propertyAddress: job.propertyAddress,
      vendorName: job.vendorName,
      purchaserName: job.purchaserName,
      reportType: job.reportType,
      status: job.status,
      duplicatedFromJobId: job.duplicatedFromJobId ?? null,
    })),
  );

  for (const quote of seed.quotes) {
    await db.insert(quotes).values({
      id: quote.id,
      jobId: quote.jobId,
      docNumber: quote.docNumber,
      status: quote.status,
      validUntil: quote.validUntil,
      revisedFromQuoteId: quote.revisedFromQuoteId ?? null,
      shareToken: quote.shareToken ?? null,
    });
    await db.insert(quoteLines).values(
      quote.lines.map((line) => ({
        id: line.id,
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
  }

  for (const invoice of seed.invoices) {
    await db.insert(invoices).values({
      id: invoice.id,
      jobId: invoice.jobId,
      quoteId: invoice.quoteId,
      docNumber: invoice.docNumber,
      status: invoice.status,
      dueDate: invoice.dueDate,
      paymentTermsDays: invoice.paymentTermsDays,
      kind: invoice.kind,
      claimPercent: invoice.claimPercent,
      retentionPercent: invoice.retentionPercent,
      retentionHeldCents: invoice.retentionHeldCents,
    });
    await db.insert(invoiceLines).values(
      invoice.lines.map((line) => ({
        id: line.id,
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
  }

  await db.insert(payments).values(
    seed.payments.map((payment) => ({
      id: payment.id,
      invoiceId: payment.invoiceId,
      amountCents: payment.amountCents,
      paidOn: payment.paidOn,
      method: payment.method,
    })),
  );

  for (const note of seed.creditNotes) {
    await db.insert(creditNotes).values({
      id: note.id,
      invoiceId: note.invoiceId,
      jobId: note.jobId,
      docNumber: note.docNumber,
      status: note.status,
      reason: note.reason,
    });
    await db.insert(creditNoteLines).values(
      note.lines.map((line) => ({
        id: line.id,
        creditNoteId: note.id,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        unitPriceCents: line.unitPriceCents,
        taxCode: line.taxCode,
        amountKind: line.amountKind,
        sortOrder: line.sortOrder,
      })),
    );
  }

  await db.insert(rateCardItems).values(
    seed.rateCard.map((item) => ({
      id: item.id,
      orgId: seed.org.id,
      description: item.description,
      unit: item.unit,
      unitPriceCents: item.unitPriceCents,
      unitCostCents: item.unitCostCents,
      taxCode: item.taxCode,
      amountKind: item.amountKind,
      sortOrder: item.sortOrder,
    })),
  );

  for (const template of seed.recurringInvoices) {
    await db.insert(recurringInvoices).values({
      id: template.id,
      jobId: template.jobId,
      frequency: template.frequency,
      nextIssueOn: template.nextIssueOn,
      endOn: template.endOn,
      status: template.status,
    });
    await db.insert(recurringInvoiceLines).values(
      template.lines.map((line) => ({
        id: line.id,
        recurringInvoiceId: template.id,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        unitPriceCents: line.unitPriceCents,
        taxCode: line.taxCode,
        amountKind: line.amountKind,
        sortOrder: line.sortOrder,
      })),
    );
  }
}

export async function seedDemo(db: AppDb): Promise<string> {
  await db.execute(
    sql`truncate table credit_note_lines, credit_notes, payments, invoice_lines, invoices, quote_lines, quotes, recurring_invoice_lines, recurring_invoices, jobs, customers, rate_card_items, org_members, orgs restart identity cascade`,
  );
  try {
    await db.execute(
      sql`truncate table trial_ip_locks, auth_sessions, auth_users restart identity cascade`,
    );
  } catch {
    // 0004 not applied yet
  }

  await insertDemoLedger(db, demoSeed, { insertOrg: true });
  return demoSeed.org.id;
}
