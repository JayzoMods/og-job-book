"use client";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="font-display text-2xl">Something went wrong</h1>
      <p className="mt-2 text-muted">The page failed to load. Try again, or go back to jobs.</p>
      <button type="button" className="btn btn-primary mt-6" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
