import { describe, expect, it } from "vitest";
import { parseCustomerName, parseSuburb } from "./customer";

describe("parseCustomerName", () => {
  it("rejects empty and whitespace", () => {
    expect(parseCustomerName("")).toBeNull();
    expect(parseCustomerName("   ")).toBeNull();
    expect(parseCustomerName(null)).toBeNull();
    expect(parseCustomerName(undefined)).toBeNull();
  });

  it("trims and accepts a 120-character name", () => {
    expect(parseCustomerName("  Tom Nguyen  ")).toBe("Tom Nguyen");
    expect(parseCustomerName("A".repeat(120))).toBe("A".repeat(120));
  });

  it("rejects 121 characters", () => {
    expect(parseCustomerName("A".repeat(121))).toBeNull();
  });
});

describe("parseSuburb", () => {
  it("rejects empty and whitespace", () => {
    expect(parseSuburb("")).toBeNull();
    expect(parseSuburb("   ")).toBeNull();
    expect(parseSuburb(null)).toBeNull();
  });

  it("trims and accepts an 80-character suburb", () => {
    expect(parseSuburb("  Randwick  ")).toBe("Randwick");
    expect(parseSuburb("B".repeat(80))).toBe("B".repeat(80));
  });

  it("rejects 81 characters", () => {
    expect(parseSuburb("B".repeat(81))).toBeNull();
  });
});
