import { notFound } from "next/navigation";
import { PrintSheet } from "@/components/print-sheet";
import { loadDb } from "@/db/ready";
import { getCreditNoteById, getJob, isUuid } from "@/db/queries";
import { formatInstantAu } from "@/lib/ledger/print";

export async function generateMetadata({
  params,
}: PageProps<"/jobs/[id]/credits/[creditId]/print">) {
  const { creditId } = await params;
  return { title: `Print credit note ${creditId.slice(0, 8)}` };
}

export default async function PrintCreditNotePage({
  params,
}: PageProps<"/jobs/[id]/credits/[creditId]/print">) {
  const { id, creditId } = await params;
  if (!isUuid(id) || !isUuid(creditId)) {
    notFound();
  }
  const state = await loadDb();
  if (!state.ok || !state.org) {
    notFound();
  }
  const note = await getCreditNoteById(state.db, creditId);
  const job = note ? await getJob(state.db, note.jobId) : null;
  if (!note || !job || job.id !== id) {
    notFound();
  }

  return (
    <PrintSheet
      kind="credit"
      jobHref={`/jobs/${job.id}`}
      docNumber={note.docNumber}
      status={note.status}
      issuedLabel={formatInstantAu(note.createdAt)}
      orgName={state.org.name}
      orgAddress={state.org.address}
      abn={state.org.abn}
      gstRegistered={state.org.gstRegistered}
      customerName={job.customerName}
      suburb={job.suburb}
      jobDescription={job.description}
      totals={note.totals}
      againstLabel={
        note.againstDocNumber ? `invoice ${note.againstDocNumber}` : undefined
      }
      reason={note.reason || undefined}
    />
  );
}
