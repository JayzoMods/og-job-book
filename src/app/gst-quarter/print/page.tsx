import { notFound, redirect } from "next/navigation";
import { GstQuarterSheet } from "@/components/gst-quarter-sheet";
import { loadDb } from "@/db/ready";
import { getLedgerForOrg } from "@/db/queries";
import {
  gstQuarterRows,
  gstQuarterTotals,
  parseGstQuarter,
} from "@/lib/ledger/gst-quarter";
import { todayIsoSydney } from "@/lib/ledger/tax";

export async function generateMetadata() {
  return { title: "Print GST quarter" };
}

export default async function PrintGstQuarterPage({
  searchParams,
}: PageProps<"/gst-quarter/print">) {
  const query = await searchParams;
  const quarter = parseGstQuarter(
    typeof query.quarter === "string" ? query.quarter : "",
    todayIsoSydney(),
  );
  if (!quarter.ok) {
    redirect("/?error=gst");
  }
  const state = await loadDb();
  if (!state.ok || !state.org) {
    notFound();
  }
  const jobs = await getLedgerForOrg(state.db, state.org.id);
  const rows = gstQuarterRows(
    jobs.flatMap(({ job, invoices }) =>
      invoices.map((invoice) => ({
        status: invoice.status,
        dueDate: invoice.dueDate,
        paymentTermsDays: invoice.paymentTermsDays,
        kind: invoice.kind,
        docNumber: invoice.docNumber,
        customerName: job.customerName,
        jobDescription: job.description,
        gstCents: invoice.totals.gstCents,
        gstFreeCents: invoice.totals.gstFreeCents,
        otherCents: invoice.totals.otherCents,
        totalCents: invoice.totals.totalCents,
        creditNotes: invoice.creditNotes.map((note) => ({
          status: note.status,
          docNumber: note.docNumber,
          gstCents: note.totals.gstCents,
          gstFreeCents: note.totals.gstFreeCents,
          otherCents: note.totals.otherCents,
          totalCents: note.totals.totalCents,
        })),
      })),
    ),
    quarter.from,
    quarter.to,
  );

  return (
    <GstQuarterSheet
      backHref="/#gst-quarter"
      from={quarter.from}
      to={quarter.to}
      label={quarter.label}
      orgName={state.org.name}
      orgAddress={state.org.address}
      abn={state.org.abn}
      gstRegistered={state.org.gstRegistered}
      rows={rows}
      totals={gstQuarterTotals(rows)}
    />
  );
}
