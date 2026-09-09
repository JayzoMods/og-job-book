import { describe, expect, it } from "vitest";
import { OPENAPI_YAML, openapiDocumentsPath } from "./openapi";

describe("OPENAPI_YAML", () => {
  it("is OpenAPI 3.1 for OG Job Book and names both HTTP paths", () => {
    expect(OPENAPI_YAML.startsWith("openapi: 3.1.0")).toBe(true);
    expect(OPENAPI_YAML).toContain("title: OG Job Book");
    expect(openapiDocumentsPath("/api/payment-webhook")).toBe(true);
    expect(openapiDocumentsPath("/api/export")).toBe(true);
    expect(OPENAPI_YAML).toContain("amountCents");
    expect(OPENAPI_YAML).toContain("applied");
  });

  it("does not claim Stripe, CoP, or a BAS", () => {
    expect(OPENAPI_YAML).toMatch(/not Stripe/i);
    expect(OPENAPI_YAML).toMatch(/not Confirmation of Payee/i);
    expect(OPENAPI_YAML).toMatch(/not a BAS/i);
    expect(OPENAPI_YAML).toContain("Not a live card charge");
  });
});
