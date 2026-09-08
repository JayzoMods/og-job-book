import { sql } from "drizzle-orm";
import { demoSeed } from "../data/demo-seed";
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

export async function seedDemo(db: AppDb): Promise<string> {
  await db.execute(
    sql`truncate table credit_note_lines, credit_notes, payments, invoice_lines, invoices, quote_lines, quotes, jobs, orgs restart identity cascade`,
  );

  await db.insert(orgs).values({
    id: demoSeed.org.id,
    name: demoSeed.org.name,
    abn: demoSeed.org.abn,
    gstRegistered: demoSeed.org.gstRegistered,
    address: demoSeed.org.address,
    paymentTermsDays: demoSeed.org.paymentTermsDays,
    accountName: demoSeed.org.accountName,
    bsb: demoSeed.org.bsb,
    accountNumber: demoSeed.org.accountNumber,
    payId: demoSeed.org.payId,
    retentionPercent: demoSeed.org.retentionPercent,
    nextQuoteSeq: demoSeed.org.nextQuoteSeq,
    nextInvoiceSeq: demoSeed.org.nextInvoiceSeq,
    nextCreditSeq: demoSeed.org.nextCreditSeq,
  });

  await db.insert(jobs).values(
    demoSeed.jobs.map((job) => ({
      id: job.id,
      orgId: demoSeed.org.id,
      customerName: job.customerName,
      suburb: job.suburb,
      description: job.description,
      status: job.status,
    })),
  );

  for (const quote of demoSeed.quotes) {
    await db.insert(quotes).values({
      id: quote.id,
      jobId: quote.jobId,
      docNumber: quote.docNumber,
      status: quote.status,
      validUntil: quote.validUntil,
    });
    await db.insert(quoteLines).values(
      quote.lines.map((line) => ({
        id: line.id,
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
  }

  for (const invoice of demoSeed.invoices) {
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
    demoSeed.payments.map((payment) => ({
      id: payment.id,
      invoiceId: payment.invoiceId,
      amountCents: payment.amountCents,
      paidOn: payment.paidOn,
      method: payment.method,
    })),
  );

  for (const note of demoSeed.creditNotes) {
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

  return demoSeed.org.id;
}
