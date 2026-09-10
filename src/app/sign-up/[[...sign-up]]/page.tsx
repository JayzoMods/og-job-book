import { clerkAuthConfigured } from "@/lib/ledger/auth";
import Link from "next/link";

export default async function SignUpPage() {
  if (!clerkAuthConfigured()) {
    return (
      <div className="page-frame max-w-lg py-16">
        <section className="surface surface-hero p-8">
          <p className="kicker">Account</p>
          <h1 className="mt-2 font-display text-3xl">No account needed</h1>
          <p className="mt-3 text-sm text-muted">
            This demo is open without sign-up. Open the jobs list to try the ledger.
          </p>
          <Link href="/" className="btn btn-primary mt-6 self-start">
            Back to jobs
          </Link>
        </section>
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
