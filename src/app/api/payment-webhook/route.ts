import { revalidatePath } from "next/cache";
import { loadDb } from "@/db/ready";
import { getInvoiceById, recordInvoicePayment } from "@/db/queries";
import {
  PAYMENT_WEBHOOK_NOTE,
  parsePaymentWebhook,
  webhookApplyReason,
  webhookRejectStatus,
} from "@/lib/ledger/webhook";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const json: unknown = await request.json().catch(() => null);
  const parsed = parsePaymentWebhook(json);
  if (!parsed.ok) {
    return Response.json(
      {
        received: false,
        applied: false,
        note: PAYMENT_WEBHOOK_NOTE,
        issues: parsed.issues,
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

  const invoice = await getInvoiceById(state.db, parsed.payload.invoiceId);
  const reason = webhookApplyReason(invoice);
  if (reason !== "ok" || !invoice) {
    const reject = reason === "void" ? "void" : "missing";
    return Response.json(
      {
        received: true,
        applied: false,
        note:
          reject === "void"
            ? "A void invoice cannot take a payment."
            : "Invoice not found.",
        invoiceId: parsed.payload.invoiceId,
      },
      { status: webhookRejectStatus(reject) },
    );
  }

  const result = await recordInvoicePayment(state.db, invoice, parsed.payload);
  revalidatePath("/");
  revalidatePath(`/jobs/${invoice.jobId}`);
  return Response.json({
    received: true,
    applied: true,
    note: PAYMENT_WEBHOOK_NOTE,
    paymentId: result.paymentId,
    invoiceId: invoice.id,
    invoiceDocNumber: invoice.docNumber,
    jobId: invoice.jobId,
    remainingCents: result.remainingCents,
    invoiceStatus: result.invoiceStatus,
  });
}
