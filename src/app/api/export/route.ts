import { redirect } from "next/navigation";
import { currentTenantGate, loadDb } from "@/db/ready";
import { getLedgerForOrg, listCustomers, type JobLedger } from "@/db/queries";
import {
  creditExportRows,
  exportFilename,
  invoiceExportRows,
  LEDGER_EXPORT_DISCLAIMER,
  parseExportFormat,
  paymentBelongsInExport,
  quoteExportRows,
  toBasCheckCsv,
  toLedgerCsv,
  toLedgerJson,
  type ExportLineRow,
  type LedgerJson,
} from "@/lib/ledger/export";
import { parseStatementDates, invoiceIssuedOn } from "@/lib/ledger/statement";
import { todayIsoSydney } from "@/lib/ledger/tax";

export const dynamic = "force-dynamic";

function salesAndQuotes(jobs: JobLedger[], asAt: string, from: string | null) {
  const sales: ExportLineRow[] = [];
  const quotes: ExportLineRow[] = [];
  for (const { job, quotes: quoteList, invoices } of jobs) {
    for (const quote of quoteList) {
      quotes.push(
        ...quoteExportRows({
          docNumber: quote.docNumber,
          status: quote.status,
          validUntil: quote.validUntil,
          customerName: job.customerName,
          suburb: job.suburb,
          jobDescription: job.description,
          lines: quote.totals.lines,
        }),
      );
    }
    for (const invoice of invoices) {
      sales.push(
        ...invoiceExportRows({
          docNumber: invoice.docNumber,
          status: invoice.status,
          dueDate: invoice.dueDate,
          paymentTermsDays: invoice.paymentTermsDays,
          customerName: job.customerName,
          suburb: job.suburb,
          jobDescription: job.description,
          lines: invoice.totals.lines,
          asAt,
          from,
        }),
      );
      for (const note of invoice.creditNotes) {
        sales.push(
          ...creditExportRows({
            docNumber: note.docNumber,
            status: note.status,
            invoiceStatus: invoice.status,
            invoiceDueDate: invoice.dueDate,
            invoicePaymentTermsDays: invoice.paymentTermsDays,
            customerName: job.customerName,
            suburb: job.suburb,
            jobDescription: job.description,
            lines: note.totals.lines,
            asAt,
            from,
          }),
        );
      }
    }
  }
  return { sales, quotes };
}

function ledgerJson(
  org: {
    name: string;
    abn: string;
    gstRegistered: boolean;
    address: string;
    paymentTermsDays: number;
    retentionPercent: number;
  },
  jobs: JobLedger[],
  customers: Array<{ name: string; suburb: string; phone: string; email: string }>,
  asAt: string,
  from: string | null,
): LedgerJson {
  const invoices: LedgerJson["invoices"] = [];
  const payments: LedgerJson["payments"] = [];
  const creditNotes: LedgerJson["creditNotes"] = [];
  const quotes: LedgerJson["quotes"] = [];

  for (const { job, quotes: quoteList, invoices: invoiceList } of jobs) {
    for (const quote of quoteList) {
      quotes.push({
        docNumber: quote.docNumber,
        status: quote.status,
        validUntil: quote.validUntil,
        customerName: job.customerName,
        gstCents: quote.totals.gstCents,
        totalCents: quote.totals.totalCents,
        lines: quote.totals.lines.map((line) => ({
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          unitPriceCents: line.unitPriceCents,
          taxCode: line.taxCode,
          amountKind: line.amountKind,
          gstCents: line.gstCents,
          totalCents: line.totalCents,
        })),
      });
    }
    for (const invoice of invoiceList) {
      const inPeriod = invoiceExportRows({
        docNumber: invoice.docNumber,
        status: invoice.status,
        dueDate: invoice.dueDate,
        paymentTermsDays: invoice.paymentTermsDays,
        customerName: job.customerName,
        suburb: job.suburb,
        jobDescription: job.description,
        lines: invoice.totals.lines,
        asAt,
        from,
      });
      if (inPeriod.length === 0) {
        continue;
      }
      const issuedOn =
        invoiceIssuedOn(invoice.dueDate, invoice.paymentTermsDays) ?? invoice.dueDate;
      const paidCents = invoice.payments
        .filter((payment) => paymentBelongsInExport(payment.paidOn, asAt, from))
        .reduce((sum, payment) => sum + payment.amountCents, 0);
      invoices.push({
        docNumber: invoice.docNumber,
        status: invoice.status,
        kind: invoice.kind,
        issuedOn,
        dueDate: invoice.dueDate,
        customerName: job.customerName,
        gstCents: invoice.totals.gstCents,
        totalCents: invoice.totals.totalCents,
        paidCents,
        creditedCents: invoice.creditedCents,
      });
      for (const payment of invoice.payments) {
        if (!paymentBelongsInExport(payment.paidOn, asAt, from)) {
          continue;
        }
        payments.push({
          invoiceDocNumber: invoice.docNumber,
          amountCents: payment.amountCents,
          paidOn: payment.paidOn,
          method: payment.method,
        });
      }
      for (const note of invoice.creditNotes) {
        if (note.status === "void") {
          continue;
        }
        creditNotes.push({
          docNumber: note.docNumber,
          status: note.status,
          againstDocNumber: note.againstDocNumber,
          gstCents: note.totals.gstCents,
          totalCents: note.totals.totalCents,
        });
      }
    }
  }

  return {
    product: "OG Job Book",
    disclaimer: LEDGER_EXPORT_DISCLAIMER,
    asAt,
    from,
    org: {
      name: org.name,
      abn: org.abn,
      gstRegistered: org.gstRegistered,
      address: org.address,
      paymentTermsDays: org.paymentTermsDays,
      retentionPercent: org.retentionPercent,
    },
    customers: customers.map((customer) => ({
      name: customer.name,
      suburb: customer.suburb,
      phone: customer.phone,
      email: customer.email,
    })),
    jobs: jobs.map(({ job }) => ({
      customerName: job.customerName,
      suburb: job.suburb,
      description: job.description,
      status: job.status,
      propertyAddress: job.propertyAddress,
      vendorName: job.vendorName,
      purchaserName: job.purchaserName,
      reportType: job.reportType,
    })),
    quotes,
    invoices,
    payments,
    creditNotes,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const format = parseExportFormat(url.searchParams.get("format"));
  if (!format) {
    redirect("/?error=export");
  }
  const dates = parseStatementDates(
    url.searchParams.get("asAt"),
    url.searchParams.get("from"),
    todayIsoSydney(),
  );
  if (!dates.ok) {
    redirect("/?error=export");
  }
  const state = await loadDb();
  if (!state.ok) {
    redirect("/?error=db");
  }
  if (currentTenantGate(state) === "unauthenticated") {
    redirect("/sign-in");
  }
  if (!state.org) {
    redirect("/?error=org");
  }

  const [jobs, customers] = await Promise.all([
    getLedgerForOrg(state.db, state.org.id),
    listCustomers(state.db, state.org.id),
  ]);
  const { sales, quotes } = salesAndQuotes(jobs, dates.asAt, dates.from);
  const filename = exportFilename(format, dates.asAt);

  if (format === "json") {
    const body = toLedgerJson(
      ledgerJson(state.org, jobs, customers, dates.asAt, dates.from),
    );
    return new Response(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const csv =
    format === "csv" ? toLedgerCsv([...quotes, ...sales]) : toBasCheckCsv(sales);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
