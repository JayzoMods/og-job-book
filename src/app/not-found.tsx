import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page-frame items-center py-16 text-center">
      <section className="surface surface-hero max-w-lg p-8">
        <p className="kicker">Ledger</p>
        <h1 className="mt-2 font-display text-3xl">Page not found</h1>
        <p className="mt-3 text-muted">That job or page is not here.</p>
        <Link href="/" className="btn btn-primary mt-6 inline-flex">
          Back to jobs
        </Link>
      </section>
    </div>
  );
}
