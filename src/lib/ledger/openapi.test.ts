import { describe, expect, it } from "vitest";
import { OPENAPI_YAML, openapiDocumentsPath } from "./openapi";

describe("OPENAPI_YAML", () => {
  it("is OpenAPI 3.1 for OG Job Book and names the HTTP paths", () => {
    expect(OPENAPI_YAML.startsWith("openapi: 3.1.0")).toBe(true);
    expect(OPENAPI_YAML).toContain("title: OG Job Book");
    expect(openapiDocumentsPath("/api/payment-webhook")).toBe(true);
    expect(openapiDocumentsPath("/api/export")).toBe(true);
    expect(openapiDocumentsPath("/api/send-email")).toBe(true);
    expect(openapiDocumentsPath("/api/stripe-checkout")).toBe(true);
    expect(openapiDocumentsPath("/api/stripe-webhook")).toBe(true);
    expect(openapiDocumentsPath("/api/accounting-write")).toBe(true);
    expect(openapiDocumentsPath("/api/quote-share")).toBe(true);
    expect(openapiDocumentsPath("/api/queue-run")).toBe(true);
    expect(OPENAPI_YAML).toContain("amountCents");
    expect(OPENAPI_YAML).toContain("applied");
  });

  it("keeps payment-webhook as recorded status and does not claim CoP or a BAS", () => {
    expect(OPENAPI_YAML).toMatch(/not Confirmation of Payee/i);
    expect(OPENAPI_YAML).toMatch(/not a BAS/i);
    expect(OPENAPI_YAML).toContain("Not a live card charge");
    expect(OPENAPI_YAML).toMatch(/Not a mailbox/i);
    expect(OPENAPI_YAML).toMatch(/amount due now/);
    expect(OPENAPI_YAML).toMatch(/OAuth/);
    expect(OPENAPI_YAML).toMatch(/customer portal/i);
    expect(OPENAPI_YAML).toMatch(/AUTH_SECRET/);
    expect(OPENAPI_YAML).toContain("401");
    expect(OPENAPI_YAML).toMatch(/Leave AUTH_SECRET unset/i);
    expect(OPENAPI_YAML).toMatch(/REDIS_URL/);
    expect(OPENAPI_YAML).toMatch(/booking calendar/i);
  });
});
