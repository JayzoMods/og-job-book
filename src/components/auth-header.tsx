"use client";

import Link from "next/link";
import { signOutAction } from "@/app/auth-actions";
import { PendingSubmit } from "@/components/pending-submit";

export function AuthHeaderControls({
  signedIn,
  email,
}: {
  signedIn: boolean;
  email: string | null;
}) {
  if (!signedIn) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Link href="/sign-in" className="btn btn-ghost">
          Sign in
        </Link>
        <Link href="/sign-up" className="btn btn-primary">
          Sign up
        </Link>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-sm">
      {email ? (
        <span className="hidden max-w-40 truncate text-muted sm:inline">{email}</span>
      ) : null}
      <form action={signOutAction}>
        <PendingSubmit
          idle="Sign out"
          busy="Signing out…"
          className="btn btn-ghost"
        />
      </form>
    </div>
  );
}
