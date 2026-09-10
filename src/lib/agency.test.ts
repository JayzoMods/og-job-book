import { describe, expect, it } from "vitest";
import {
  AGENCY_SITE,
  CONTACT_EMAIL,
  HOW_TO_USE_PATH,
  HOW_TO_USE_STEPS,
} from "./agency";

describe("agency contact", () => {
  it("pins the enquire address and how-to-use path", () => {
    expect(CONTACT_EMAIL).toBe("enquiries@ogdigitaldesigns.com.au");
    expect(AGENCY_SITE).toBe("https://ogdigitaldesigns.com.au");
    expect(HOW_TO_USE_PATH).toBe("/how-to-use");
  });

  it("rejects empty-looking contact values", () => {
    expect(CONTACT_EMAIL.trim()).not.toBe("");
    expect(CONTACT_EMAIL).toMatch(/@/);
    expect(HOW_TO_USE_PATH.startsWith("/")).toBe(true);
    expect(HOW_TO_USE_PATH).not.toBe("/");
  });
});

describe("how to use steps", () => {
  it("has six plain steps and does not claim tax advice or a BAS", () => {
    expect(HOW_TO_USE_STEPS).toHaveLength(6);
    const blob = HOW_TO_USE_STEPS.map((step) => `${step.title} ${step.body}`).join("\n");
    expect(blob).not.toMatch(/tax advice|lodged this|we lodged/i);
    expect(blob).toMatch(/not a BAS/i);
    expect(blob).not.toMatch(/REDIS_URL|STRIPE_|XERO_|CLERK_|AI_GATEWAY|ABR_GUID/);
  });
});
