import Link from "next/link";
import { formatAbn, isValidAbn } from "@/lib/ledger/abn";
import {
  GST_QUARTER_DISCLAIMER,
  type GstQuarterRow,
  type GstQuarterTotals,
} from "@/lib/ledger/gst-quarter";
import { formatAudFromCents } from "@/lib/ledger/money";
import { formatIsoDateAu, printGstQuarterTitle } from "@/lib/ledger/print";
import { PrintButton } from "@/components/print-button";
import { PrintSampleMark } from "@/components/print-sample-mark";

export function GstQuarterSheet({
  backHref,
  from,
  to,
  label,
  orgName,
  orgAddress,
  abn,
  gstRegistered,
  rows,
  totals,
  sampleMark = false,
}: {
  backHref: string;
  from: string;
  to: string;
  label: string;
  orgName: string;
  orgAddress: string;
  abn: string;
  gstRegistered: boolean;
  rows: GstQuarterRow[];
  totals: GstQuarterTotals;
  sampleMark?: boolean;
}) {
  const abnOk = isValidAbn(abn);
  return (
    <div className="print-page mx-auto flex w-full max-w-[210mm] flex-col gap-4 px-4 py-6 sm:px-6">
      <div className="print-toolbar flex flex-wrap items-center justify-between gap-3">
        <Link href={backHref} className="text-sm text-navy underline-offset-2 hover:underline">
          ← Back to books
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted">A4. In the dialog, choose Save as PDF.</p>
          <PrintButton />
        </div>
      </div>

      <article className="print-sheet">
        {sampleMark ? <PrintSampleMark /> : null}
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#c9c1b3] pb-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-[#8a5420] uppercase">
              OG Job Book
            </p>
            <h1 className="mt-1 font-display text-3xl text-[#1b2430]">
              {printGstQuarterTitle()}
            </h1>
            <p className="mt-1 text-sm text-[#4b5563]">
              {label} · {formatIsoDateAu(from)} – {formatIsoDateAu(to)}
            </p>
          </div>
        </header>

        <section className="mt-6">
          <h2 className="text-xs font-semibold tracking-wide text-[#8a5420] uppercase">
            Organisation
          </h2>
          <p className="mt-1 font-semibold text-[#1b2430]">{orgName}</p>
          <p className="text-sm text-[#4b5563]">{orgAddress}</p>
          <p className="mt-2 text-sm text-[#1b2430]">
            ABN {abn ? formatAbn(abn) : "not set"}
            {abnOk ? "" : " — checksum does not match ABR modulus 89"}
          </p>
          <p className="text-sm text-[#4b5563]">
            {gstRegistered ? "GST registered" : "Not GST registered"}
          </p>
        </section>

        <table className="mt-8 w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[#c9c1b3] text-[#4b5563]">
              <th className="py-2 pr-3 font-medium">Document</th>
              <th className="py-2 pr-3 font-medium">Issued</th>
              <th className="py-2 pr-3 font-medium">Customer</th>
              <th className="py-2 pr-3 text-right font-medium">GST-free</th>
              <th className="py-2 pr-3 text-right font-medium">GST</th>
              <th className="py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="py-4 text-[#4b5563]" colSpan={6}>
                  No live invoices in this quarter.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={`${row.kind}-${row.docNumber}`} className="border-b border-[#e6e0d4]">
                  <td className="py-2 pr-3">
                    <p>{row.docNumber}</p>
                    <p className="text-xs text-[#4b5563]">
                      {row.kindLabel}
                      {row.jobDescription ? ` · ${row.jobDescription}` : ""}
                    </p>
                  </td>
                  <td className="py-2 pr-3">{formatIsoDateAu(row.issuedOn)}</td>
                  <td className="py-2 pr-3">{row.customerName}</td>
                  <td className="py-2 pr-3 text-right font-mono">
                    {formatAudFromCents(row.gstFreeCents)}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono">
                    {formatAudFromCents(row.gstCents)}
                  </td>
                  <td className="py-2 text-right font-mono">
                    {formatAudFromCents(row.totalCents)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <dl className="mt-6 ml-auto w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-[#4b5563]">GST-free sales</dt>
            <dd className="font-mono">{formatAudFromCents(totals.gstFreeCents)}</dd>
          </div>
          {totals.otherCents !== 0 ? (
            <div className="flex justify-between gap-4">
              <dt className="text-[#4b5563]">Other (BAS excluded / input-taxed)</dt>
              <dd className="font-mono">{formatAudFromCents(totals.otherCents)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4">
            <dt className="text-[#4b5563]">GST on sales</dt>
            <dd className="font-mono">{formatAudFromCents(totals.gstCents)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-[#c9c1b3] pt-2 font-semibold">
            <dt>Total sales</dt>
            <dd className="font-mono">{formatAudFromCents(totals.totalCents)}</dd>
          </div>
        </dl>

        {!gstRegistered ? (
          <p className="mt-6 text-sm text-[#4b5563]">
            This organisation is not GST registered, so GST on sales is $0.00.
          </p>
        ) : null}

        <p className="mt-10 text-xs text-[#4b5563]">{GST_QUARTER_DISCLAIMER}</p>
      </article>
    </div>
  );
}
