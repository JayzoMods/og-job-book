import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="font-display text-2xl">Page not found</h1>
      <p className="mt-2 text-muted">That job or page is not here.</p>
      <Link href="/" className="btn btn-primary mt-6">
        Back to jobs
      </Link>
    </div>
  );
}
