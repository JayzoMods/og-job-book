import type { Metadata } from "next";
import Link from "next/link";
import {
  AGENCY_NAME,
  AGENCY_SITE,
  CONTACT_EMAIL,
  HOW_TO_USE_STEPS,
} from "@/lib/agency";

export const metadata: Metadata = {
  title: "How to use",
  description:
    "Simple steps for OG Job Book: job → quote → invoice → record payment, with ABN and GST on the document. Not tax advice.",
};

export default function HowToUsePage() {
  return (
    <div className="page-frame">
      <section className="surface p-6 sm:p-8">
        <p className="kicker">Guide</p>
        <h1 className="mt-3 font-display text-4xl tracking-tight">How to use OG Job Book</h1>
        <p className="mt-4 max-w-2xl text-muted">
          A narrow Australian ledger for a small trade or inspection business. One path: job
          → quote → invoice → record payment. ABN checksum and GST sit on the document.
          This is not tax advice, and it does not lodge a BAS.
        </p>
      </section>

      <section className="surface p-6 sm:p-8">
        <h2 className="font-display text-2xl">Step by step</h2>
        <ol className="mt-5 grid gap-5">
          {HOW_TO_USE_STEPS.map((step, index) => (
            <li key={step.title} className="grid gap-1 sm:grid-cols-[2.5rem_minmax(0,1fr)]">
              <p className="font-display text-2xl" style={{ color: "var(--copper)" }}>
                {index + 1}
              </p>
              <div>
                <h3 className="font-semibold">{step.title}</h3>
                <p className="mt-1 text-sm text-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-sm text-muted">
          The in-app <strong>How it works</strong> walkthrough lights up each part as you go.
        </p>
        <Link href="/" className="btn btn-primary mt-4 self-start">
          Back to the ledger
        </Link>
      </section>

      <section className="surface p-6 sm:p-8">
        <h2 className="font-display text-2xl">What this is</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-muted">
          <li>Quotes and invoices show GST, GST-free, and total. Inclusive GST is 1/11 (nearest cent).</li>
          <li>The ABN uses the ABR checksum. Invalid checksums are flagged in plain English.</li>
          <li>Customers, a rate card, print, statements, and export stay in this ledger.</li>
          <li>It is not ServiceM8: no scheduling, GPS, roster, customer portal, or inventory.</li>
          <li>It does not lodge a BAS, and it is not a BAS agent.</li>
        </ul>
      </section>

      <section className="surface p-6 sm:p-8">
        <h2 className="font-display text-2xl">Contact</h2>
        <p className="mt-3 max-w-2xl text-sm text-muted">
          Built by {AGENCY_NAME}. If you want to talk about this product, email Jayden.
        </p>
        <p className="mt-4">
          <a className="btn btn-primary" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
        </p>
        <p className="mt-4 text-sm text-muted">
          Website:{" "}
          <a className="text-navy underline-offset-2 hover:underline" href={AGENCY_SITE}>
            ogdigitaldesigns.com.au
          </a>
        </p>
      </section>
    </div>
  );
}
