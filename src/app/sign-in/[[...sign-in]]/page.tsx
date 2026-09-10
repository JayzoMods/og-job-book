import Link from "next/link";
import { redirect } from "next/navigation";
import { signInAction } from "@/app/auth-actions";
import { PendingSubmit } from "@/components/pending-submit";
import { authConfigured } from "@/lib/ledger/auth";
import { resolveAuthUser } from "@/lib/session";

const ERRORS: Record<string, string> = {
  fields: "Email and a password of at least 8 characters are required.",
  db: "Postgres is not connected.",
  auth: "That email or password was not accepted.",
};

export default async function SignInPage({
  searchParams,
}: PageProps<"/sign-in/[[...sign-in]]">) {
  const params = await searchParams;
  const errorKey = typeof params.error === "string" ? params.error : "";
  const error = ERRORS[errorKey];

  if (authConfigured() && (await resolveAuthUser())) {
    redirect("/");
  }

  if (!authConfigured()) {
    return (
      <div className="page-frame max-w-lg py-16">
        <section className="surface surface-hero p-8">
          <p className="kicker">Account</p>
          <h1 className="mt-2 font-display text-3xl">No account needed</h1>
          <p className="mt-3 text-sm text-muted">
            This demo is open without sign-in. Open the jobs list to try the ledger.
          </p>
          <Link href="/" className="btn btn-primary mt-6 self-start">
            Back to jobs
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="page-frame max-w-lg py-16">
      <section className="surface surface-hero p-8">
        <p className="kicker">Account</p>
        <h1 className="mt-2 font-display text-3xl">Sign in</h1>
        <p className="mt-3 text-sm text-muted">
          Your 24-hour trial is tied to this account. Clearing cookies does not restart it.
        </p>
        {error ? (
          <p className="banner banner-error mt-4" role="alert">
            {error}
          </p>
        ) : null}
        <form action={signInAction} className="mt-6 grid gap-3">
          <label className="text-sm">
            Email
            <input
              className="field mt-1"
              type="email"
              name="email"
              autoComplete="username"
              required
              maxLength={80}
            />
          </label>
          <label className="text-sm">
            Password
            <input
              className="field mt-1"
              type="password"
              name="password"
              autoComplete="current-password"
              required
              minLength={8}
              maxLength={128}
            />
          </label>
          <PendingSubmit
            idle="Sign in"
            busy="Signing in…"
            className="btn btn-primary mt-2 self-start"
          />
        </form>
        <p className="mt-6 text-sm text-muted">
          No account yet?{" "}
          <Link href="/sign-up" className="font-semibold underline-offset-2 hover:underline">
            Sign up
          </Link>
        </p>
      </section>
    </div>
  );
}
