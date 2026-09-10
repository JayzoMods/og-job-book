import { revalidatePath } from "next/cache";
import { loadDb, tenantWriteJsonDenied } from "@/db/ready";
import { getInvoiceById, getJobInOrg, getQuoteById } from "@/db/queries";
import {
  EMAIL_SEND_NOTE,
  emailRejectStatus,
  parseRecipientEmail,
  parseSendEmail,
  sendDocumentEmail,
} from "@/lib/ledger/email";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const json: unknown = await request.json().catch(() => null);
  const parsed = parseSendEmail(json);
  if (!parsed.ok) {
    return Response.json(
      {
        sent: false,
        skipped: false,
        note: EMAIL_SEND_NOTE,
        issues: parsed.issues,
      },
      { status: 400 },
    );
  }

  const state = await loadDb();
  if (!state.ok) {
    return Response.json(
      {
        sent: false,
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
  const org = state.org;

  const origin = new URL(request.url).origin;

  if (parsed.payload.kind === "quote") {
    const quote = await getQuoteById(state.db, parsed.payload.id);
    const job = quote && org ? await getJobInOrg(state.db, quote.jobId, org.id) : null;
    if (!quote || !job || !org) {
      return Response.json(
        {
          sent: false,
          skipped: false,
          note: "Quote not found.",
          id: parsed.payload.id,
        },
        { status: emailRejectStatus("missing") },
      );
    }
    const result = await sendDocumentEmail({
      kind: "quote",
      status: quote.status,
      docNumber: quote.docNumber,
      orgName: org.name,
      abn: org.abn,
      gstRegistered: org.gstRegistered,
      gstCents: quote.totals.gstCents,
      totalCents: quote.totals.totalCents,
      jobId: job.id,
      documentId: quote.id,
      to: parseRecipientEmail(job.customerEmail),
      origin,
      shareToken: quote.shareToken,
    });
    return jsonFromSend(result, {
      jobId: job.id,
      docNumber: quote.docNumber,
      documentId: quote.id,
    });
  }

  const invoice = await getInvoiceById(state.db, parsed.payload.id);
  const job = invoice && org ? await getJobInOrg(state.db, invoice.jobId, org.id) : null;
  if (!invoice || !job || !org) {
    return Response.json(
      {
        sent: false,
        skipped: false,
        note: "Invoice not found.",
        id: parsed.payload.id,
      },
      { status: emailRejectStatus("missing") },
    );
  }
  const result = await sendDocumentEmail({
    kind: "invoice",
    status: invoice.status,
    docNumber: invoice.docNumber,
    orgName: org.name,
    abn: org.abn,
    gstRegistered: org.gstRegistered,
    gstCents: invoice.totals.gstCents,
    totalCents: invoice.totals.totalCents,
    jobId: job.id,
    documentId: invoice.id,
    to: parseRecipientEmail(job.customerEmail),
    origin,
  });
  return jsonFromSend(result, {
    jobId: job.id,
    docNumber: invoice.docNumber,
    documentId: invoice.id,
  });
}

function jsonFromSend(
  result: Awaited<ReturnType<typeof sendDocumentEmail>>,
  ids: { jobId: string; docNumber: string; documentId: string },
) {
  if (result.status === "skipped") {
    return Response.json(
      {
        sent: false,
        skipped: true,
        note: EMAIL_SEND_NOTE,
        reason: result.reason,
        documentId: ids.documentId,
        docNumber: ids.docNumber,
        jobId: ids.jobId,
      },
      { status: emailRejectStatus(result.reason) },
    );
  }
  if (result.status === "error") {
    return Response.json(
      {
        sent: false,
        skipped: false,
        note: result.message,
        documentId: ids.documentId,
        docNumber: ids.docNumber,
        jobId: ids.jobId,
      },
      { status: 502 },
    );
  }
  revalidatePath(`/jobs/${ids.jobId}`);
  return Response.json({
    sent: true,
    skipped: false,
    note: EMAIL_SEND_NOTE,
    id: result.id,
    documentId: ids.documentId,
    docNumber: ids.docNumber,
    jobId: ids.jobId,
  });
}
