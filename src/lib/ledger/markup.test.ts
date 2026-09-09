import { describe, expect, it } from "vitest";
import {
  formatMarkupPercent,
  lineCostCents,
  markupNoteText,
  markupPercent,
  markupTotals,
  parseCostCents,
  unitMarkupText,
} from "./markup";

describe("parseCostCents", () => {
  it("allows empty as no cost", () => {
    expect(parseCostCents("")).toEqual({ ok: true, cents: null });
    expect(parseCostCents("   ")).toEqual({ ok: true, cents: null });
    expect(parseCostCents(null)).toEqual({ ok: true, cents: null });
  });

  it("accepts a positive AUD amount", () => {
    expect(parseCostCents("880.00")).toEqual({ ok: true, cents: 88000 });
    expect(parseCostCents("  88  ")).toEqual({ ok: true, cents: 8800 });
    expect(parseCostCents(10)).toEqual({ ok: true, cents: 1000 });
  });

  it("rejects junk, zero, and negative", () => {
    expect(parseCostCents("nope")).toEqual({ ok: false });
    expect(parseCostCents("0")).toEqual({ ok: false });
    expect(parseCostCents(-1)).toEqual({ ok: false });
  });
});

describe("markupPercent", () => {
  it("is (sell − cost) / cost as one decimal", () => {
    expect(markupPercent(121000, 88000)).toBe(37.5);
    expect(markupPercent(13200, 8800)).toBe(50);
    expect(markupPercent(2200, 1000)).toBe(120);
    expect(markupPercent(88000, 88000)).toBe(0);
  });

  it("allows sell below cost and skips missing cost", () => {
    expect(markupPercent(1000, 2000)).toBe(-50);
    expect(markupPercent(121000, null)).toBeNull();
    expect(markupPercent(121000, 0)).toBeNull();
  });
});

describe("lineCostCents and markupTotals", () => {
  it("scales cost by qty and ignores lines without cost", () => {
    expect(lineCostCents(2.5, 8800)).toBe(22000);
    expect(lineCostCents(1, null)).toBeNull();
    const totals = markupTotals([
      { quantity: 2.5, unitPriceCents: 13200, unitCostCents: 8800 },
      { quantity: 12, unitPriceCents: 1100, unitCostCents: null },
    ]);
    expect(totals.costCents).toBe(22000);
    expect(totals.sellCents).toBe(33000);
    expect(totals.percent).toBe(50);
    expect(totals.lineCount).toBe(1);
    expect(markupTotals([{ quantity: 1, unitPriceCents: 121000 }]).percent).toBeNull();
  });
});

describe("labels", () => {
  it("formats unit markup and a document note", () => {
    expect(formatMarkupPercent(37.5)).toBe("37.5%");
    expect(unitMarkupText(121000, 88000)).toBe("Cost $880.00 · markup 37.5%");
    expect(unitMarkupText(121000, null)).toBeNull();
    expect(
      markupNoteText([{ quantity: 1, unitPriceCents: 13200, unitCostCents: 8800 }]),
    ).toBe(
      "Internal — not printed. Cost $88.00 · sell $132.00 · markup 50.0%. Not tax advice.",
    );
    expect(markupNoteText([{ quantity: 1, unitPriceCents: 1100 }])).toBeNull();
  });
});
