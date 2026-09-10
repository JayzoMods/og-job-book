import Link from "next/link";
import { signUpAction } from "@/app/auth-actions";
import { authConfigured } from "@/lib/ledger/auth";

const ERRORS: Record<string, string> = {
  fields: "Email and a password of at least 8 characters are required.",
  db: "Postgres is not connected.",
  taken: "That email already has an account. Sign in.",
  ip: "A trial from this network is already active. Sign in to that account, or wait 24 hours.",
};

export default async function SignUpPage({
  searchParams,
}: PageProps<"/sign-up/[[...sign-up]]">) {
  const params = await searchParams;
  const errorKey = typeof params.error === "string" ? params.error : "";
  const error = ERRORS[errorKey];

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
        <h1 className="mt-2 font-display text-3xl">Create an account</h1>
        <p className="mt-3 text-sm text-muted">
          Sign up starts a 24-hour trial on this email. One new trial per network every 24
          hours. Not tax advice.
        </p>
        {error ? (
          <p className="banner banner-error mt-4" role="alert">
            {error}
          </p>
        ) : null}
        <form action={signUpAction} className="mt-6 grid gap-3">
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
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
            />
          </label>
          <button type="submit" className="btn btn-primary mt-2 self-start">
            Sign up
          </button>
        </form>
        <p className="mt-6 text-sm text-muted">
          Already have an account?{" "}
          <Link href="/sign-in" className="font-semibold underline-offset-2 hover:underline">
            Sign in
          </Link>
        </p>
      </section>
    </div>
  );
}
