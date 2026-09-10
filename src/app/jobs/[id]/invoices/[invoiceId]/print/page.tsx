import { notFound } from "next/navigation";
import { PrintSheet } from "@/components/print-sheet";
import { loadDb } from "@/db/ready";
import { getInvoiceById, getJobInOrg, getQuotesForJob, isUuid } from "@/db/queries";
import { invoiceKindSubtitle, parseInvoiceKind } from "@/lib/ledger/claim";
import { invoiceSettlement } from "@/lib/ledger/credit";
import { invoicePayDetails, invoicePayLines } from "@/lib/ledger/pay";
import { invoiceDocumentStatus, invoiceIsOverdue, paymentTermsLabel } from "@/lib/ledger/terms";
import { inspectionPrintLines } from "@/lib/ledger/inspection";
import { todayIsoSydney } from "@/lib/ledger/tax";
import { shouldWatermarkPrint } from "@/lib/ledger/print";

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
  const job = invoice ? await getJobInOrg(state.db, invoice.jobId, state.org.id) : null;
  if (!invoice || !job || job.id !== id) {
    notFound();
  }

  const quotes = invoice.quoteId
    ? await getQuotesForJob(state.db, invoice.jobId)
    : [];
  const quoteNumber = quotes.find((quote) => quote.id === invoice.quoteId)?.docNumber ?? "";
  const kind = parseInvoiceKind(invoice.kind);
  const { remainingCents, payState } = invoiceSettlement({
    invoiceTotalCents: invoice.totals.totalCents,
    paidCents: invoice.paidCents,
    creditedCents: invoice.creditedCents,
    retentionHeldCents: invoice.retentionHeldCents,
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
      customerPhone={job.customerPhone}
      customerEmail={job.customerEmail}
      jobDescription={job.description}
      inspectionLines={inspectionPrintLines(job)}
      totals={invoice.totals}
      dueDate={invoice.dueDate}
      paidCents={invoice.paidCents}
      creditedCents={invoice.creditedCents}
      paymentTermsLabel={paymentTermsLabel(invoice.paymentTermsDays)}
      kindLine={invoiceKindSubtitle({
        kind,
        quoteDocNumber: quoteNumber,
        percent: invoice.claimPercent,
      })}
      retentionHeldCents={invoice.retentionHeldCents}
      amountDueCents={remainingCents}
      payLines={invoicePayLines(
        invoicePayDetails({
          accountName: state.org.accountName,
          bsb: state.org.bsb,
          accountNumber: state.org.accountNumber,
          payId: state.org.payId,
        }),
      )}
      notice={overdue ? "This invoice is overdue." : undefined}
    
      sampleMark={shouldWatermarkPrint({
        orgId: state.org.id,
        isAdmin: state.isAdmin,
        trialStartedAt: state.trialStartedAt,
      })}
    />
  );
}
