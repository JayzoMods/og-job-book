import { describe, expect, it } from "vitest";
import { computeDocument } from "./tax";
import { DEMO_IDS, demoSeed } from "../../data/demo-seed";
import {
  BAS_CHECK_CSV_HEADER,
  csvAmountFromCents,
  csvCell,
  creditExportRows,
  exportFilename,
  invoiceExportRows,
  parseExportFormat,
  paymentBelongsInExport,
  quoteExportRows,
  toBasCheckCsv,
  toLedgerCsv,
  type ExportLineRow,
} from "./export";

function customerForJob(jobId: string) {
  const job = demoSeed.jobs.find((row) => row.id === jobId);
  const customer = demoSeed.customers.find((row) => row.id === job?.customerId);
  return {
    jobDescription: job?.description ?? "",
    customerName: customer?.name ?? "",
    suburb: customer?.suburb ?? "",
  };
}

function invoiceRows(docNumber: string, asAt: string, from: string | null): ExportLineRow[] {
  const invoice = demoSeed.invoices.find((row) => row.docNumber === docNumber);
  if (!invoice) {
    throw new Error(`missing ${docNumber}`);
  }
  const contact = customerForJob(invoice.jobId);
  return invoiceExportRows({
    docNumber: invoice.docNumber,
    status: invoice.status,
    dueDate: invoice.dueDate,
    paymentTermsDays: invoice.paymentTermsDays,
    ...contact,
    lines: computeDocument(invoice.lines).lines,
    asAt,
    from,
  });
}

function creditRows(docNumber: string, asAt: string, from: string | null): ExportLineRow[] {
  const note = demoSeed.creditNotes.find((row) => row.docNumber === docNumber);
  const invoice = demoSeed.invoices.find((row) => row.id === note?.invoiceId);
  if (!note || !invoice) {
    throw new Error(`missing ${docNumber}`);
  }
  const contact = customerForJob(invoice.jobId);
  return creditExportRows({
    docNumber: note.docNumber,
    status: note.status,
    invoiceStatus: invoice.status,
    invoiceDueDate: invoice.dueDate,
    invoicePaymentTermsDays: invoice.paymentTermsDays,
    ...contact,
    lines: computeDocument(note.lines).lines,
    asAt,
    from,
  });
}

function allSalesRows(asAt: string, from: string | null): ExportLineRow[] {
  const invoices = demoSeed.invoices.flatMap((invoice) =>
    invoiceRows(invoice.docNumber, asAt, from),
  );
  const credits = demoSeed.creditNotes.flatMap((note) =>
    creditRows(note.docNumber, asAt, from),
  );
  return [...invoices, ...credits];
}

describe("paymentBelongsInExport", () => {
  it("keeps payments on or before as-at and skips junk dates", () => {
    expect(paymentBelongsInExport("2026-08-10", "2026-08-10", null)).toBe(true);
    expect(paymentBelongsInExport("2026-08-10", "2026-08-09", null)).toBe(false);
    expect(paymentBelongsInExport("2026-08-10", "2026-09-09", "2026-09-01")).toBe(false);
    expect(paymentBelongsInExport("not-a-date", "2026-09-09", null)).toBe(false);
  });
});

describe("parseExportFormat", () => {
  it("accepts json, csv, and BAS Check aliases", () => {
    expect(parseExportFormat("json")).toBe("json");
    expect(parseExportFormat("CSV")).toBe("csv");
    expect(parseExportFormat("bas-check")).toBe("bas-check");
    expect(parseExportFormat("bas_check")).toBe("bas-check");
    expect(parseExportFormat("BASCHECK")).toBe("bas-check");
  });

  it("rejects empty and junk", () => {
    expect(parseExportFormat("")).toBeNull();
    expect(parseExportFormat("  ")).toBeNull();
    expect(parseExportFormat("xlsx")).toBeNull();
    expect(parseExportFormat(null)).toBeNull();
  });
});

describe("csvCell", () => {
  it("quotes commas and doubles quotes", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("Pest, inspection")).toBe('"Pest, inspection"');
    expect(csvCell('He said "hi"')).toBe('"He said ""hi"""');
  });
});

describe("csvAmountFromCents", () => {
  it("writes two decimal places including negatives", () => {
    expect(csvAmountFromCents(44000)).toBe("440.00");
    expect(csvAmountFromCents(1650)).toBe("16.50");
    expect(csvAmountFromCents(-11000)).toBe("-110.00");
  });
});

