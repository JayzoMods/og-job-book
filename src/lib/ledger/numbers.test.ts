import { describe, expect, it } from "vitest";
import { formatDocNumber } from "./numbers";

describe("formatDocNumber", () => {
  it("pads quote 1 to Q-0001", () => {
    expect(formatDocNumber("Q", 1)).toBe("Q-0001");
  });

  it("pads invoice 12 to INV-0012", () => {
    expect(formatDocNumber("INV", 12)).toBe("INV-0012");
  });

  it("pads credit 1 to CN-0001", () => {
    expect(formatDocNumber("CN", 1)).toBe("CN-0001");
  });

  it("does not truncate five-digit sequences", () => {
    expect(formatDocNumber("Q", 10000)).toBe("Q-10000");
  });

  it("rejects empty, zero, and non-integers", () => {
    expect(() => formatDocNumber("Q", 0)).toThrow();
    expect(() => formatDocNumber("Q", 1.5)).toThrow();
    expect(() => formatDocNumber("INV", Number.NaN)).toThrow();
  });
});
