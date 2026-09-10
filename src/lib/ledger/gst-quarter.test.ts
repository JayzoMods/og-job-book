import { describe, expect, it } from "vitest";
import { computeDocument } from "./tax";
import { DEMO_IDS, demoSeed } from "../../data/demo-seed";
import {
  GST_QUARTER_DISCLAIMER,
  gstQuarterChoices,
  gstQuarterLabel,
  gstQuarterRows,
  gstQuarterTotals,
  parseGstQuarter,
  type GstQuarterDocInput,
} from "./gst-quarter";

function customerForJob(jobId: string) {
  const job = demoSeed.jobs.find((row) => row.id === jobId);
  const customer = demoSeed.customers.find((row) => row.id === job?.customerId);
  return {
    jobDescription: job?.description ?? "",
    customerName: customer?.name ?? "",
  };
}

function seedDocs(gstRegistered = true): GstQuarterDocInput[] {
  return demoSeed.invoices.map((invoice) => {
    const contact = customerForJob(invoice.jobId);
    const notes = demoSeed.creditNotes.filter((note) => note.invoiceId === invoice.id);
    const totals = computeDocument(invoice.lines, gstRegistered);
    return {
      status: invoice.status,
      dueDate: invoice.dueDate,
      paymentTermsDays: invoice.paymentTermsDays,
      kind: invoice.kind,
      docNumber: invoice.docNumber,
      ...contact,
      gstCents: totals.gstCents,
      gstFreeCents: totals.gstFreeCents,
      otherCents: totals.otherCents,
      totalCents: totals.totalCents,
      creditNotes: notes.map((note) => {
        const noteTotals = computeDocument(note.lines, gstRegistered);
        return {
          status: note.status,
          docNumber: note.docNumber,
          gstCents: noteTotals.gstCents,
          gstFreeCents: noteTotals.gstFreeCents,
          otherCents: noteTotals.otherCents,
          totalCents: noteTotals.totalCents,
        };
      }),
    };
  });
}

describe("parseGstQuarter", () => {
  it("uses the quarter containing today when empty", () => {
    expect(parseGstQuarter("", "2026-09-10")).toEqual({
      ok: true,
      from: "2026-07-01",
      to: "2026-09-30",
      value: "2026-07",
      label: "Jul–Sep 2026",
    });
    expect(parseGstQuarter("  ", "2026-09-10")).toEqual({
      ok: true,
      from: "2026-07-01",
      to: "2026-09-30",
      value: "2026-07",
      label: "Jul–Sep 2026",
    });
  });

  it("snaps YYYY-MM and a day in the quarter to the ATO quarter", () => {
    expect(parseGstQuarter("2026-07", "2026-01-01")).toMatchObject({
      from: "2026-07-01",
      to: "2026-09-30",
      value: "2026-07",
    });
    expect(parseGstQuarter("2026-08-15", "2026-01-01")).toMatchObject({
      from: "2026-07-01",
      to: "2026-09-30",
    });
    expect(parseGstQuarter("2026-04", "2026-01-01")).toMatchObject({
      from: "2026-04-01",
      to: "2026-06-30",
      label: "Apr–Jun 2026",
    });
    expect(parseGstQuarter("2026-01-01", "2026-09-10")).toMatchObject({
      from: "2026-01-01",
      to: "2026-03-31",
    });
    expect(parseGstQuarter("2026-12-31", "2026-09-10")).toMatchObject({
      from: "2026-10-01",
      to: "2026-12-31",
    });
  });

  it("rejects junk, unpadded months, and invalid calendar days", () => {
    expect(parseGstQuarter("not-a-date", "2026-09-10").ok).toBe(false);
    expect(parseGstQuarter("2026-Q1", "2026-09-10").ok).toBe(false);
    expect(parseGstQuarter("2026-7", "2026-09-10").ok).toBe(false);
    expect(parseGstQuarter("2026-13", "2026-09-10").ok).toBe(false);
    expect(parseGstQuarter("2026-00", "2026-09-10").ok).toBe(false);
    expect(parseGstQuarter("2026-02-31", "2026-09-10").ok).toBe(false);
    expect(parseGstQuarter(null, "not-today").ok).toBe(false);
  });
});

describe("gstQuarterLabel", () => {
  it("labels ATO quarters in en-AU month names", () => {
    expect(gstQuarterLabel("2026-07-01", "2026-09-30")).toBe("Jul–Sep 2026");
    expect(gstQuarterLabel("2026-10-01", "2026-12-31")).toBe("Oct–Dec 2026");
  });
});

describe("gstQuarterChoices", () => {
  it("lists this quarter first and walks backwards", () => {
    const choices = gstQuarterChoices("2026-09-10", 2);
    expect(choices[0]).toEqual({ value: "2026-07", label: "Jul–Sep 2026" });
    expect(choices[1]).toEqual({ value: "2026-04", label: "Apr–Jun 2026" });
    expect(choices[2]).toEqual({ value: "2026-01", label: "Jan–Mar 2026" });
    expect(choices).toHaveLength(3);
  });

  it("returns empty when today is junk", () => {
    expect(gstQuarterChoices("not-a-date")).toEqual([]);
  });
});

