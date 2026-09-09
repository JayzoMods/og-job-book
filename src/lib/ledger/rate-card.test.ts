import { describe, expect, it } from "vitest";
import {
  mergeRateAndTypedLines,
  parseRateDescription,
  parseRatePriceCents,
  rateItemToLine,
} from "./rate-card";

describe("parseRateDescription", () => {
  it("trims and rejects empty or over 120 characters", () => {
    expect(parseRateDescription("  Pre-purchase building inspection  ")).toBe(
      "Pre-purchase building inspection",
    );
    expect(parseRateDescription("")).toBeNull();
    expect(parseRateDescription("   ")).toBeNull();
    expect(parseRateDescription("x".repeat(120))).toBe("x".repeat(120));
    expect(parseRateDescription("x".repeat(121))).toBeNull();
  });
});

describe("parseRatePriceCents", () => {
  it("accepts a positive AUD amount", () => {
    expect(parseRatePriceCents("1210.00")).toBe(121000);
    expect(parseRatePriceCents("  22  ")).toBe(2200);
    expect(parseRatePriceCents(11)).toBe(1100);
  });

  it("rejects empty, junk, zero, and negative", () => {
    expect(parseRatePriceCents("")).toBeNull();
    expect(parseRatePriceCents("nope")).toBeNull();
    expect(parseRatePriceCents("0")).toBeNull();
    expect(parseRatePriceCents(-1)).toBeNull();
  });
});

describe("rateItemToLine", () => {
  it("drops a rate as qty 1 and skips junk tax or empty description", () => {
    expect(
      rateItemToLine(
        {
          description: "Storm inspection",
          unit: "hours",
          unitPriceCents: 13200,
          taxCode: "GST",
          amountKind: "inclusive",
        },
        0,
      ),
    ).toEqual({
      description: "Storm inspection",
      quantity: 1,
      unit: "hours",
      unitPriceCents: 13200,
      unitCostCents: null,
      taxCode: "GST",
      amountKind: "inclusive",
      sortOrder: 0,
    });
    expect(
      rateItemToLine(
        {
          description: "Storm inspection",
          unit: "hours",
          unitPriceCents: 13200,
          unitCostCents: 8800,
          taxCode: "GST",
          amountKind: "inclusive",
        },
        0,
      )?.unitCostCents,
    ).toBe(8800);
    expect(
      rateItemToLine(
        {
          description: "",
          unit: "each",
          unitPriceCents: 100,
          taxCode: "GST",
          amountKind: "inclusive",
        },
        0,
      ),
    ).toBeNull();
  });
});

describe("mergeRateAndTypedLines", () => {
  it("puts rate lines first and reindexes empty sides", () => {
    const rate = [
      {
        description: "Pre-purchase building inspection",
        quantity: 1,
        unit: "each",
        unitPriceCents: 121000,
        taxCode: "GST",
        amountKind: "inclusive",
        sortOrder: 99,
      },
    ];
    const typed = [
      {
        description: "Travel",
        quantity: 1,
        unit: "each",
        unitPriceCents: 2200,
        taxCode: "GST_FREE",
        amountKind: "inclusive",
        sortOrder: 0,
      },
    ];
    expect(mergeRateAndTypedLines(rate, typed).map((line) => line.description)).toEqual([
      "Pre-purchase building inspection",
      "Travel",
    ]);
    expect(mergeRateAndTypedLines(rate, typed).map((line) => line.sortOrder)).toEqual([0, 1]);
    expect(mergeRateAndTypedLines([], typed)).toHaveLength(1);
    expect(mergeRateAndTypedLines(rate, [])).toHaveLength(1);
  });
});
