import { describe, expect, it } from "vitest";
import { isValidAbn } from "../lib/ledger/abn";
import { lineAmountCents } from "../lib/ledger/money";
import { computeDocument } from "../lib/ledger/tax";
import { hasInvoicePayDetails, invoicePayDetails, formatBsb } from "../lib/ledger/pay";
import { invoiceIsOverdue, quoteIsExpired } from "../lib/ledger/terms";
import { DEMO_IDS, demoSeed } from "./demo-seed";

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

  it("gives each demo job a customer and keeps Jordan Walsh on the claims job", () => {
    expect(demoSeed.customers).toHaveLength(5);
    const keys = new Set(
      demoSeed.customers.map((customer) => `${customer.name}|${customer.suburb}`),
    );
    expect(keys.size).toBe(5);
    for (const job of demoSeed.jobs) {
      expect(demoSeed.customers.some((customer) => customer.id === job.customerId)).toBe(
        true,
      );
    }
    const jordan = demoSeed.customers.find((customer) => customer.id === DEMO_IDS.customerClaims);
    expect(jordan).toEqual({
      id: DEMO_IDS.customerClaims,
      name: "Jordan Walsh",
      suburb: "Glebe",
      phone: "0412 000 333",
      email: "",
    });
  });

  it("pins optional phone and email on customers and notes on jobs without changing Q-0001 money", () => {
    const tom = demoSeed.customers.find((customer) => customer.id === DEMO_IDS.customerQuoted);
    expect(tom?.phone).toBe("0412 000 222");
    expect(tom?.email).toBe("tom.nguyen@example.com");
    const priya = demoSeed.customers.find((customer) => customer.id === DEMO_IDS.customerPaid);
    expect(priya?.phone).toBe("");
    expect(priya?.email).toBe("priya.shah@example.com");
    const quoted = demoSeed.jobs.find((job) => job.id === DEMO_IDS.jobQuoted);
    expect(quoted?.notes).toBe("Quote Q-0001 sent. Access via side gate.");
    expect(quoted?.propertyAddress).toBe("18 Blenheim Street, Randwick NSW 2031");
    expect(quoted?.reportType).toBe("pre_purchase");
    const paid = demoSeed.jobs.find((job) => job.id === DEMO_IDS.jobPaid);
    expect(paid?.notes).toBe("");
    expect(paid?.vendorName).toBe("");
    expect(paid?.purchaserName).toBe("");
    const mixed = demoSeed.quotes.find((quote) => quote.docNumber === "Q-0001");
    expect(computeDocument(mixed!.lines).totalCents).toBe(123200);
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
      "Q-0006",
    ]);
    expect(demoSeed.invoices.map((invoice) => invoice.docNumber)).toEqual([
      "INV-0001",
      "INV-0002",
      "INV-0003",
      "INV-0004",
    ]);
    expect(demoSeed.org.nextQuoteSeq).toBe(6);
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
    expect(quote?.jobId).toBe(
      demoSeed.jobs.find((job) => job.customerId === DEMO_IDS.customerClaims)?.id,
    );
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

  it("pins a duplicated Samira job and a draft revision of Q-0001 without changing Q-0001 money", () => {
    const mixed = demoSeed.quotes.find((quote) => quote.docNumber === "Q-0001");
    expect(computeDocument(mixed!.lines).totalCents).toBe(123200);
    const copy = demoSeed.jobs.find((job) => job.id === DEMO_IDS.jobDuplicate);
    expect(copy?.customerId).toBe(DEMO_IDS.customerEnquiry);
    expect(copy?.duplicatedFromJobId).toBe(DEMO_IDS.jobEnquiry);
    expect(copy?.status).toBe("enquiry");
    expect(copy?.description).toBe("Roof leak after storms — inspection only");
    expect(copy?.propertyAddress).toBe("22 Illawarra Road, Marrickville NSW 2204");
    expect(copy?.reportType).toBe("roof");
    const revision = demoSeed.quotes.find((quote) => quote.docNumber === "Q-0006");
    expect(revision?.jobId).toBe(DEMO_IDS.jobQuoted);
    expect(revision?.status).toBe("draft");
    expect(revision?.revisedFromQuoteId).toBe(DEMO_IDS.quoteMixed);
    expect(computeDocument(revision!.lines).totalCents).toBe(123200);
    expect(computeDocument(revision!.lines).gstCents).toBe(11000);
    expect(mixed?.status).toBe("sent");
    expect(mixed?.shareToken).toBe(DEMO_IDS.quoteMixedShare);
    expect(revision?.shareToken ?? null).toBeNull();
  });

  it("pins optional cost on the rate card and Q-0003 without changing Q-0001 money", () => {
    const mixed = demoSeed.quotes.find((quote) => quote.docNumber === "Q-0001");
    expect(computeDocument(mixed!.lines).totalCents).toBe(123200);
    expect(computeDocument(mixed!.lines).gstCents).toBe(11000);
    expect(mixed!.lines.every((line) => !line.unitCostCents)).toBe(true);
    const inspection = demoSeed.rateCard.find(
      (item) => item.id === DEMO_IDS.ratePrePurchase,
    );
    expect(inspection?.unitPriceCents).toBe(121000);
    expect(inspection?.unitCostCents).toBe(88000);
    const hours = demoSeed.rateCard.find((item) => item.id === DEMO_IDS.rateStormHours);
    expect(hours?.unitCostCents).toBe(8800);
    const area = demoSeed.rateCard.find((item) => item.id === DEMO_IDS.rateRoofM2);
    expect(area?.unitCostCents).toBeNull();
    const draft = demoSeed.quotes.find((quote) => quote.docNumber === "Q-0003");
    expect(draft?.lines[0]?.unitCostCents).toBe(8800);
    expect(draft?.lines[1]?.unitCostCents).toBeUndefined();
    expect(computeDocument(draft!.lines).totalCents).toBe(46200);
  });

  it("pins statement remaining on Alex and a remittance on Priya without changing Q-0001 money", () => {
    const mixed = demoSeed.quotes.find((quote) => quote.docNumber === "Q-0001");
    expect(computeDocument(mixed!.lines).totalCents).toBe(123200);
    expect(computeDocument(mixed!.lines).gstCents).toBe(11000);
    const unpaid = demoSeed.invoices.find((invoice) => invoice.docNumber === "INV-0002");
    const credit = demoSeed.creditNotes.find((note) => note.docNumber === "CN-0001");
    expect(unpaid?.dueDate).toBe("2026-09-01");
    expect(computeDocument(unpaid!.lines).totalCents).toBe(55000);
    expect(computeDocument(credit!.lines).totalCents).toBe(11000);
    const paidInvoice = demoSeed.invoices.find((invoice) => invoice.docNumber === "INV-0001");
    expect(computeDocument(paidInvoice!.lines).totalCents).toBe(44000);
    const priyaPay = demoSeed.payments.find((payment) => payment.id === DEMO_IDS.payment);
    expect(priyaPay?.amountCents).toBe(44000);
    expect(priyaPay?.paidOn).toBe("2026-08-10");
  });

  it("pins a yearly recurring template on Priya without changing Q-0001 or INV-0001 money", () => {
    const mixed = demoSeed.quotes.find((quote) => quote.docNumber === "Q-0001");
    expect(computeDocument(mixed!.lines).totalCents).toBe(123200);
    expect(computeDocument(mixed!.lines).gstCents).toBe(11000);
    const paidInvoice = demoSeed.invoices.find((invoice) => invoice.docNumber === "INV-0001");
    expect(computeDocument(paidInvoice!.lines).totalCents).toBe(44000);
    expect(paidInvoice?.kind).toBe("standard");
    expect(demoSeed.org.nextInvoiceSeq).toBe(4);
    expect(demoSeed.customers).toHaveLength(5);
    const template = demoSeed.recurringInvoices.find(
      (row) => row.id === DEMO_IDS.recurringAnnual,
    );
    expect(template?.jobId).toBe(DEMO_IDS.jobPaid);
    expect(template?.frequency).toBe("yearly");
    expect(template?.nextIssueOn).toBe("2026-09-01");
    expect(template?.endOn).toBeNull();
    expect(template?.status).toBe("active");
    expect(computeDocument(template!.lines).totalCents).toBe(44000);
    expect(computeDocument(template!.lines).gstCents).toBe(4000);
    expect(demoSeed.invoices.some((invoice) => invoice.kind === "recurring")).toBe(false);
  });
});
