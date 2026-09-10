import { describe, expect, it } from "vitest";
import { DEMO_IDS, demoSeed } from "../../data/demo-seed";
import { computeDocument } from "./tax";
import {
  AUTH_NOTE,
  canLoadDemo,
  clerkAuthConfigured,
  clerkPublishableKeyFromEnv,
  clerkSecretKeyFromEnv,
  describeAuthSkip,
  isPublicTenantPath,
  orgOwnsResource,
  parseClerkPublishableKey,
  parseClerkSecretKey,
  parseClerkUserId,
  tenantApiStatus,
  tenantGate,
} from "./auth";

const PK_TEST = "pk_test_harbourlineClerkKey99";
const SK_TEST = "sk_test_harbourlineClerkKey99";
const PK_LIVE = "pk_live_harbourlineClerkKey99";
const SK_LIVE = "sk_live_harbourlineClerkKey99";

describe("parseClerkPublishableKey", () => {
  it("treats empty as off and rejects junk", () => {
    expect(parseClerkPublishableKey("")).toBeNull();
    expect(parseClerkPublishableKey("   ")).toBeNull();
    expect(parseClerkPublishableKey(null)).toBeNull();
    expect(parseClerkPublishableKey("pk_")).toBeNull();
    expect(parseClerkPublishableKey("pk_test_short")).toBeNull();
    expect(parseClerkPublishableKey("sk_test_harbourlineClerkKey99")).toBeNull();
  });

  it("accepts pk_test_ and pk_live_ with a body", () => {
    expect(parseClerkPublishableKey(`  ${PK_TEST}  `)).toBe(PK_TEST);
    expect(parseClerkPublishableKey(PK_LIVE)).toBe(PK_LIVE);
  });
});

describe("parseClerkSecretKey", () => {
  it("treats empty as off and rejects junk", () => {
    expect(parseClerkSecretKey("")).toBeNull();
    expect(parseClerkSecretKey("pk_test_harbourlineClerkKey99")).toBeNull();
    expect(parseClerkSecretKey("sk_live_")).toBeNull();
  });

  it("accepts sk_test_ and sk_live_ with a body", () => {
    expect(parseClerkSecretKey(SK_TEST)).toBe(SK_TEST);
    expect(parseClerkSecretKey(SK_LIVE)).toBe(SK_LIVE);
  });
});

describe("clerkAuthConfigured", () => {
  it("needs both keys, matching test or live", () => {
    expect(clerkAuthConfigured({})).toBe(false);
    expect(clerkAuthConfigured({ CLERK_SECRET_KEY: SK_TEST })).toBe(false);
    expect(
      clerkAuthConfigured({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: PK_TEST }),
    ).toBe(false);
    expect(
      clerkAuthConfigured({
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: PK_TEST,
        CLERK_SECRET_KEY: SK_LIVE,
      }),
    ).toBe(false);
    expect(
      clerkAuthConfigured({
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: PK_TEST,
        CLERK_SECRET_KEY: SK_TEST,
      }),
    ).toBe(true);
    expect(clerkPublishableKeyFromEnv({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: PK_TEST })).toBe(
      PK_TEST,
    );
    expect(clerkSecretKeyFromEnv({ CLERK_SECRET_KEY: SK_TEST })).toBe(SK_TEST);
  });
});

describe("parseClerkUserId", () => {
  it("allows empty as missing and rejects junk", () => {
    expect(parseClerkUserId("")).toBeNull();
    expect(parseClerkUserId("   ")).toBeNull();
    expect(parseClerkUserId("user")).toBeNull();
    expect(parseClerkUserId("user_")).toBeNull();
    expect(parseClerkUserId(DEMO_IDS.org)).toBeNull();
    expect(parseClerkUserId("user_" + "x".repeat(128))).toBeNull();
  });

  it("accepts a Clerk user_ id", () => {
    expect(parseClerkUserId("  user_2NixaaFyNZq5YxWcM9gA81KcXzI  ")).toBe(
      "user_2NixaaFyNZq5YxWcM9gA81KcXzI",
    );
  });
});