describe("BAS Check-shaped CSV (demo)", () => {
  it("exports live invoice and credit lines without Q-0001", () => {
    const mixed = demoSeed.quotes.find((quote) => quote.docNumber === "Q-0001");
    expect(computeDocument(mixed!.lines).totalCents).toBe(123200);
    expect(computeDocument(mixed!.lines).gstCents).toBe(11000);
    const csv = toBasCheckCsv(allSalesRows("2026-09-09", null));
    expect(csv.startsWith(`${BAS_CHECK_CSV_HEADER.join(",")}\n`)).toBe(true);
    expect(csv).toContain(
      "2026-08-01,INV-0001 · Annual safety inspection,440.00,GST,40.00,inclusive,",
    );
    expect(csv).toContain(
      "2026-08-18,INV-0002 · Pest inspection before settlement,550.00,GST,50.00,inclusive,",
    );
    expect(csv).toContain(
      "2026-08-18,CN-0001 · Access delay discount,-110.00,GST,-10.00,inclusive,",
    );
    expect(csv).toContain("2026-08-12,INV-0003 · Deposit 20% of Q-0005,440.00,GST,40.00,inclusive,");
    expect(csv).toContain(
      "2026-09-09,INV-0004 · Extra flashing at south parapet,330.00,GST,30.00,inclusive,",
    );
    expect(csv).not.toContain("Q-0001");
    expect(csv).not.toContain("1210.00");
    expect(csv).not.toContain("Pre-purchase building inspection");
    expect(csv).not.toContain("51824753556");
  });

  it("drops invoices issued after as-at and before from", () => {
    const asAtFirst = toBasCheckCsv(allSalesRows("2026-08-01", null));
    expect(asAtFirst).toContain("INV-0001");
    expect(asAtFirst).not.toContain("INV-0002");
    expect(asAtFirst).not.toContain("INV-0004");
    const fromSept = toBasCheckCsv(allSalesRows("2026-09-09", "2026-09-01"));
    expect(fromSept).toContain("INV-0004");
    expect(fromSept).not.toContain("INV-0001");
    expect(fromSept).not.toContain("INV-0002");
    expect(fromSept).not.toContain("CN-0001");
  });

  it("writes a header-only file when there are no sales lines", () => {
    expect(toBasCheckCsv([])).toBe(`${BAS_CHECK_CSV_HEADER.join(",")}\n`);
  });

  it("strips quote rows if they are passed in", () => {
    const quote = demoSeed.quotes.find((row) => row.docNumber === "Q-0001");
    const job = customerForJob(quote!.jobId);
    const rows = quoteExportRows({
      docNumber: quote!.docNumber,
      status: quote!.status,
      validUntil: quote!.validUntil,
      ...job,
      lines: computeDocument(quote!.lines).lines,
    });
    const csv = toBasCheckCsv([...rows, ...invoiceRows("INV-0001", "2026-09-09", null)]);
    expect(csv).not.toContain("Q-0001");
    expect(csv).toContain("INV-0001");
  });
});

describe("ledger CSV", () => {
  it("keeps quotes in the Job Book CSV and credits as negative totals", () => {
    const quote = demoSeed.quotes.find((row) => row.docNumber === "Q-0001");
    const job = customerForJob(quote!.jobId);
    const csv = toLedgerCsv([
      ...quoteExportRows({
        docNumber: quote!.docNumber,
        status: quote!.status,
        validUntil: quote!.validUntil,
        ...job,
        lines: computeDocument(quote!.lines).lines,
      }),
      ...allSalesRows("2026-09-09", null),
    ]);
    expect(csv).toContain("quote,Q-0001,sent,2026-09-01,Tom Nguyen");
    expect(csv).toContain("1210.00");
    expect(csv).toContain("credit,CN-0001,issued,2026-08-18,Alex Moretti");
    expect(csv).toContain("-110.00");
    expect(quote?.id).toBe(DEMO_IDS.quoteMixed);
  });
});

describe("exportFilename", () => {
  it("names files by format and as-at date", () => {
    expect(exportFilename("json", "2026-09-09")).toBe("og-job-book-2026-09-09.json");
    expect(exportFilename("csv", "2026-09-09")).toBe("og-job-book-2026-09-09.csv");
    expect(exportFilename("bas-check", "2026-09-09")).toBe(
      "og-job-book-bas-check-2026-09-09.csv",
    );
  });
});
