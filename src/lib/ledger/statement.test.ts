import { describe, expect, it } from "vitest";
import { creditedCentsFromNotes } from "./credit";
import { computeDocument } from "./tax";
import { DEMO_IDS, demoSeed } from "../../data/demo-seed";
import {
  ageBucket,
  calendarDaysBetween,
  invoiceIssuedOn,
  invoiceOnStatement,
  paidCentsAsAt,
  parseStatementDates,
  paymentMethodLabel,
  remittanceAdvice,
  statementRows,
  statementTotals,
  type StatementInvoiceInput,
} from "./statement";

function seedInvoice(docNumber: string): StatementInvoiceInput {
  const invoice = demoSeed.invoices.find((row) => row.docNumber === docNumber);
  if (!invoice) {
    throw new Error(`missing ${docNumber}`);
  }
  const job = demoSeed.jobs.find((row) => row.id === invoice.jobId);
  const notes = demoSeed.creditNotes.filter((note) => note.invoiceId === invoice.id);
  return {
    id: invoice.id,
    jobId: invoice.jobId,
    jobDescription: job?.description ?? "",
    docNumber: invoice.docNumber,
    status: invoice.status,
    kind: invoice.kind,
    dueDate: invoice.dueDate,
    paymentTermsDays: invoice.paymentTermsDays,
    totalCents: computeDocument(invoice.lines).totalCents,
    creditedCents: creditedCentsFromNotes(
      notes.map((note) => ({
        status: note.status,
        totalCents: computeDocument(note.lines).totalCents,
      })),
    ),
    retentionHeldCents: invoice.retentionHeldCents,
    payments: demoSeed.payments.filter((payment) => payment.invoiceId === invoice.id),
  };
}

describe("parseStatementDates", () => {
  it("uses today when as-at is empty and leaves from open", () => {
    expect(parseStatementDates("", "", "2026-09-09")).toEqual({
      ok: true,
      asAt: "2026-09-09",
      from: null,
    });
    expect(parseStatementDates("  ", "  ", "2026-09-09")).toEqual({
      ok: true,
      asAt: "2026-09-09",
      from: null,
    });
  });

  it("rejects junk dates and a from date after as-at", () => {
    expect(parseStatementDates("not-a-date", "", "2026-09-09").ok).toBe(false);
    expect(parseStatementDates("2026-09-09", "09/09/2026", "2026-09-09").ok).toBe(false);
    expect(parseStatementDates("2026-09-01", "2026-09-02", "2026-09-09").ok).toBe(false);
    expect(parseStatementDates("2026-02-31", "", "2026-09-09").ok).toBe(false);
  });

  it("keeps from equal to as-at", () => {
    expect(parseStatementDates("2026-09-09", "2026-09-09", "2026-09-08")).toEqual({
      ok: true,
      asAt: "2026-09-09",
      from: "2026-09-09",
    });
  });
});

describe("invoiceIssuedOn", () => {
  it("is due minus stamped terms", () => {
    expect(invoiceIssuedOn("2026-09-01", 14)).toBe("2026-08-18");
    expect(invoiceIssuedOn("2026-08-15", 0)).toBe("2026-08-15");
    expect(invoiceIssuedOn("", 14)).toBeNull();
    expect(invoiceIssuedOn("not-a-date", 14)).toBeNull();
  });
});

describe("invoiceOnStatement", () => {
  it("drops void and draft, and invoices issued after as-at", () => {
    expect(
      invoiceOnStatement({
        status: "void",
        dueDate: "2026-09-01",
        paymentTermsDays: 14,
        asAt: "2026-09-09",
        from: null,
      }),
    ).toBe(false);
    expect(
      invoiceOnStatement({
        status: "draft",
        dueDate: "2026-09-01",
        paymentTermsDays: 14,
        asAt: "2026-09-09",
        from: null,
      }),
    ).toBe(false);
    expect(
      invoiceOnStatement({
        status: "sent",
        dueDate: "2026-09-23",
        paymentTermsDays: 14,
        asAt: "2026-09-08",
        from: null,
      }),
    ).toBe(false);
  });

  it("drops invoices issued before from", () => {
    expect(
      invoiceOnStatement({
        status: "sent",
        dueDate: "2026-09-01",
        paymentTermsDays: 14,
        asAt: "2026-09-09",
        from: "2026-09-01",
      }),
    ).toBe(false);
    expect(
      invoiceOnStatement({
        status: "sent",
        dueDate: "2026-09-23",
        paymentTermsDays: 14,
        asAt: "2026-09-09",
        from: "2026-09-01",
      }),
    ).toBe(true);
  });
});

describe("paidCentsAsAt", () => {
  it("counts payments on or before as-at and skips junk dates", () => {
    const payments = [
      { paidOn: "2026-08-10", amountCents: 44000 },
      { paidOn: "not-a-date", amountCents: 100 },
    ];
    expect(paidCentsAsAt(payments, "2026-08-09")).toBe(0);
    expect(paidCentsAsAt(payments, "2026-08-10")).toBe(44000);
    expect(paidCentsAsAt([], "2026-09-09")).toBe(0);
  });
});

