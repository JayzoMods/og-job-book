import { loadDb, tenantWriteJsonDenied } from "@/db/ready";
import { getInvoiceById, getJobInOrg } from "@/db/queries";
import { invoiceBalanceCents } from "@/lib/ledger/credit";
import { parseRecipientEmail } from "@/lib/ledger/email";
import {
  STRIPE_CHARGE_NOTE,
  createCheckoutSession,
  parseStripeCheckout,
  stripeRejectStatus,
} from "@/lib/ledger/stripe";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const json: unknown = await request.json().catch(() => null);
  const parsed = parseStripeCheckout(json);
  if (!parsed.ok) {
    return Response.json(
      {
        created: false,
        skipped: false,
        note: STRIPE_CHARGE_NOTE,
        issues: parsed.issues,
      },
      { status: 400 },
    );
  }

  const state = await loadDb();
  if (!state.ok) {
    return Response.json(
      {
        created: false,
        skipped: false,
        note: "Postgres is not connected. Run docker compose up -d, then npm run db:apply.",
      },
      { status: 503 },
    );
  }
  const denied = tenantWriteJsonDenied(state);
  if (denied) {
    return denied;
  }

  const invoice = await getInvoiceById(state.db, parsed.payload.invoiceId);
  const job =
    invoice && state.org
      ? await getJobInOrg(state.db, invoice.jobId, state.org.id)
      : null;
  if (!invoice || !job) {
    return Response.json(
      {
        created: false,
        skipped: false,
        note: "Invoice not found.",
        invoiceId: parsed.payload.invoiceId,
      },
      { status: stripeRejectStatus("missing") },
    );
  }

  const remainingCents = invoiceBalanceCents(
    invoice.totals.totalCents,
    invoice.paidCents,
    invoice.creditedCents,
    invoice.retentionHeldCents,
  );
  const origin = new URL(request.url).origin;
  const result = await createCheckoutSession({
    invoiceId: invoice.id,
    jobId: job.id,
    docNumber: invoice.docNumber,
    status: invoice.status,
    remainingCents,
    origin,
    customerEmail: parseRecipientEmail(job.customerEmail),
  });

  if (result.status === "skipped") {
    return Response.json(
      {
        created: false,
        skipped: true,
        note: STRIPE_CHARGE_NOTE,
        reason: result.reason,
        invoiceId: invoice.id,
        docNumber: invoice.docNumber,
        jobId: job.id,
        remainingCents,
      },
      { status: stripeRejectStatus(result.reason) },
    );
  }
  if (result.status === "error") {
    return Response.json(
      {
        created: false,
        skipped: false,
        note: result.message,
        invoiceId: invoice.id,
        docNumber: invoice.docNumber,
        jobId: job.id,
      },
      { status: 502 },
    );
  }

  return Response.json({
    created: true,
    skipped: false,
    note: STRIPE_CHARGE_NOTE,
    id: result.id,
    url: result.url,
    invoiceId: invoice.id,
    docNumber: invoice.docNumber,
    jobId: job.id,
    remainingCents,
  });
}
