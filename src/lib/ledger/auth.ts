import { createHash } from "node:crypto";

export const AUTH_NOTE =
  "Optional first-party sign-in maps a user to one organisation. Off until AUTH_SECRET is set (32+ characters). Leave it unset on a public no-login deploy. A 24-hour trial starts on sign-up. ADMIN_EMAIL skips the clock. New trials from the same network are locked for 24 hours. Not staff roles. Not a customer portal.";

export const TRIAL_MS = 24 * 60 * 60 * 1000;
export const SESSION_COOKIE = "og_job_book_session";
export const SESSION_MAX_MS = 30 * 24 * 60 * 60 * 1000;
export const AUTH_SECRET_MIN = 32;
export const AUTH_SECRET_MAX = 256;
export const USER_ID_MAX = 128;

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IP_SHAPE = /^[0-9a-f:.]+$/i;

export function parseAuthSecret(
  raw: string | number | null | undefined,
): string | null {
  const trimmed = String(raw ?? "").trim();
  if (trimmed.length < AUTH_SECRET_MIN || trimmed.length > AUTH_SECRET_MAX) {
    return null;
  }
  if (/\s/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

export function authSecretFromEnv(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  return parseAuthSecret(env.AUTH_SECRET) ?? undefined;
}

export function authConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(authSecretFromEnv(env));
}

export function parseAccountEmail(
  raw: string | number | null | undefined,
): string | null {
  const trimmed = String(raw ?? "").trim().toLowerCase();
  if (trimmed === "" || trimmed.length > 80) {
    return null;
  }
  if (!EMAIL_SHAPE.test(trimmed)) {
    return null;
  }
  return trimmed;
}

export function parseAdminEmail(
  raw: string | number | null | undefined,
): string | null {
  return parseAccountEmail(raw);
}

export function adminEmailFromEnv(
  env: Record<string, string | undefined> = process.env,
): string | null {
  return parseAdminEmail(env.ADMIN_EMAIL);
}

export function isAdminEmail(
  email: string | null | undefined,
  adminEmail: string | null | undefined,
): boolean {
  if (!email || !adminEmail) {
    return false;
  }
  return email.trim().toLowerCase() === adminEmail;
}

/** Empty is not a user. Auth user ids are UUIDs. Junk → null. */
export function parseUserId(
  raw: string | number | null | undefined,
): string | null {
  const trimmed = String(raw ?? "").trim();
  if (trimmed === "" || trimmed.length > USER_ID_MAX) {
    return null;
  }
  return USER_ID_RE.test(trimmed) ? trimmed.toLowerCase() : null;
}

export function parseClientIp(
  raw: string | number | null | undefined,
): string | null {
  const trimmed = String(raw ?? "").trim();
  if (trimmed === "") {
    return null;
  }
  const first = (trimmed.split(",")[0] ?? "").trim().toLowerCase();
  if (first.length < 3 || first.length > 45) {
    return null;
  }
  if (!IP_SHAPE.test(first) || !/\d/.test(first)) {
    return null;
  }
  return first;
}

export function clientIpFromHeaders(
  getHeader: (name: string) => string | null,
): string | null {
  return parseClientIp(
    getHeader("x-forwarded-for") ??
      getHeader("x-real-ip") ??
      getHeader("x-vercel-forwarded-for"),
  );
}

export function hashTrialIp(ip: string, secret: string): string {
  return createHash("sha256").update(`${secret}\n${ip}`, "utf8").digest("hex");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function trialIpLockAllowsMint(
  startedAt: Date | null | undefined,
  now: Date,
): boolean {
  if (!startedAt) {
    return true;
  }
  return now.getTime() - startedAt.getTime() >= TRIAL_MS;
}

export function trialWriteAllowed(input: {
  isAdmin: boolean;
  trialStartedAt: Date | null | undefined;
  now: Date;
}): boolean {
  if (input.isAdmin) {
    return true;
  }
  if (!input.trialStartedAt) {
    return false;
  }
  return input.now.getTime() - input.trialStartedAt.getTime() < TRIAL_MS;
}

export function trialEndsAt(
  trialStartedAt: Date | null | undefined,
  isAdmin: boolean,
): Date | null {
  if (isAdmin || !trialStartedAt) {
    return null;
  }
  return new Date(trialStartedAt.getTime() + TRIAL_MS);
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

export type TenantGate = "ok" | "unauthenticated" | "no_org" | "trial_expired";

export function tenantGate(input: {
  configured: boolean;
  userId: string | null;
  orgId: string | null;
}): TenantGate {
  if (!input.configured) {
    return input.orgId ? "ok" : "no_org";
  }
  if (!input.userId) {
    return "unauthenticated";
  }
  if (!input.orgId) {
    return "no_org";
  }
  return "ok";
}

export function tenantWriteGate(input: {
  configured: boolean;
  userId: string | null;
  orgId: string | null;
  isAdmin: boolean;
  trialStartedAt: Date | null | undefined;
  now: Date;
}): TenantGate {
  const gate = tenantGate(input);
  if (gate !== "ok") {
    return gate;
  }
  if (
    input.configured &&
    !trialWriteAllowed({
      isAdmin: input.isAdmin,
      trialStartedAt: input.trialStartedAt,
      now: input.now,
    })
  ) {
    return "trial_expired";
  }
  return "ok";
}

export function tenantApiStatus(gate: TenantGate): 200 | 401 | 403 | 404 {
  if (gate === "unauthenticated") {
    return 401;
  }
  if (gate === "trial_expired") {
    return 403;
  }
  if (gate === "no_org") {
    return 404;
  }
  return 200;
}

function tenantPathname(pathname: string): string {
  const raw = pathname.split("?")[0] || "/";
  return raw.length > 1 && raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

/** Sign-in and sign-up. A session on these paths should go home. */
export function isAuthEntryPath(pathname: string): boolean {
  const path = tenantPathname(pathname);
  return (
    path === "/sign-in" ||
    path.startsWith("/sign-in/") ||
    path === "/sign-up" ||
    path.startsWith("/sign-up/")
  );
}

/** Share links, webhooks, OpenAPI, and auth pages stay reachable with sign-in on. */
export function isPublicTenantPath(pathname: string): boolean {
  const path = tenantPathname(pathname);
  if (path === "/openapi.yaml") {
    return true;
  }
  if (path === "/api/payment-webhook" || path === "/api/stripe-webhook") {
    return true;
  }
  if (path === "/api/auth" || path.startsWith("/api/auth/")) {
    return true;
  }
  if (isAuthEntryPath(path)) {
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
  if (reason === "trial_expired") {
    return "This 24-hour trial has ended. The books stay readable.";
  }
  return AUTH_NOTE;
}
