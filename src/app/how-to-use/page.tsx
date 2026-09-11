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
    "A short guide to OG Job Book: job → quote → invoice → record payment, with an ABN checksum and GST worked out on the document itself.",
};

export default function HowToUsePage() {
  return (
    <div className="page-frame">
      <section className="surface p-6 sm:p-8">
        <p className="kicker">Guide</p>
        <h1 className="mt-3 font-display text-4xl tracking-tight">How to use OG Job Book</h1>
        <p className="mt-4 max-w-2xl text-muted">
          OG Job Book is a focused ledger for a small Australian trade or inspection
          business. It follows one straightforward path — job → quote → invoice → record
          payment — and the ABN checksum and GST maths sit right there on the document
          itself, not tucked away in a settings page. It isn’t tax advice, and it doesn’t
          lodge anything with the ATO.
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
          <li>
            Every quote and invoice shows GST, GST-free amounts, and the total. Inclusive
            GST is the total divided by 11, rounded to the nearest cent.
          </li>
          <li>
            The ABN is checked against the official ABR checksum, and any mismatch is
            flagged in plain English — no jargon.
          </li>
          <li>
            Customers, a rate card, printable documents, statements, and full exports all
            live in this one ledger.
          </li>
          <li>
            It is not ServiceM8 or any other field-service platform — no scheduling, GPS
            tracking, staff roster, customer portal, or inventory.
          </li>
          <li>
            It does not lodge a BAS and it is not a BAS agent — treat it as a well-behaved
            ledger, not tax advice.
          </li>
        </ul>
      </section>

      <section className="surface p-6 sm:p-8">
        <h2 className="font-display text-2xl">Contact</h2>
        <p className="mt-3 max-w-2xl text-sm text-muted">
          Built by {AGENCY_NAME}. Questions about this product, or interested in working
          together? Email Jayden directly.
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