describe("orgOwnsResource", () => {
  it("rejects empty ids and a foreign org", () => {
    expect(orgOwnsResource("", DEMO_IDS.org)).toBe(false);
    expect(orgOwnsResource(DEMO_IDS.org, "")).toBe(false);
    expect(orgOwnsResource(DEMO_IDS.org, DEMO_IDS.jobQuoted)).toBe(false);
    expect(orgOwnsResource(DEMO_IDS.org, DEMO_IDS.org)).toBe(true);
  });
});

describe("canLoadDemo", () => {
  it("is only for the no-login deploy", () => {
    expect(canLoadDemo(false)).toBe(true);
    expect(canLoadDemo(true)).toBe(false);
  });
});

describe("tenantGate", () => {
  it("keeps the recruiter path open when Clerk is off", () => {
    expect(
      tenantGate({ configured: false, clerkUserId: null, orgId: DEMO_IDS.org }),
    ).toBe("ok");
    expect(tenantGate({ configured: false, clerkUserId: null, orgId: null })).toBe(
      "no_org",
    );
  });

  it("requires a signed-in member when Clerk is on", () => {
    expect(
      tenantGate({ configured: true, clerkUserId: null, orgId: DEMO_IDS.org }),
    ).toBe("unauthenticated");
    expect(
      tenantGate({
        configured: true,
        clerkUserId: "user_2NixaaFyNZq5YxWcM9gA81KcXzI",
        orgId: null,
      }),
    ).toBe("no_org");
    expect(
      tenantGate({
        configured: true,
        clerkUserId: "user_2NixaaFyNZq5YxWcM9gA81KcXzI",
        orgId: DEMO_IDS.org,
      }),
    ).toBe("ok");
    expect(tenantApiStatus("unauthenticated")).toBe(401);
    expect(tenantApiStatus("no_org")).toBe(404);
    expect(tenantApiStatus("ok")).toBe(200);
  });
});

describe("isPublicTenantPath", () => {
  it("keeps share, webhooks, OpenAPI, and sign-in public", () => {
    expect(isPublicTenantPath(`/q/${DEMO_IDS.quoteMixedShare}`)).toBe(true);
    expect(isPublicTenantPath("/api/payment-webhook")).toBe(true);
    expect(isPublicTenantPath("/api/stripe-webhook")).toBe(true);
    expect(isPublicTenantPath("/openapi.yaml")).toBe(true);
    expect(isPublicTenantPath("/sign-in")).toBe(true);
    expect(isPublicTenantPath("/sign-up/continue")).toBe(true);
  });

  it("does not treat the ledger or minting APIs as public", () => {
    expect(isPublicTenantPath("/")).toBe(false);
    expect(isPublicTenantPath(`/jobs/${DEMO_IDS.jobQuoted}`)).toBe(false);
    expect(isPublicTenantPath("/api/quote-share")).toBe(false);
    expect(isPublicTenantPath("/api/export")).toBe(false);
    expect(isPublicTenantPath("/api/send-email")).toBe(false);
    expect(isPublicTenantPath("/api/queue-run")).toBe(false);
    expect(isPublicTenantPath("/gst-quarter/print")).toBe(false);
  });
});

describe("describeAuthSkip", () => {
  it("never echoes a secret key", () => {
    expect(describeAuthSkip("ok")).toBe(AUTH_NOTE);
    expect(describeAuthSkip("unauthenticated")).not.toMatch(/sk_/i);
    expect(describeAuthSkip("unauthenticated")).not.toContain(SK_TEST);
    expect(AUTH_NOTE).toMatch(/no-login/i);
    expect(AUTH_NOTE).toMatch(/customer portal/i);
  });
});

describe("demo org stays one tenant", () => {
  it("pins Harbourline jobs to the demo org without changing GST money", () => {
    expect(demoSeed.jobs.every((job) => job.id.startsWith("a0000000"))).toBe(true);
    const mixed = demoSeed.quotes.find((quote) => quote.docNumber === "Q-0001");
    expect(computeDocument(mixed!.lines).gstCents).toBe(11000);
    expect(computeDocument(mixed!.lines).totalCents).toBe(123200);
    expect(orgOwnsResource(DEMO_IDS.org, DEMO_IDS.org)).toBe(true);
  });
});
