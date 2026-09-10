import {
  AUTH_NOTE,
  authConfigured,
  tenantApiStatus,
  tenantGate,
  tenantWriteGate,
  trialWriteAllowed,
  type TenantGate,
} from "@/lib/ledger/auth";
import { resolveAuthUser } from "@/lib/session";
import { getDb, type AppDb } from "./client";
import { getOrg, getOrgForUser, type AuthUserRow, type OrgRow } from "./queries";

export type DbState =
  | {
      ok: true;
      db: AppDb;
      org: OrgRow | null;
      userId: string | null;
      authMode: "open" | "account";
      isAdmin: boolean;
      trialWriteAllowed: boolean;
      trialStartedAt: Date | null;
    }
  | { ok: false; reason: "unset" | "unreachable" };

export async function loadDb(): Promise<DbState> {
  const db = getDb();
  if (!db) {
    return { ok: false, reason: "unset" };
  }
  try {
    if (!authConfigured()) {
      const org = await getOrg(db);
      return {
        ok: true,
        db,
        org,
        userId: null,
        authMode: "open",
        isAdmin: false,
        trialWriteAllowed: true,
        trialStartedAt: null,
      };
    }
    const user: AuthUserRow | null = await resolveAuthUser();
    if (!user) {
      return {
        ok: true,
        db,
        org: null,
        userId: null,
        authMode: "account",
        isAdmin: false,
        trialWriteAllowed: false,
        trialStartedAt: null,
      };
    }
    const org = await getOrgForUser(db, user.id);
    const now = new Date();
    return {
      ok: true,
      db,
      org,
      userId: user.id,
      authMode: "account",
      isAdmin: user.isAdmin,
      trialWriteAllowed: trialWriteAllowed({
        isAdmin: user.isAdmin,
        trialStartedAt: user.trialStartedAt,
        now,
      }),
      trialStartedAt: user.trialStartedAt,
    };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}

export function currentTenantGate(state: Extract<DbState, { ok: true }>): TenantGate {
  return tenantGate({
    configured: state.authMode === "account",
    userId: state.userId,
    orgId: state.org?.id ?? null,
  });
}

export function currentWriteGate(state: Extract<DbState, { ok: true }>): TenantGate {
  return tenantWriteGate({
    configured: state.authMode === "account",
    userId: state.userId,
    orgId: state.org?.id ?? null,
    isAdmin: state.isAdmin,
    trialStartedAt: state.trialStartedAt,
    now: new Date(),
  });
}

export function tenantJsonDenied(state: Extract<DbState, { ok: true }>): Response | null {
  const gate = currentTenantGate(state);
  if (gate !== "unauthenticated") {
    return null;
  }
  return Response.json(
    { error: "sign_in", note: AUTH_NOTE },
    { status: tenantApiStatus(gate) },
  );
}

export function tenantWriteJsonDenied(
  state: Extract<DbState, { ok: true }>,
): Response | null {
  const signedOut = tenantJsonDenied(state);
  if (signedOut) {
    return signedOut;
  }
  const gate = currentWriteGate(state);
  if (gate !== "trial_expired") {
    return null;
  }
  return Response.json(
    { error: "trial", note: AUTH_NOTE },
    { status: tenantApiStatus(gate) },
  );
}
