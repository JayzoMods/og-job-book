import { clerkAuthConfigured } from "@/lib/ledger/auth";
import Link from "next/link";

export default async function SignInPage() {
  if (!clerkAuthConfigured()) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-16 sm:px-6">
        <h1 className="font-display text-2xl">Sign-in is off on this deploy</h1>
        <p className="text-sm text-muted">
          Clerk keys are unset, so the recruiter demo stays no-login. Set{" "}
          <code className="font-mono">CLERK_SECRET_KEY</code> and{" "}
          <code className="font-mono">NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> to
          turn sign-in on.
        </p>
        <Link href="/" className="btn btn-primary self-start">
          Back to jobs
        </Link>
      </div>
    );
  }
  const { SignIn } = await import("@clerk/nextjs");
  return (
    <div className="mx-auto flex w-full max-w-md justify-center px-4 py-16 sm:px-6">
      <SignIn />
    </div>
  );
}
