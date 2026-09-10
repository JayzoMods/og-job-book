import { revalidatePath } from "next/cache";
import { loadDb, tenantJsonDenied } from "@/db/ready";
import { getCreditNoteById, getInvoiceById, getJobInOrg } from "@/db/queries";
import {
  ACCOUNTING_WRITE_NOTE,
  accountingRejectStatus,
  invoiceDateForWrite,
  parseAccountingLines,
  parseAccountingWrite,
  writeAccountingDocument,
} from "@/lib/ledger/accounting";
import { todayIsoSydney } from "@/lib/ledger/tax";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const json: unknown = await request.json().catch(() => null);
  const parsed = parseAccountingWrite(json);
  if (!parsed.ok) {
    return Response.json(
      {
        written: false,
        skipped: false,
        note: ACCOUNTING_WRITE_NOTE,
        issues: parsed.issues,
      },
      { status: 400 },
    );
  }

  const state = await loadDb();
  if (!state.ok) {
    return Response.json(
      {
        written: false,
        skipped: false,
        note: "Postgres is not connected. Run docker compose up -d, then npm run db:apply.",
      },
      { status: 503 },
    );
  }
  const denied = tenantJsonDenied(state);
  if (denied) {
    return denied;
  }
  const org = state.org;
  if (parsed.payload.kind === "invoice") {
    const invoice = await getInvoiceById(state.db, parsed.payload.id);
    const job = invoice && org ? await getJobInOrg(state.db, invoice.jobId, org.id) : null;
    if (!invoice || !job || !org) {
      return Response.json(
        {
          written: false,
          skipped: false,
          note: "Invoice not found.",
          id: parsed.payload.id,
        },
        { status: accountingRejectStatus("missing") },
      );
    }
    const issuedOn =
      invoiceDateForWrite(invoice.dueDate, invoice.paymentTermsDays) ?? invoice.dueDate;
    const result = await writeAccountingDocument({
      provider: parsed.payload.provider,
      kind: "invoice",
      status: invoice.status,
      docNumber: invoice.docNumber,
      customerName: job.customerName,
      jobDescription: job.description,
      issuedOn,
      dueDate: invoice.dueDate,
      gstRegistered: org.gstRegistered,
      lines: parseAccountingLines(invoice.lines),
    });
    return jsonFromWrite(result, {
      jobId: job.id,
      docNumber: invoice.docNumber,
      documentId: invoice.id,
      provider: parsed.payload.provider,
      kind: parsed.payload.kind,
    });
  }

  const note = await getCreditNoteById(state.db, parsed.payload.id);
  const job = note && org ? await getJobInOrg(state.db, note.jobId, org.id) : null;
  if (!note || !job || !org) {
    return Response.json(
      {
        written: false,
        skipped: false,
        note: "Credit note not found.",
        id: parsed.payload.id,
      },
      { status: accountingRejectStatus("missing") },
    );
  }
  const result = await writeAccountingDocument({
    provider: parsed.payload.provider,
    kind: "credit",
    status: note.status,
    docNumber: note.docNumber,
    customerName: job.customerName,
    jobDescription: job.description,
    issuedOn: todayIsoSydney(note.createdAt),
    gstRegistered: org.gstRegistered,
    lines: parseAccountingLines(note.lines),
    againstDocNumber: note.againstDocNumber,
  });
  return jsonFromWrite(result, {
    jobId: job.id,
    docNumber: note.docNumber,
    documentId: note.id,
    provider: parsed.payload.provider,
    kind: parsed.payload.kind,
  });
}

function jsonFromWrite(
  result: Awaited<ReturnType<typeof writeAccountingDocument>>,
  ids: {
    jobId: string;
    docNumber: string;
    documentId: string;
    provider: string;
    kind: string;
  },
) {
  if (result.status === "skipped") {
    return Response.json(
      {
        written: false,
        skipped: true,
        note: ACCOUNTING_WRITE_NOTE,
        reason: result.reason,
        documentId: ids.documentId,
        docNumber: ids.docNumber,
        jobId: ids.jobId,
        provider: ids.provider,
        kind: ids.kind,
      },
      { status: accountingRejectStatus(result.reason) },
    );
  }
  if (result.status === "error") {
    return Response.json(
      {
        written: false,
        skipped: false,
        note: result.message,
        documentId: ids.documentId,
        docNumber: ids.docNumber,
        jobId: ids.jobId,
        provider: ids.provider,
        kind: ids.kind,
      },
      { status: 502 },
    );
  }
  revalidatePath(`/jobs/${ids.jobId}`);
  return Response.json({
    written: true,
    skipped: false,
    note: ACCOUNTING_WRITE_NOTE,
    id: result.id,
    documentId: ids.documentId,
    docNumber: ids.docNumber,
    jobId: ids.jobId,
    provider: ids.provider,
    kind: ids.kind,
  });
}
