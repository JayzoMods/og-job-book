import { describe, expect, it } from "vitest";
import { computeDocument, computeLine, formatLineQuantity, gstProofLabel, parseLineUnit } from "./tax";

describe("tax-code GST flags", () => {
  it("computes inclusive GST on a GST line", () => {
    const line = computeLine({
      description: "Inspection",
      quantity: 1,
      unitPriceCents: 121000,
      taxCode: "GST",
      amountKind: "inclusive",
    });
    expect(line.gstCents).toBe(11000);
    expect(line.totalCents).toBe(121000);
    expect(line.flags).toEqual([]);
  });

  it("flags a GST-free line that still has a GST amount", () => {
    const line = computeLine({
      description: "Booklet",
      quantity: 1,
      unitPriceCents: 2200,
      taxCode: "GST_FREE",
      amountKind: "inclusive",
      gstAmountCents: 200,
    });
    expect(line.flags.some((flag) => flag.code === "gst_on_non_taxable")).toBe(
      true,
    );
  });

  it("flags inclusive GST that is not 1/11", () => {
    const line = computeLine({
      description: "Inspection",
      quantity: 1,
      unitPriceCents: 11000,
      taxCode: "GST",
      amountKind: "inclusive",
      gstAmountCents: 900,
    });
    expect(line.flags.some((flag) => flag.code === "gst_math_mismatch")).toBe(
      true,
    );
  });

  it("adds 10% on an exclusive GST line when registered", () => {
    const line = computeLine({
      description: "Labour",
      quantity: 1,
      unitPriceCents: 40000,
      taxCode: "GST",
      amountKind: "exclusive",
    });
    expect(line.gstCents).toBe(4000);
    expect(line.expectedGstCents).toBe(4000);
    expect(line.totalCents).toBe(44000);
    expect(line.flags).toEqual([]);
  });

  it("empty document totals are zero, including when not GST registered", () => {
    const doc = computeDocument([], false);
    expect(doc.gstCents).toBe(0);
    expect(doc.gstFreeCents).toBe(0);
    expect(doc.totalCents).toBe(0);
    expect(doc.flags).toEqual([]);
  });

  it("mixed GST and GST-free document totals", () => {
    const doc = computeDocument([
      {
        description: "Inspection",
        quantity: 1,
        unitPriceCents: 121000,
        taxCode: "GST",
        amountKind: "inclusive",
      },
      {
        description: "GST-free booklet",
        quantity: 1,
        unitPriceCents: 2200,
        taxCode: "GST_FREE",
        amountKind: "inclusive",
      },
    ]);
    expect(doc.gstCents).toBe(11000);
    expect(doc.gstFreeCents).toBe(2200);
    expect(doc.totalCents).toBe(123200);
    expect(doc.flags).toEqual([]);
  });

  it("zeros GST on a mixed document when not registered", () => {
    const doc = computeDocument(
      [
        {
          description: "Inspection",
          quantity: 1,
          unitPriceCents: 121000,
          taxCode: "GST",
          amountKind: "inclusive",
        },
        {
          description: "GST-free booklet",
          quantity: 1,
          unitPriceCents: 2200,
          taxCode: "GST_FREE",
          amountKind: "inclusive",
        },
      ],
      false,
    );
    expect(doc.gstCents).toBe(0);
    expect(doc.gstFreeCents).toBe(2200);
    expect(doc.totalCents).toBe(123200);
    expect(doc.flags.some((flag) => flag.code === "gst_when_not_registered")).toBe(
      true,
    );
  });

  it("does not charge GST when the org is not registered", () => {
    const line = computeLine(
      {
        description: "Inspection",
        quantity: 1,
        unitPriceCents: 121000,
        taxCode: "GST",
        amountKind: "inclusive",
      },
      false,
    );
    expect(line.gstCents).toBe(0);
    expect(line.expectedGstCents).toBe(11000);
    expect(line.totalCents).toBe(121000);
    expect(line.flags.some((flag) => flag.code === "gst_when_not_registered")).toBe(
      true,
    );
  });

  it("does not add exclusive GST onto the total when not registered", () => {
    const line = computeLine(
      {
        description: "Labour",
        quantity: 1,
        unitPriceCents: 40000,
        taxCode: "GST",
        amountKind: "exclusive",
      },
      false,
    );
    expect(line.gstCents).toBe(0);
    expect(line.totalCents).toBe(40000);
  });

  it("leaves a GST-free line unflagged when not registered", () => {
    const line = computeLine(
      {
        description: "Booklet",
        quantity: 1,
        unitPriceCents: 2200,
        taxCode: "GST_FREE",
        amountKind: "inclusive",
      },
      false,
    );
    expect(line.gstCents).toBe(0);
    expect(line.flags).toEqual([]);
  });

  it("does not treat a 1/11 mismatch as charged GST when not registered", () => {
    const line = computeLine(
      {
        description: "Inspection",
        quantity: 1,
        unitPriceCents: 11000,
        taxCode: "GST",
        amountKind: "inclusive",
        gstAmountCents: 900,
      },
      false,
    );
    expect(line.gstCents).toBe(0);
    expect(line.flags.some((flag) => flag.code === "gst_math_mismatch")).toBe(
      false,
    );
    expect(line.flags.some((flag) => flag.code === "gst_when_not_registered")).toBe(
      true,
    );
  });
});

describe("line units", () => {
  it("treats empty and unknown as each", () => {
    expect(parseLineUnit("")).toBe("each");
    expect(parseLineUnit("widget")).toBe("each");
    expect(parseLineUnit(undefined)).toBe("each");
  });

  it("maps hours and square-metre aliases", () => {
    expect(parseLineUnit("hrs")).toBe("hours");
    expect(parseLineUnit("m²")).toBe("m2");
    expect(parseLineUnit("sq m")).toBe("m2");
  });

  it("formats qty without trailing zeros", () => {
    expect(formatLineQuantity(1, "each")).toBe("1 each");
    expect(formatLineQuantity(2.5, "hours")).toBe("2.5 hours");
    expect(formatLineQuantity(12, "m2")).toBe("12 m²");
  });

  it("does not change GST when the unit is hours", () => {
    const each = computeLine({
      description: "Inspection",
      quantity: 1,
      unitPriceCents: 33000,
      taxCode: "GST",
      amountKind: "inclusive",
    });
    const hours = computeLine({
      description: "Inspection",
      quantity: 2.5,
      unit: "hours",
      unitPriceCents: 13200,
      taxCode: "GST",
      amountKind: "inclusive",
    });
    expect(hours.unit).toBe("hours");
    expect(hours.amountCents).toBe(each.amountCents);
    expect(hours.gstCents).toBe(each.gstCents);
  });
});

describe("gstProofLabel", () => {
  it("shows 1/11 of an inclusive GST line", () => {
    expect(
      gstProofLabel({
        taxCode: "GST",
        amountKind: "inclusive",
        expectedGstCents: 11000,
      }),
    ).toBe("1/11 $110.00");
  });

  it("shows 10% of an exclusive GST line", () => {
    expect(
      gstProofLabel({
        taxCode: "GST",
        amountKind: "exclusive",
        expectedGstCents: 4000,
      }),
    ).toBe("10% $40.00");
  });

  it("is null for GST-free", () => {
    expect(
      gstProofLabel({
        taxCode: "GST_FREE",
        amountKind: "inclusive",
        expectedGstCents: 0,
      }),
    ).toBeNull();
  });
});
