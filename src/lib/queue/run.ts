import type { AppDb } from "@/db/client";
import { issueRecurringInvoice, listRecurringForOrg } from "@/db/queries";
import {
  QUEUE_NOTE,
  dueRecurringJobs,
  queueConfigured,
  redactQueueError,
  type QueueSkipReason,
} from "@/lib/ledger/queue";
import { enqueueIssueRecurringJobs } from "@/lib/queue/bullmq";

export type RunDueRecurringResult =
  | { status: "skipped"; reason: QueueSkipReason; note: string }
  | { status: "error"; message: string; note: string }
  | {
      status: "queued";
      note: string;
      queued: number;
      issued: number;
      skipped: number;
      ids: string[];
    };

export async function runDueRecurringQueue(input: {
  db: AppDb;
  orgId: string;
  today: string;
  recurringInvoiceId?: string;
}): Promise<RunDueRecurringResult> {
  if (!queueConfigured()) {
    return { status: "skipped", reason: "no_key", note: QUEUE_NOTE };
  }

  const listed = await listRecurringForOrg(input.db, input.orgId);
  const scoped = input.recurringInvoiceId
    ? listed.filter((row) => row.id === input.recurringInvoiceId)
    : listed;
  if (input.recurringInvoiceId && scoped.length === 0) {
    return { status: "skipped", reason: "missing", note: QUEUE_NOTE };
  }

  const due = dueRecurringJobs(
    scoped.map((row) => ({
      id: row.id,
      status: row.status,
      frequency: row.frequency,
      nextIssueOn: row.nextIssueOn,
      endOn: row.endOn,
      hasLines: row.lines.length > 0,
      jobStatus: row.jobStatus,
    })),
    input.today,
  );
  if (input.recurringInvoiceId && due.length === 0) {
    return { status: "skipped", reason: "not_due", note: QUEUE_NOTE };
  }

  let ids: string[];
  try {
    const queued = await enqueueIssueRecurringJobs(due);
    ids = queued.ids;
  } catch (error) {
    return { status: "error", message: redactQueueError(error), note: QUEUE_NOTE };
  }

  let issued = 0;
  let skipped = 0;
  for (const job of due) {
    const outcome = await issueRecurringInvoice(input.db, {
      recurringId: job.recurringInvoiceId,
      today: input.today,
      orgId: input.orgId,
      requireDue: true,
    });
    if (outcome.ok) {
      issued += 1;
    } else {
      skipped += 1;
    }
  }
  return {
    status: "queued",
    note: QUEUE_NOTE,
    queued: ids.length,
    issued,
    skipped,
    ids,
  };
}
