import { parseUserId } from "@/lib/ledger/auth";
import { resolveAuthUser } from "@/lib/session";

/** Signed-in user id, or null when auth is off / signed out. Never throws when AUTH_SECRET is unset. */
export async function resolveUserId(): Promise<string | null> {
  const user = await resolveAuthUser();
  return parseUserId(user?.id);
}
