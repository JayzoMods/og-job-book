import { clerkAuthConfigured } from "@/lib/ledger/auth";
import Link from "next/link";

export default async function SignUpPage() {
  if (!clerkAuthConfigured()) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-16 sm:px-6">
        <h1 className="font-display text-2xl">Sign-up is off on this deploy</h1>
        <p className="text-sm text-muted">
          Clerk keys are unset, so the recruiter demo stays no-login.
        </p>
        <Link href="/" className="btn btn-primary self-start">
          Back to jobs
        </Link>
      </div>
    );
  }
  const { SignUp } = await import("@clerk/nextjs");
  return (
    <div className="mx-auto flex w-full max-w-md justify-center px-4 py-16 sm:px-6">
      <SignUp />
    </div>
  );
}
