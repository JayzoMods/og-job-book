import { describe, expect, it } from "vitest";
import {
  gstCentsFromInclusive,
  gstFromExclusive,
  gstFromInclusive,
  lineAmountCents,
  parseAudAmount,
  roundCents,
} from "./money";

describe("GST cents", () => {
  it("takes 1/11 of an inclusive $110", () => {
    expect(gstFromInclusive(110)).toBe(10);
  });

  it("takes 10% of exclusive $100", () => {
    expect(gstFromExclusive(100)).toBe(10);
  });

  it("rounds 1/11 of 12.50 to the nearest cent", () => {
    expect(gstFromInclusive(12.5)).toBe(1.14);
    expect(gstCentsFromInclusive(1250)).toBe(114);
  });

  it("parses amounts with commas and rejects empty", () => {
    expect(parseAudAmount("2,950.00")).toBe(2950);
    expect(parseAudAmount("")).toBeNull();
    expect(parseAudAmount("nope")).toBeNull();
  });

  it("roundCents is nearest cent", () => {
    expect(roundCents(1.006)).toBe(1.01);
    expect(roundCents(1.004)).toBe(1);
  });

  it("lineAmountCents rounds qty × unit at the cent", () => {
    expect(lineAmountCents(0, 10000)).toBe(0);
    expect(lineAmountCents(1.5, 10000)).toBe(15000);
    expect(lineAmountCents(Number.NaN, 10000)).toBe(0);
  });
});
