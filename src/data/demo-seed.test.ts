import { describe, expect, it } from "vitest";
import { isValidAbn } from "../lib/ledger/abn";
import { lineAmountCents } from "../lib/ledger/money";
import { computeDocument } from "../lib/ledger/tax";
import { hasInvoicePayDetails, invoicePayDetails, formatBsb } from "../lib/ledger/pay";
import { invoiceIsOverdue, quoteIsExpired } from "../lib/ledger/terms";
import { demoSeed } from "./demo-seed";

describe("demo seed shape", () => {
  it("has a GST-registered org with a valid ABN checksum", () => {
    expect(isValidAbn(demoSeed.org.abn)).toBe(true);
    expect(demoSeed.org.gstRegistered).toBe(true);
  });

  it("has at least three jobs in different statuses", () => {
    expect(demoSeed.jobs.length).toBeGreaterThanOrEqual(3);
    const statuses = new Set(demoSeed.jobs.map((job) => job.status));
    expect(statuses.size).toBeGreaterThanOrEqual(3);
  });

  it("has one quote with mixed GST and GST-free lines", () => {
    const mixed = demoSeed.quotes.find((quote) => {
      const codes = new Set(quote.lines.map((line) => line.taxCode));
      return codes.has("GST") && codes.has("GST_FREE");
    });
    expect(mixed).toBeDefined();
    const totals = computeDocument(mixed!.lines);
    expect(totals.gstCents).toBeGreaterThan(0);
    expect(totals.gstFreeCents).toBeGreaterThan(0);
    expect(totals.flags).toEqual([]);
  });

  it("has one invoice and one payment covering that invoice", () => {
    expect(demoSeed.invoices.length).toBeGreaterThanOrEqual(1);
    expect(demoSeed.payments.length).toBeGreaterThanOrEqual(1);
    const invoice = demoSeed.invoices[0];
    const paid = demoSeed.payments
      .filter((payment) => payment.invoiceId === invoice.id)
      .reduce((sum, payment) => sum + payment.amountCents, 0);
    const total = computeDocument(invoice.lines).totalCents;
    expect(paid).toBe(total);
  });

  it("assigns sequential quote and invoice numbers and leaves seq counters ready", () => {
    expect(demoSeed.quotes.map((quote) => quote.docNumber)).toEqual([
      "Q-0001",
      "Q-0002",
      "Q-0003",
      "Q-0004",
      "Q-0005",
    ]);
    expect(demoSeed.invoices.map((invoice) => invoice.docNumber)).toEqual([
      "INV-0001",
      "INV-0002",
      "INV-0003",
      "INV-0004",
    ]);
    expect(demoSeed.org.nextQuoteSeq).toBe(5);
    expect(demoSeed.org.nextInvoiceSeq).toBe(4);
    expect(demoSeed.org.nextCreditSeq).toBe(1);
    expect(demoSeed.creditNotes.map((note) => note.docNumber)).toEqual(["CN-0001"]);
  });

  it("exposes a draft quote and an unpaid invoice so lifecycle actions are clickable", () => {
    const draft = demoSeed.quotes.find((quote) => quote.status === "draft");
    expect(draft?.docNumber).toBe("Q-0003");
    const unpaid = demoSeed.invoices.find((invoice) => invoice.status === "sent");
    expect(unpaid?.docNumber).toBe("INV-0002");
  });

  it("uses each, hours, and m² on seed lines without changing mixed-quote money", () => {
    const units = new Set(
      demoSeed.quotes.flatMap((quote) => quote.lines.map((line) => line.unit)),
    );
    expect(units.has("each")).toBe(true);
    expect(units.has("hours")).toBe(true);
    expect(units.has("m2")).toBe(true);
    const mixed = demoSeed.quotes.find((quote) => quote.docNumber === "Q-0001");
    expect(computeDocument(mixed!.lines).totalCents).toBe(123200);
    const hours = demoSeed.quotes
      .find((quote) => quote.docNumber === "Q-0003")
      ?.lines.find((line) => line.unit === "hours");
    expect(hours?.quantity).toBe(2.5);
    expect(lineAmountCents(hours!.quantity, hours!.unitPriceCents)).toBe(33000);
  });

  it("pins an expired sent quote and an overdue unpaid invoice against 8 Sep 2026", () => {
    expect(demoSeed.org.paymentTermsDays).toBe(14);
    const expired = demoSeed.quotes.find((quote) => quote.docNumber === "Q-0001");
    expect(expired?.validUntil).toBe("2026-09-01");
    expect(
      quoteIsExpired({
        status: expired!.status,
        validUntil: expired!.validUntil,
        today: "2026-09-08",
      }),
    ).toBe(true);
    const overdue = demoSeed.invoices.find((invoice) => invoice.docNumber === "INV-0002");
    expect(overdue?.dueDate).toBe("2026-09-01");
    expect(overdue?.paymentTermsDays).toBe(14);
    const credit = demoSeed.creditNotes.find((note) => note.docNumber === "CN-0001");
    expect(credit?.invoiceId).toBe(overdue?.id);
    const creditTotals = computeDocument(credit!.lines);
    expect(creditTotals.totalCents).toBe(11000);
    expect(creditTotals.gstCents).toBe(1000);
    const remaining =
      computeDocument(overdue!.lines).totalCents - creditTotals.totalCents;
    expect(remaining).toBe(44000);
    expect(
      invoiceIsOverdue({
        status: overdue!.status,
        dueDate: overdue!.dueDate,
        remainingCents: remaining,
        today: "2026-09-08",
      }),
    ).toBe(true);
    const paid = demoSeed.invoices.find((invoice) => invoice.docNumber === "INV-0001");
    expect(
      invoiceIsOverdue({
        status: paid!.status,
        dueDate: paid!.dueDate,
        remainingCents: 0,
        today: "2026-09-08",
      }),
    ).toBe(false);
  });

  it("shows fictional PayID and BSB on the demo org for invoices", () => {
    expect(demoSeed.org.payId).toBe("harbourline@example.com");
    expect(demoSeed.org.bsb).toBe("000000");
    expect(demoSeed.org.accountNumber).toBe("00012345");
    expect(formatBsb(demoSeed.org.bsb)).toBe("000-000");
    expect(hasInvoicePayDetails(invoicePayDetails(demoSeed.org))).toBe(true);
  });

  it("pins a deposit, variation, and 5% retention on Jordan Walsh without changing Q-0001 money", () => {
    expect(demoSeed.org.retentionPercent).toBe(5);
    const mixed = demoSeed.quotes.find((quote) => quote.docNumber === "Q-0001");
    expect(computeDocument(mixed!.lines).totalCents).toBe(123200);
    const quote = demoSeed.quotes.find((row) => row.docNumber === "Q-0005");
    expect(quote?.jobId).toBe(demoSeed.jobs.find((job) => job.customerName === "Jordan Walsh")?.id);
    expect(computeDocument(quote!.lines).totalCents).toBe(220000);
    expect(computeDocument(quote!.lines).gstCents).toBe(20000);
    const deposit = demoSeed.invoices.find((invoice) => invoice.docNumber === "INV-0003");
    expect(deposit?.kind).toBe("deposit");
    expect(deposit?.claimPercent).toBe(20);
    expect(deposit?.retentionHeldCents).toBe(2200);
    const depositTotals = computeDocument(deposit!.lines);
    expect(depositTotals.totalCents).toBe(44000);
    expect(depositTotals.gstCents).toBe(4000);
    const paid = demoSeed.payments
      .filter((payment) => payment.invoiceId === deposit?.id)
      .reduce((sum, payment) => sum + payment.amountCents, 0);
    expect(paid).toBe(41800);
    const variation = demoSeed.invoices.find((invoice) => invoice.docNumber === "INV-0004");
    expect(variation?.kind).toBe("variation");
    expect(variation?.retentionHeldCents).toBe(1650);
    expect(computeDocument(variation!.lines).totalCents).toBe(33000);
    expect(computeDocument(variation!.lines).gstCents).toBe(3000);
    expect(variation?.dueDate).toBe("2026-09-23");
    expect(
      invoiceIsOverdue({
        status: variation!.status,
        dueDate: variation!.dueDate,
        remainingCents: 33000 - 1650,
        today: "2026-09-09",
      }),
    ).toBe(false);
  });
});