describe("ageBucket", () => {
  it("is current when due is today or later, and empty remaining is not aged", () => {
    expect(
      ageBucket({ dueDate: "2026-09-09", remainingCents: 31350, asAt: "2026-09-09" }),
    ).toBe("current");
    expect(
      ageBucket({ dueDate: "2026-09-23", remainingCents: 31350, asAt: "2026-09-09" }),
    ).toBe("current");
    expect(ageBucket({ dueDate: "2026-09-01", remainingCents: 0, asAt: "2026-09-09" })).toBeNull();
  });

  it("buckets overdue remaining", () => {
    expect(
      ageBucket({ dueDate: "2026-09-01", remainingCents: 44000, asAt: "2026-09-09" }),
    ).toBe("days1to30");
    expect(
      ageBucket({ dueDate: "2026-08-10", remainingCents: 100, asAt: "2026-09-09" }),
    ).toBe("days1to30");
    expect(
      ageBucket({ dueDate: "2026-08-09", remainingCents: 100, asAt: "2026-09-09" }),
    ).toBe("days31to60");
    expect(
      ageBucket({ dueDate: "2026-06-15", remainingCents: 100, asAt: "2026-09-09" }),
    ).toBe("days61to90");
    expect(
      ageBucket({ dueDate: "2026-06-11", remainingCents: 100, asAt: "2026-09-09" }),
    ).toBe("days61to90");
    expect(
      ageBucket({ dueDate: "2026-06-10", remainingCents: 100, asAt: "2026-09-09" }),
    ).toBe("days90plus");
    expect(calendarDaysBetween("2026-09-01", "2026-09-09")).toBe(8);
  });
});

describe("statementRows (demo)", () => {
  it("shows Alex Moretti owing $440 in 1–30 days as at 9 Sep 2026", () => {
    const mixed = demoSeed.quotes.find((quote) => quote.docNumber === "Q-0001");
    expect(computeDocument(mixed!.lines).totalCents).toBe(123200);
    expect(computeDocument(mixed!.lines).gstCents).toBe(11000);
    const rows = statementRows([seedInvoice("INV-0002")], "2026-09-09", null);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.docNumber).toBe("INV-0002");
    expect(rows[0]?.issuedOn).toBe("2026-08-18");
    expect(rows[0]?.totalCents).toBe(55000);
    expect(rows[0]?.creditedCents).toBe(11000);
    expect(rows[0]?.remainingCents).toBe(44000);
    expect(rows[0]?.overdue).toBe(true);
    expect(rows[0]?.age).toBe("days1to30");
    expect(statementTotals(rows).remainingCents).toBe(44000);
    expect(statementTotals(rows).days1to30Cents).toBe(44000);
  });

  it("treats Priya’s payment as unpaid before 10 Aug and paid on that day", () => {
    const before = statementRows([seedInvoice("INV-0001")], "2026-08-09", null);
    expect(before[0]?.remainingCents).toBe(44000);
    expect(before[0]?.paidCents).toBe(0);
    const onDay = statementRows([seedInvoice("INV-0001")], "2026-08-10", null);
    expect(onDay[0]?.remainingCents).toBe(0);
    expect(onDay[0]?.paidCents).toBe(44000);
  });

  it("ages Jordan’s variation as current and holds retention out of owing", () => {
    const rows = statementRows(
      [seedInvoice("INV-0003"), seedInvoice("INV-0004")],
      "2026-09-09",
      null,
    );
    expect(rows.map((row) => row.docNumber)).toEqual(["INV-0003", "INV-0004"]);
    expect(rows[0]?.remainingCents).toBe(0);
    expect(rows[1]?.remainingCents).toBe(31350);
    expect(rows[1]?.age).toBe("current");
    expect(statementTotals(rows).remainingCents).toBe(31350);
    expect(statementTotals(rows).currentCents).toBe(31350);
    expect(statementTotals(rows).retentionHeldCents).toBe(2200 + 1650);
  });

  it("returns no rows for a customer with no invoices", () => {
    expect(statementRows([], "2026-09-09", null)).toEqual([]);
    expect(statementTotals([]).remainingCents).toBe(0);
  });
});

describe("remittanceAdvice", () => {
  it("records Priya’s INV-0001 transfer with nothing left owing", () => {
    const invoice = seedInvoice("INV-0001");
    const payment = invoice.payments[0];
    expect(
      remittanceAdvice({
        paidOn: payment!.paidOn,
        method: payment!.method,
        amountCents: payment!.amountCents,
        invoiceDocNumber: invoice.docNumber,
        invoiceTotalCents: invoice.totalCents,
        creditedCents: invoice.creditedCents,
        retentionHeldCents: invoice.retentionHeldCents,
        payments: invoice.payments,
      }),
    ).toEqual({
      paidOn: "2026-08-10",
      methodLabel: "Transfer",
      amountCents: 44000,
      invoiceDocNumber: "INV-0001",
      invoiceTotalCents: 44000,
      recordedCents: 44000,
      creditedCents: 0,
      retentionHeldCents: 0,
      remainingCents: 0,
    });
    expect(invoice.id).toBe(DEMO_IDS.invoice);
  });

  it("keeps Jordan’s deposit remittance net of retention", () => {
    const invoice = seedInvoice("INV-0003");
    const payment = invoice.payments[0];
    const advice = remittanceAdvice({
      paidOn: payment!.paidOn,
      method: payment!.method,
      amountCents: payment!.amountCents,
      invoiceDocNumber: invoice.docNumber,
      invoiceTotalCents: invoice.totalCents,
      creditedCents: invoice.creditedCents,
      retentionHeldCents: invoice.retentionHeldCents,
      payments: invoice.payments,
    });
    expect(advice.amountCents).toBe(41800);
    expect(advice.remainingCents).toBe(0);
    expect(advice.retentionHeldCents).toBe(2200);
  });
});

describe("paymentMethodLabel", () => {
  it("labels known methods and keeps empty as Payment", () => {
    expect(paymentMethodLabel("")).toBe("Payment");
    expect(paymentMethodLabel("transfer")).toBe("Transfer");
    expect(paymentMethodLabel("CASH")).toBe("Cash");
    expect(paymentMethodLabel("other")).toBe("other");
  });
});
