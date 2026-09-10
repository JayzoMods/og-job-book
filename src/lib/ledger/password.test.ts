import { describe, expect, it } from "vitest";
import { hashPassword, parsePassword, verifyPassword } from "./password";

describe("parsePassword", () => {
  it("rejects empty, short, and over-long values", () => {
    expect(parsePassword("")).toBeNull();
    expect(parsePassword("1234567")).toBeNull();
    expect(parsePassword("x".repeat(129))).toBeNull();
    expect(parsePassword(null)).toBeNull();
  });

  it("keeps an 8-character password including spaces", () => {
    expect(parsePassword("pass word")).toBe("pass word");
  });
});

describe("hashPassword / verifyPassword", () => {
  it("round-trips a password and rejects a mismatch", async () => {
    const stored = await hashPassword("harbourline");
    expect(stored.startsWith("scrypt:")).toBe(true);
    expect(await verifyPassword("harbourline", stored)).toBe(true);
    expect(await verifyPassword("wrong-pass", stored)).toBe(false);
    expect(await verifyPassword("harbourline", "not-a-hash")).toBe(false);
    expect(await verifyPassword("harbourline", "scrypt:ab:cd")).toBe(false);
  });
});
