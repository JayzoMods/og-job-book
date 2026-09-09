import { describe, expect, it } from "vitest";
import { parseEmail, parseJobNotes, parsePhone } from "./contact";

describe("parsePhone", () => {
  it("allows empty", () => {
    expect(parsePhone("")).toBe("");
    expect(parsePhone("   ")).toBe("");
    expect(parsePhone(null)).toBe("");
  });

  it("keeps a trimmed AU-shaped number as typed", () => {
    expect(parsePhone("  0412 000 222  ")).toBe("0412 000 222");
    expect(parsePhone("02 0000 0000")).toBe("02 0000 0000");
  });

  it("rejects fewer than 8 digits, more than 15 digits, and over 40 characters", () => {
    expect(parsePhone("1234567")).toBeNull();
    expect(parsePhone("1".repeat(16))).toBeNull();
    expect(parsePhone(`${"0".repeat(8)}${"x".repeat(33)}`)).toBeNull();
  });
});

describe("parseEmail", () => {
  it("allows empty", () => {
    expect(parseEmail("")).toBe("");
    expect(parseEmail("   ")).toBe("");
  });

  it("accepts a simple address", () => {
    expect(parseEmail("  tom.nguyen@example.com  ")).toBe("tom.nguyen@example.com");
  });

  it("rejects missing @, missing domain dot, and over 80 characters", () => {
    expect(parseEmail("not-an-email")).toBeNull();
    expect(parseEmail("tom@example")).toBeNull();
    expect(parseEmail(`a@b.${"c".repeat(80)}`)).toBeNull();
  });
});

describe("parseJobNotes", () => {
  it("allows empty and trims", () => {
    expect(parseJobNotes("")).toBe("");
    expect(parseJobNotes("  Access via side gate.  ")).toBe("Access via side gate.");
  });

  it("accepts 2000 characters and rejects 2001", () => {
    expect(parseJobNotes("n".repeat(2000))).toBe("n".repeat(2000));
    expect(parseJobNotes("n".repeat(2001))).toBeNull();
  });
});
