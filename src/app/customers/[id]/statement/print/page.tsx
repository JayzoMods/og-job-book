import { notFound, redirect } from "next/navigation";
import { StatementSheet } from "@/components/account-sheet";
import { loadDb } from "@/db/ready";
import { getCustomer, getInvoicesForCustomer, isUuid } from "@/db/queries";
import { invoicePayDetails, invoicePayLines } from "@/lib/ledger/pay";
import { parseStatementDates, statementRows, statementTotals } from "@/lib/ledger/statement";
import { todayIsoSydney } from "@/lib/ledger/tax";

export async function generateMetadata({
  params,
}: PageProps<"/customers/[id]/statement/print">) {
  const { id } = await params;
  return { title: `Print statement ${id.slice(0, 8)}` };
}

export default async function PrintStatementPage({
  params,
  searchParams,
}: PageProps<"/customers/[id]/statement/print">) {
  const { id } = await params;
  const query = await searchParams;
  if (!isUuid(id)) {
    notFound();
  }
  const dates = parseStatementDates(
    typeof query.asAt === "string" ? query.asAt : "",
    typeof query.from === "string" ? query.from : "",
    todayIsoSydney(),
  );
  if (!dates.ok) {
    redirect("/?error=statement");
  }
  const state = await loadDb();
  if (!state.ok || !state.org) {
    notFound();
  }
  const customer = await getCustomer(state.db, id);
  if (!customer || customer.orgId !== state.org.id) {
    notFound();
  }
  const invoices = await getInvoicesForCustomer(state.db, customer.id);
  const rows = statementRows(
    invoices.map((invoice) => ({
      id: invoice.id,
      jobId: invoice.jobId,
      jobDescription: invoice.jobDescription,
      docNumber: invoice.docNumber,
      status: invoice.status,
      kind: invoice.kind,
      dueDate: invoice.dueDate,
      paymentTermsDays: invoice.paymentTermsDays,
      totalCents: invoice.totals.totalCents,
      creditedCents: invoice.creditedCents,
      retentionHeldCents: invoice.retentionHeldCents,
      payments: invoice.payments.map((payment) => ({
        paidOn: payment.paidOn,
        amountCents: payment.amountCents,
      })),
    })),
    dates.asAt,
    dates.from,
  );

  return (
    <StatementSheet
      backHref="/#customers"
      backLabel="Back to customers"
      asAt={dates.asAt}
      from={dates.from}
      orgName={state.org.name}
      orgAddress={state.org.address}
      abn={state.org.abn}
      gstRegistered={state.org.gstRegistered}
      customerName={customer.name}
      suburb={customer.suburb}
      customerPhone={customer.phone || undefined}
      customerEmail={customer.email || undefined}
      rows={rows}
      totals={statementTotals(rows)}
      payLines={invoicePayLines(
        invoicePayDetails({
          accountName: state.org.accountName,
          bsb: state.org.bsb,
          accountNumber: state.org.accountNumber,
          payId: state.org.payId,
        }),
      )}
    />
  );
}
