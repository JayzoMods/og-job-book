"use client";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="page-frame items-center py-16 text-center">
      <section className="surface surface-hero max-w-lg p-8">
        <p className="kicker">Ledger</p>
        <h1 className="mt-2 font-display text-3xl">Something went wrong</h1>
        <p className="mt-3 text-muted">The page failed to load. Try again, or go back to jobs.</p>
        <button type="button" className="btn btn-primary mt-6" onClick={reset}>
          Try again
        </button>
      </section>
    </div>
  );
}
