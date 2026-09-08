import { getDb, type AppDb } from "./client";
import { getOrg, type OrgRow } from "./queries";

export type DbState =
  | { ok: true; db: AppDb; org: OrgRow | null }
  | { ok: false; reason: "unset" | "unreachable" };

export async function loadDb(): Promise<DbState> {
  const db = getDb();
  if (!db) {
    return { ok: false, reason: "unset" };
  }
  try {
    const org = await getOrg(db);
    return { ok: true, db, org };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}
