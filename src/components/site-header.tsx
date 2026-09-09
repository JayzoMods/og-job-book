import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-foam print:hidden">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="font-display text-xl font-semibold tracking-tight text-ink">
          OG Job Book
        </Link>
        <p className="hidden text-sm text-muted sm:block">
          Job → quote → invoice. Not ServiceM8. Not tax advice.
        </p>
      </div>
    </header>
  );
}
