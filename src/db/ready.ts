import {
  AUTH_NOTE,
  clerkAuthConfigured,
  tenantApiStatus,
  tenantGate,
  type TenantGate,
} from "@/lib/ledger/auth";
import { resolveClerkUserId } from "@/lib/tenant";
import { getDb, type AppDb } from "./client";
import {
  getOrg,
  getOrgForClerkUser,
  type OrgRow,
} from "./queries";

export type DbState =
  | {
      ok: true;
      db: AppDb;
      org: OrgRow | null;
      clerkUserId: string | null;
      authMode: "open" | "clerk";
    }
  | { ok: false; reason: "unset" | "unreachable" };

export async function loadDb(): Promise<DbState> {
  const db = getDb();
  if (!db) {
    return { ok: false, reason: "unset" };
  }
  try {
    if (!clerkAuthConfigured()) {
      const org = await getOrg(db);
      return { ok: true, db, org, clerkUserId: null, authMode: "open" };
    }
    const clerkUserId = await resolveClerkUserId();
    if (!clerkUserId) {
      return { ok: true, db, org: null, clerkUserId: null, authMode: "clerk" };
    }
    const org = await getOrgForClerkUser(db, clerkUserId);
    return { ok: true, db, org, clerkUserId, authMode: "clerk" };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}

export function currentTenantGate(state: Extract<DbState, { ok: true }>): TenantGate {
  return tenantGate({
    configured: state.authMode === "clerk",
    clerkUserId: state.clerkUserId,
    orgId: state.org?.id ?? null,
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
