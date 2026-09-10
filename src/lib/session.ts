import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getDb, type AppDb } from "@/db/client";
import {
  deleteAuthSessionByHash,
  getAuthUserBySessionHash,
  insertAuthSession,
  type AuthUserRow,
} from "@/db/queries";
import {
  SESSION_COOKIE,
  SESSION_MAX_MS,
  authConfigured,
  hashSessionToken,
  parseUserId,
} from "@/lib/ledger/auth";

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

function cookieSecure(): boolean {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: "/",
    maxAge: Math.floor(SESSION_MAX_MS / 1000),
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function readSessionToken(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value?.trim() ?? "";
  return token === "" ? null : token;
}

export async function createUserSession(db: AppDb, userId: string): Promise<void> {
  const token = newSessionToken();
  await insertAuthSession(db, {
    userId,
    tokenHash: hashSessionToken(token),
    expiresAt: new Date(Date.now() + SESSION_MAX_MS),
  });
  await setSessionCookie(token);
}

export async function destroyUserSession(db: AppDb | null): Promise<void> {
  const token = await readSessionToken();
  if (db && token) {
    await deleteAuthSessionByHash(db, hashSessionToken(token));
  }
  await clearSessionCookie();
}

export async function resolveAuthUser(): Promise<AuthUserRow | null> {
  if (!authConfigured()) {
    return null;
  }
  const db = getDb();
  const token = await readSessionToken();
  if (!db || !token) {
    return null;
  }
  const user = await getAuthUserBySessionHash(db, hashSessionToken(token), new Date());
  if (!user) {
    return null;
  }
  return parseUserId(user.id) ? user : null;
}
