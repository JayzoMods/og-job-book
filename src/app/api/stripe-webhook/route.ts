import { revalidatePath } from "next/cache";
import { loadDb } from "@/db/ready";
import { getInvoiceById, recordInvoicePayment } from "@/db/queries";
import { todayIsoSydney } from "@/lib/ledger/tax";
import {
  STRIPE_CHARGE_NOTE,
  dueNowCents,
  parseStripeCheckoutCompleted,
  stripeRejectStatus,
  stripeWebhookApplyReason,
  stripeWebhookSecretFromEnv,
  verifyStripeSignature,
} from "@/lib/ledger/stripe";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = await request.text();
  const secret = stripeWebhookSecretFromEnv();
  if (!secret) {
    return Response.json(
      {
        received: false,
        applied: false,
        note: STRIPE_CHARGE_NOTE,
        reason: "no_key",
      },
      { status: stripeRejectStatus("no_key") },
    );
  }

  const header = request.headers.get("stripe-signature");
  if (!verifyStripeSignature({ payload, header, secret })) {
    return Response.json(
      {
        received: false,
        applied: false,
        note: "Stripe signature was missing or invalid.",
        reason: "signature",
      },
      { status: stripeRejectStatus("signature") },
    );
  }

  let json: unknown = null;
  if (payload.trim() !== "") {
    try {
      json = JSON.parse(payload) as unknown;
    } catch {
      json = null;
    }
  }
  const parsed = parseStripeCheckoutCompleted(json);
  if (!parsed.ok && parsed.reason === "ignored") {
    return Response.json({
      received: true,
      applied: false,
      note: STRIPE_CHARGE_NOTE,
      reason: "ignored",
    });
  }
  if (!parsed.ok) {
    return Response.json(
      {
        received: true,
        applied: false,
        note: STRIPE_CHARGE_NOTE,
        reason: "junk",
      },
      { status: 400 },
    );
  }

  const state = await loadDb();
  if (!state.ok) {
    return Response.json(
      {
        received: true,
        applied: false,
        note: "Postgres is not connected. Run docker compose up -d, then npm run db:apply.",
      },
      { status: 503 },
    );
  }

  const invoice = await getInvoiceById(state.db, parsed.invoiceId);
  const remainingCents = invoice
    ? dueNowCents({
        totalCents: invoice.totals.totalCents,
        paidCents: invoice.paidCents,
        creditedCents: invoice.creditedCents,
        retentionHeldCents: invoice.retentionHeldCents,
      })
    : 0;
  const reason = stripeWebhookApplyReason({ invoice, remainingCents });
  if (reason === "already_paid") {
    return Response.json({
      received: true,
      applied: false,
      note: STRIPE_CHARGE_NOTE,
      reason,
      invoiceId: parsed.invoiceId,
      remainingCents: 0,
    });
  }
  if (reason !== "ok" || !invoice) {
    const reject = reason === "missing" ? "missing" : reason === "void" ? "void" : "not_payable";
    return Response.json(
      {
        received: true,
        applied: false,
        note:
          reject === "void"
            ? "A void invoice cannot take a payment."
            : reject === "missing"
              ? "Invoice not found."
              : "Only a sent or paid invoice with amount due now can be charged.",
        reason: reject,
        invoiceId: parsed.invoiceId,
      },
      { status: stripeRejectStatus(reject) },
    );
  }

  const result = await recordInvoicePayment(state.db, invoice, {
    amountCents: parsed.amountCents,
    paidOn: todayIsoSydney(),
    method: "card",
  });
  revalidatePath("/");
  revalidatePath(`/jobs/${invoice.jobId}`);
  return Response.json({
    received: true,
    applied: true,
    note: STRIPE_CHARGE_NOTE,
    paymentId: result.paymentId,
    invoiceId: invoice.id,
    invoiceDocNumber: invoice.docNumber,
    jobId: invoice.jobId,
    remainingCents: result.remainingCents,
    invoiceStatus: result.invoiceStatus,
    stripeSessionId: parsed.sessionId,
  });
}
