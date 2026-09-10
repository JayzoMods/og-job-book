import { describe, expect, it } from "vitest";
import { DEMO_IDS, demoSeed } from "../../data/demo-seed";
import { computeDocument } from "./tax";
import {
  AUTH_NOTE,
  adminEmailFromEnv,
  authConfigured,
  authSecretFromEnv,
  canLoadDemo,
  clientIpFromHeaders,
  describeAuthSkip,
  hashSessionToken,
  hashTrialIp,
  isAdminEmail,
  isAuthEntryPath,
  isPublicTenantPath,
  orgOwnsResource,
  parseAdminEmail,
  parseAuthSecret,
  parseClientIp,
  parseUserId,
  tenantApiStatus,
  tenantGate,
  tenantWriteGate,
  trialEndsAt,
  trialIpLockAllowsMint,
  trialWriteAllowed,
  TRIAL_MS,
} from "./auth";

const SECRET = "a".repeat(32);
const SHORT_SECRET = "a".repeat(31);
const USER = "a0000000-0000-4000-8000-000000000099";

describe("parseAuthSecret", () => {
  it("treats empty, short, and spaced values as off", () => {
    expect(parseAuthSecret("")).toBeNull();
    expect(parseAuthSecret("   ")).toBeNull();
    expect(parseAuthSecret(null)).toBeNull();
    expect(parseAuthSecret(SHORT_SECRET)).toBeNull();
    expect(parseAuthSecret(`${SECRET} ${SECRET}`)).toBeNull();
  });

  it("accepts a 32-character secret", () => {
    expect(parseAuthSecret(`  ${SECRET}  `)).toBe(SECRET);
  });
});

describe("authConfigured", () => {
  it("needs AUTH_SECRET only", () => {
    expect(authConfigured({})).toBe(false);
    expect(authConfigured({ AUTH_SECRET: SHORT_SECRET })).toBe(false);
    expect(authConfigured({ AUTH_SECRET: SECRET })).toBe(true);
    expect(authSecretFromEnv({ AUTH_SECRET: SECRET })).toBe(SECRET);
  });
});

describe("parseAdminEmail", () => {
  it("rejects empty and junk", () => {
    expect(parseAdminEmail("")).toBeNull();
    expect(parseAdminEmail("   ")).toBeNull();
    expect(parseAdminEmail("not-an-email")).toBeNull();
    expect(parseAdminEmail("a".repeat(80) + "@x.io")).toBeNull();
  });

  it("lowercases a valid address", () => {
    expect(parseAdminEmail("  Jayden@OgDigitalDesigns.com.au  ")).toBe(
      "jayden@ogdigitaldesigns.com.au",
    );
    expect(adminEmailFromEnv({ ADMIN_EMAIL: "owner@example.com" })).toBe(
      "owner@example.com",
    );
  });
});

describe("isAdminEmail", () => {
  it("matches the env address only", () => {
    expect(isAdminEmail("owner@example.com", "owner@example.com")).toBe(true);
    expect(isAdminEmail("  Owner@Example.com  ", "owner@example.com")).toBe(true);
    expect(isAdminEmail("other@example.com", "owner@example.com")).toBe(false);
    expect(isAdminEmail("owner@example.com", null)).toBe(false);
    expect(isAdminEmail("", "owner@example.com")).toBe(false);
  });
});

describe("parseUserId", () => {
  it("allows empty as missing and rejects junk", () => {
    expect(parseUserId("")).toBeNull();
    expect(parseUserId("   ")).toBeNull();
    expect(parseUserId("user_2NixaaFyNZq5YxWcM9gA81KcXzI")).toBeNull();
    expect(parseUserId(DEMO_IDS.org.slice(0, 8))).toBeNull();
  });

  it("accepts a UUID", () => {
    expect(parseUserId(`  ${USER.toUpperCase()}  `)).toBe(USER);
  });
});

describe("parseClientIp", () => {
  it("rejects empty and junk", () => {
    expect(parseClientIp("")).toBeNull();
    expect(parseClientIp("unknown")).toBeNull();
    expect(parseClientIp("not an ip")).toBeNull();
    expect(parseClientIp("1")).toBeNull();
  });

  it("takes the first forwarded hop", () => {
    expect(parseClientIp("  203.0.113.10, 10.0.0.1  ")).toBe("203.0.113.10");
    expect(parseClientIp("2001:db8::1")).toBe("2001:db8::1");
    expect(
      clientIpFromHeaders((name) =>
        name === "x-forwarded-for" ? "198.51.100.20" : null,
      ),
    ).toBe("198.51.100.20");
  });
});

