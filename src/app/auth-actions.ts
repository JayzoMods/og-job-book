"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import {
  claimTrialIp,
  getAuthUserByEmail,
  insertAuthUser,
} from "@/db/queries";
import {
  adminEmailFromEnv,
  authConfigured,
  authSecretFromEnv,
  clientIpFromHeaders,
  hashTrialIp,
  isAdminEmail,
  parseAccountEmail,
} from "@/lib/ledger/auth";
import { hashPassword, parsePassword, verifyPassword } from "@/lib/ledger/password";
import { createUserSession, destroyUserSession } from "@/lib/session";
import { headers } from "next/headers";

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
  if (!admin) {
    const headerList = await headers();
    const ip = clientIpFromHeaders((name) => headerList.get(name));
    if (!ip) {
      signupError("ip");
    }
    const locked = await claimTrialIp(db, hashTrialIp(ip, secret), new Date());
    if (!locked) {
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
