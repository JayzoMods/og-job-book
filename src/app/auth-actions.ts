"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import {
  claimTrialIp,
  getAuthUserByEmail,
  insertAuthUser,
} from "@/db/queries";
import {
  TRIAL_DEVICE_COOKIE,
  adminEmailFromEnv,
  authConfigured,
  authSecretFromEnv,
  clientIpFromHeaders,
  hashTrialDevice,
  hashTrialIp,
  isAdminEmail,
  newTrialDeviceToken,
  parseAccountEmail,
  parseTrialDeviceToken,
} from "@/lib/ledger/auth";
import { hashPassword, parsePassword, verifyPassword } from "@/lib/ledger/password";
import {
  createUserSession,
  destroyUserSession,
  setTrialDeviceCookie,
} from "@/lib/session";
import { cookies, headers } from "next/headers";

function signupError(code: string): never {
  redirect(`/sign-up?error=${code}`);
}

function signinError(code: string): never {
  redirect(`/sign-in?error=${code}`);
}

export async function signUpAction(formData: FormData) {
  if (!authConfigured()) {
    redirect("/");
  }
  const secret = authSecretFromEnv();
  if (!secret) {
    redirect("/");
  }
  const email = parseAccountEmail(String(formData.get("email") ?? ""));
  const password = parsePassword(String(formData.get("password") ?? ""));
  if (!email || !password) {
    signupError("fields");
  }
  const db = getDb();
  if (!db) {
    signupError("db");
  }
  const existing = await getAuthUserByEmail(db, email);
  if (existing) {
    signupError("taken");
  }
  const admin = isAdminEmail(email, adminEmailFromEnv());
  const cookieStore = await cookies();
  let deviceToken = parseTrialDeviceToken(
    cookieStore.get(TRIAL_DEVICE_COOKIE)?.value,
  );
  if (!deviceToken) {
    deviceToken = newTrialDeviceToken();
  }
  if (!admin) {
    const now = new Date();
    const headerList = await headers();
    const ip = clientIpFromHeaders((name) => headerList.get(name));
    if (!ip) {
      signupError("ip");
    }
    // IP first, then browser cookie — either signal blocks a second trial.
    const ipLocked = await claimTrialIp(db, hashTrialIp(ip, secret), now);
    if (!ipLocked) {
      signupError("ip");
    }
    const deviceLocked = await claimTrialIp(
      db,
      hashTrialDevice(deviceToken, secret),
      now,
    );
    if (!deviceLocked) {
      signupError("ip");
    }
  }
  const name = email.split("@")[0] ?? "Account";
  let userId: string;
  try {
    userId = await insertAuthUser(db, {
      email,
      passwordHash: await hashPassword(password),
      name,
      isAdmin: admin,
      trialStartedAt: admin ? null : new Date(),
    });
  } catch {
    signupError("taken");
  }
  await setTrialDeviceCookie(deviceToken);
  await createUserSession(db, userId);
  redirect("/");
}

export async function signInAction(formData: FormData) {
  if (!authConfigured()) {
    redirect("/");
  }
  const email = parseAccountEmail(String(formData.get("email") ?? ""));
  const password = parsePassword(String(formData.get("password") ?? ""));
  if (!email || !password) {
    signinError("fields");
  }
  const db = getDb();
  if (!db) {
    signinError("db");
  }
  const user = await getAuthUserByEmail(db, email);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    signinError("auth");
  }
  await createUserSession(db, user.id);
  redirect("/");
}

export async function signOutAction() {
  const db = getDb();
  await destroyUserSession(db);
  redirect(authConfigured() ? "/sign-in" : "/");
}