describe("GST quarter report (demo)", () => {
  it("pins Jul–Sep 2026 sales GST after CN-0001 and leaves Q-0001 money unchanged", () => {
    const mixed = demoSeed.quotes.find((quote) => quote.docNumber === "Q-0001");
    expect(computeDocument(mixed!.lines).gstCents).toBe(11000);
    expect(computeDocument(mixed!.lines).totalCents).toBe(123200);
    expect(mixed?.id).toBe(DEMO_IDS.quoteMixed);

    const quarter = parseGstQuarter("2026-07", "2026-09-10");
    expect(quarter.ok).toBe(true);
    if (!quarter.ok) {
      return;
    }
    const rows = gstQuarterRows(seedDocs(), quarter.from, quarter.to);
    expect(rows.map((row) => row.docNumber)).toEqual([
      "INV-0001",
      "INV-0003",
      "INV-0002",
      "CN-0001",
      "INV-0004",
    ]);
    const totals = gstQuarterTotals(rows);
    expect(totals.totalCents).toBe(165000);
    expect(totals.gstCents).toBe(15000);
    expect(totals.gstFreeCents).toBe(0);
    expect(totals.otherCents).toBe(0);
    expect(rows.find((row) => row.docNumber === "INV-0003")?.gstCents).toBe(4000);
    expect(rows.find((row) => row.docNumber === "INV-0004")?.gstCents).toBe(3000);
    expect(rows.find((row) => row.docNumber === "CN-0001")?.gstCents).toBe(-1000);
    expect(rows.find((row) => row.docNumber === "CN-0001")?.gstFreeCents).toBe(0);
    expect(Object.is(rows.find((row) => row.docNumber === "CN-0001")?.gstFreeCents, 0)).toBe(true);
    expect(rows.some((row) => row.docNumber.startsWith("Q-"))).toBe(false);
    expect(GST_QUARTER_DISCLAIMER).toMatch(/not a BAS/i);
    expect(GST_QUARTER_DISCLAIMER).toMatch(/do not lodge/i);
  });

  it("is empty in Apr–Jun 2026 and Oct–Dec 2026", () => {
    const apr = parseGstQuarter("2026-04", "2026-09-10");
    const oct = parseGstQuarter("2026-10", "2026-09-10");
    expect(apr.ok && gstQuarterRows(seedDocs(), apr.from, apr.to)).toEqual([]);
    expect(oct.ok && gstQuarterRows(seedDocs(), oct.from, oct.to)).toEqual([]);
  });

  it("excludes void and draft invoices and void credit notes", () => {
    const base = seedDocs().find((row) => row.docNumber === "INV-0001");
    if (!base) {
      throw new Error("missing INV-0001");
    }
    const rows = gstQuarterRows(
      [
        { ...base, status: "void" },
        { ...base, docNumber: "INV-DRAFT", status: "draft" },
        {
          ...base,
          docNumber: "INV-LIVE",
          creditNotes: [
            {
              status: "void",
              docNumber: "CN-VOID",
              gstCents: 1000,
              gstFreeCents: 0,
              otherCents: 0,
              totalCents: 11000,
            },
          ],
        },
      ],
      "2026-07-01",
      "2026-09-30",
    );
    expect(rows.map((row) => row.docNumber)).toEqual(["INV-LIVE"]);
  });

  it("zeros GST when the org is not registered and still totals sales", () => {
    const quarter = parseGstQuarter("2026-07", "2026-09-10");
    expect(quarter.ok).toBe(true);
    if (!quarter.ok) {
      return;
    }
    const totals = gstQuarterTotals(gstQuarterRows(seedDocs(false), quarter.from, quarter.to));
    expect(totals.gstCents).toBe(0);
    expect(totals.totalCents).toBe(165000);
  });

  it("splits GST-free and exclusive GST lines", () => {
    const gstExclusive = computeDocument([
      {
        description: "Hourly",
        quantity: 1,
        unit: "hours",
        unitPriceCents: 10000,
        taxCode: "GST",
        amountKind: "exclusive",
      },
    ]);
    const gstFree = computeDocument([
      {
        description: "Booklet",
        quantity: 1,
        unit: "each",
        unitPriceCents: 2200,
        taxCode: "GST_FREE",
        amountKind: "inclusive",
      },
    ]);
    const rows = gstQuarterRows(
      [
        {
          status: "sent",
          dueDate: "2026-07-15",
          paymentTermsDays: 0,
          kind: "standard",
          docNumber: "INV-EXCL",
          customerName: "Alex",
          jobDescription: "Hourly",
          gstCents: gstExclusive.gstCents,
          gstFreeCents: gstExclusive.gstFreeCents,
          otherCents: gstExclusive.otherCents,
          totalCents: gstExclusive.totalCents,
          creditNotes: [],
        },
        {
          status: "sent",
          dueDate: "2026-07-15",
          paymentTermsDays: 0,
          kind: "standard",
          docNumber: "INV-FREE",
          customerName: "Tom",
          jobDescription: "Booklet",
          gstCents: gstFree.gstCents,
          gstFreeCents: gstFree.gstFreeCents,
          otherCents: gstFree.otherCents,
          totalCents: gstFree.totalCents,
          creditNotes: [],
        },
      ],
      "2026-07-01",
      "2026-09-30",
    );
    const totals = gstQuarterTotals(rows);
    expect(gstExclusive.gstCents).toBe(1000);
    expect(gstExclusive.totalCents).toBe(11000);
    expect(gstFree.gstFreeCents).toBe(2200);
    expect(totals.gstCents).toBe(1000);
    expect(totals.gstFreeCents).toBe(2200);
    expect(totals.totalCents).toBe(13200);
  });
});