describe("hashTrialIp", () => {
  it("is stable for the same secret and ip, and differs when either changes", () => {
    const a = hashTrialIp("203.0.113.10", SECRET);
    expect(a).toBe(hashTrialIp("203.0.113.10", SECRET));
    expect(a).not.toBe(hashTrialIp("203.0.113.11", SECRET));
    expect(a).not.toBe(hashTrialIp("203.0.113.10", "b".repeat(32)));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain("203.0.113.10");
  });
});

describe("hashSessionToken", () => {
  it("hashes a token to 64 hex chars", () => {
    const hash = hashSessionToken("session-token");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashSessionToken("session-token"));
    expect(hash).not.toBe(hashSessionToken("other"));
  });
});

describe("trialIpLockAllowsMint", () => {
  const start = new Date("2026-09-10T10:00:00.000Z");
  it("allows a first mint and a mint after 24 hours", () => {
    expect(trialIpLockAllowsMint(null, start)).toBe(true);
    expect(trialIpLockAllowsMint(start, new Date(start.getTime() + TRIAL_MS))).toBe(
      true,
    );
  });

  it("blocks a second mint inside 24 hours", () => {
    expect(
      trialIpLockAllowsMint(start, new Date(start.getTime() + TRIAL_MS - 1)),
    ).toBe(false);
  });
});

describe("trialWriteAllowed", () => {
  const start = new Date("2026-09-10T10:00:00.000Z");
  it("locks a trial user after 24 hours and never locks admin", () => {
    expect(
      trialWriteAllowed({ isAdmin: true, trialStartedAt: null, now: start }),
    ).toBe(true);
    expect(
      trialWriteAllowed({
        isAdmin: false,
        trialStartedAt: start,
        now: new Date(start.getTime() + 60_000),
      }),
    ).toBe(true);
    expect(
      trialWriteAllowed({
        isAdmin: false,
        trialStartedAt: start,
        now: new Date(start.getTime() + TRIAL_MS),
      }),
    ).toBe(false);
    expect(
      trialWriteAllowed({ isAdmin: false, trialStartedAt: null, now: start }),
    ).toBe(false);
    expect(trialEndsAt(start, false)?.toISOString()).toBe(
      new Date(start.getTime() + TRIAL_MS).toISOString(),
    );
    expect(trialEndsAt(start, true)).toBeNull();
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
  it("keeps the recruiter path open when auth is off", () => {
    expect(tenantGate({ configured: false, userId: null, orgId: DEMO_IDS.org })).toBe(
      "ok",
    );
    expect(tenantGate({ configured: false, userId: null, orgId: null })).toBe("no_org");
  });

  it("requires a signed-in member when auth is on", () => {
    expect(tenantGate({ configured: true, userId: null, orgId: DEMO_IDS.org })).toBe(
      "unauthenticated",
    );
    expect(tenantGate({ configured: true, userId: USER, orgId: null })).toBe("no_org");
    expect(tenantGate({ configured: true, userId: USER, orgId: DEMO_IDS.org })).toBe(
      "ok",
    );
    expect(tenantApiStatus("unauthenticated")).toBe(401);
    expect(tenantApiStatus("trial_expired")).toBe(403);
    expect(tenantApiStatus("no_org")).toBe(404);
    expect(tenantApiStatus("ok")).toBe(200);
  });
});

describe("tenantWriteGate", () => {
  const start = new Date("2026-09-10T10:00:00.000Z");
  const now = new Date(start.getTime() + TRIAL_MS);
  it("locks writes when the trial has ended", () => {
    expect(
      tenantWriteGate({
        configured: true,
        userId: USER,
        orgId: DEMO_IDS.org,
        isAdmin: false,
        trialStartedAt: start,
        now,
      }),
    ).toBe("trial_expired");
    expect(
      tenantWriteGate({
        configured: true,
        userId: USER,
        orgId: DEMO_IDS.org,
        isAdmin: true,
        trialStartedAt: null,
        now,
      }),
    ).toBe("ok");
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
    expect(isPublicTenantPath("/api/auth/sign-up")).toBe(true);
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

describe("isAuthEntryPath", () => {
  it("matches sign-in and sign-up only", () => {
    expect(isAuthEntryPath("/sign-in")).toBe(true);
    expect(isAuthEntryPath("/sign-up/continue")).toBe(true);
    expect(isAuthEntryPath("/")).toBe(false);
    expect(isAuthEntryPath("/api/auth/sign-up")).toBe(false);
  });
});

describe("describeAuthSkip", () => {
  it("never echoes a secret key", () => {
    expect(describeAuthSkip("ok")).toBe(AUTH_NOTE);
    expect(describeAuthSkip("unauthenticated")).not.toMatch(/sk_/i);
    expect(describeAuthSkip("unauthenticated")).not.toContain(SECRET);
    expect(AUTH_NOTE).toMatch(/no-login/i);
    expect(AUTH_NOTE).toMatch(/customer portal/i);
    expect(AUTH_NOTE).not.toMatch(/Clerk/i);
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
