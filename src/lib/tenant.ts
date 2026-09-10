import { clerkAuthConfigured, parseClerkUserId } from "@/lib/ledger/auth";

/** Clerk session user, or null when Clerk is off / signed out. Never throws when keys are unset. */
export async function resolveClerkUserId(): Promise<string | null> {
  if (!clerkAuthConfigured()) {
    return null;
  }
  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  return parseClerkUserId(userId);
}
