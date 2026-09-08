import { notFound } from "next/navigation";
import { PrintSheet } from "@/components/print-sheet";
import { loadDb } from "@/db/ready";
import { getInvoiceById, getJob, isUuid } from "@/db/queries";
import { invoicePayDetails, invoicePayLines } from "@/lib/ledger/pay";
import { invoiceDocumentStatus, invoiceIsOverdue, paymentTermsLabel } from "@/lib/ledger/terms";
import { invoiceSettlement } from "@/lib/ledger/credit";
import { todayIsoSydney } from "@/lib/ledger/tax";

export async function generateMetadata({
  params,
}: PageProps<"/jobs/[id]/invoices/[invoiceId]/print">) {
  const { invoiceId } = await params;
  return { title: `Print invoice ${invoiceId.slice(0, 8)}` };
}

export default async function PrintInvoicePage({
  params,
}: PageProps<"/jobs/[id]/invoices/[invoiceId]/print">) {
  const { id, invoiceId } = await params;
  if (!isUuid(id) || !isUuid(invoiceId)) {
    notFound();
  }
  const state = await loadDb();
  if (!state.ok || !state.org) {
    notFound();
  }
  const invoice = await getInvoiceById(state.db, invoiceId);
  const job = invoice ? await getJob(state.db, invoice.jobId) : null;
  if (!invoice || !job || job.id !== id) {
    notFound();
  }

  const { remainingCents, payState } = invoiceSettlement({
    invoiceTotalCents: invoice.totals.totalCents,
    paidCents: invoice.paidCents,
    creditedCents: invoice.creditedCents,
  });
  const overdue = invoiceIsOverdue({
    status: invoice.status,
    dueDate: invoice.dueDate,
    remainingCents,
    today: todayIsoSydney(),
  });

  return (
    <PrintSheet
      kind="invoice"
      jobHref={`/jobs/${job.id}`}
      docNumber={invoice.docNumber}
      status={invoice.status}
      statusLabel={invoiceDocumentStatus(invoice.status, payState, overdue)}
      orgName={state.org.name}
      orgAddress={state.org.address}
      abn={state.org.abn}
      gstRegistered={state.org.gstRegistered}
      customerName={job.customerName}
      suburb={job.suburb}
      jobDescription={job.description}
      totals={invoice.totals}
      dueDate={invoice.dueDate}
      paidCents={invoice.paidCents}
      creditedCents={invoice.creditedCents}
      paymentTermsLabel={paymentTermsLabel(invoice.paymentTermsDays)}
      payLines={invoicePayLines(
        invoicePayDetails({
          accountName: state.org.accountName,
          bsb: state.org.bsb,
          accountNumber: state.org.accountNumber,
          payId: state.org.payId,
        }),
      )}
      notice={overdue ? "This invoice is overdue." : undefined}
    />
  );
}
