import { notFound } from "next/navigation";
import { RemittanceSheet } from "@/components/account-sheet";
import { loadDb } from "@/db/ready";
import { getInvoiceById, getJobInOrg, isUuid } from "@/db/queries";
import { shouldWatermarkPrint } from "@/lib/ledger/print";
import { remittanceAdvice } from "@/lib/ledger/statement";

export async function generateMetadata({
  params,
}: PageProps<"/jobs/[id]/invoices/[invoiceId]/payments/[paymentId]/print">) {
  const { paymentId } = await params;
  return { title: `Print remittance ${paymentId.slice(0, 8)}` };
}

export default async function PrintRemittancePage({
  params,
}: PageProps<"/jobs/[id]/invoices/[invoiceId]/payments/[paymentId]/print">) {
  const { id, invoiceId, paymentId } = await params;
  if (!isUuid(id) || !isUuid(invoiceId) || !isUuid(paymentId)) {
    notFound();
  }
  const state = await loadDb();
  if (!state.ok || !state.org) {
    notFound();
  }
  const invoice = await getInvoiceById(state.db, invoiceId);
  const job = invoice ? await getJobInOrg(state.db, invoice.jobId, state.org.id) : null;
  const payment = invoice?.payments.find((row) => row.id === paymentId);
  if (!invoice || !job || job.id !== id || !payment) {
    notFound();
  }

  return (
    <RemittanceSheet
      jobHref={`/jobs/${job.id}`}
      orgName={state.org.name}
      orgAddress={state.org.address}
      abn={state.org.abn}
      gstRegistered={state.org.gstRegistered}
      customerName={job.customerName}
      suburb={job.suburb}
      customerPhone={job.customerPhone || undefined}
      customerEmail={job.customerEmail || undefined}
      jobDescription={job.description}
      advice={remittanceAdvice({
        paidOn: payment.paidOn,
        method: payment.method,
        amountCents: payment.amountCents,
        invoiceDocNumber: invoice.docNumber,
        invoiceTotalCents: invoice.totals.totalCents,
        creditedCents: invoice.creditedCents,
        retentionHeldCents: invoice.retentionHeldCents,
        payments: invoice.payments.map((row) => ({
          paidOn: row.paidOn,
          amountCents: row.amountCents,
        })),
      })}
      sampleMark={shouldWatermarkPrint({
        orgId: state.org.id,
        isAdmin: state.isAdmin,
        trialStartedAt: state.trialStartedAt,
      })}
    />
  );
}
