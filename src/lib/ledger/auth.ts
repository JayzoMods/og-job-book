export const AUTH_NOTE =
  "Optional Clerk sign-in maps a user to one organisation. Off until CLERK_SECRET_KEY and NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY are set. Leave those unset on a public no-login deploy. Not staff roles. Not a customer portal.";

const PUBLISHABLE_RE = /^pk_(test|live)_[^\s]{8,}$/;
const SECRET_RE = /^sk_(test|live)_[^\s]{8,}$/;
const USER_ID_RE = /^user_[A-Za-z0-9]+$/;
const USER_ID_MAX = 128;

export function parseClerkPublishableKey(
  raw: string | number | null | undefined,
): string | null {
  const trimmed = String(raw ?? "").trim();
  if (trimmed === "") {
    return null;
  }
  return PUBLISHABLE_RE.test(trimmed) ? trimmed : null;
}

export function parseClerkSecretKey(
  raw: string | number | null | undefined,
): string | null {
  const trimmed = String(raw ?? "").trim();
  if (trimmed === "") {
    return null;
  }
  return SECRET_RE.test(trimmed) ? trimmed : null;
}

export function clerkPublishableKeyFromEnv(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  return parseClerkPublishableKey(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) ?? undefined;
}

export function clerkSecretKeyFromEnv(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  return parseClerkSecretKey(env.CLERK_SECRET_KEY) ?? undefined;
}

export function clerkAuthConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const publishable = clerkPublishableKeyFromEnv(env);
  const secret = clerkSecretKeyFromEnv(env);
  if (!publishable || !secret) {
    return false;
  }
  const publishableLive = publishable.startsWith("pk_live_");
  const secretLive = secret.startsWith("sk_live_");
  return publishableLive === secretLive;
}

/** Empty is not a user. Clerk ids are user_ plus alphanumerics. Junk → null. */
export function parseClerkUserId(
  raw: string | number | null | undefined,
): string | null {
  const trimmed = String(raw ?? "").trim();
  if (trimmed === "" || trimmed.length > USER_ID_MAX) {
    return null;
  }
  return USER_ID_RE.test(trimmed) ? trimmed : null;
}

export function canLoadDemo(configured: boolean): boolean {
  return !configured;
}

export function orgOwnsResource(
  resourceOrgId: string | null | undefined,
  orgId: string | null | undefined,
): boolean {
  if (!resourceOrgId || !orgId) {
    return false;
  }
  return resourceOrgId === orgId;
}

export type TenantGate = "ok" | "unauthenticated" | "no_org";

export function tenantGate(input: {
  configured: boolean;
  clerkUserId: string | null;
  orgId: string | null;
}): TenantGate {
  if (!input.configured) {
    return input.orgId ? "ok" : "no_org";
  }
  if (!input.clerkUserId) {
    return "unauthenticated";
  }
  if (!input.orgId) {
    return "no_org";
  }
  return "ok";
}

export function tenantApiStatus(gate: TenantGate): 200 | 401 | 404 {
  if (gate === "unauthenticated") {
    return 401;
  }
  if (gate === "no_org") {
    return 404;
  }
  return 200;
}

/** Share links, webhooks, and OpenAPI stay reachable with Clerk on. */
export function isPublicTenantPath(pathname: string): boolean {
  const raw = pathname.split("?")[0] || "/";
  const path = raw.length > 1 && raw.endsWith("/") ? raw.slice(0, -1) : raw;
  if (path === "/openapi.yaml") {
    return true;
  }
  if (path === "/api/payment-webhook" || path === "/api/stripe-webhook") {
    return true;
  }
  if (path === "/sign-in" || path.startsWith("/sign-in/")) {
    return true;
  }
  if (path === "/sign-up" || path.startsWith("/sign-up/")) {
    return true;
  }
  return path.startsWith("/q/");
}

export function describeAuthSkip(reason: TenantGate): string {
  if (reason === "unauthenticated") {
    return "Sign in to open these books.";
  }
  if (reason === "no_org") {
    return "Save the organisation before using the ledger.";
  }
  return AUTH_NOTE;
}
