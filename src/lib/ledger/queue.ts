import { z } from "zod";
import { recurringIsDue } from "./recurring";

export const QUEUE_NAME = "og-job-book";
export const ISSUE_RECURRING_JOB = "issue-recurring";

export const QUEUE_NOTE =
  "Queues due recurring invoices on Redis with BullMQ. A worker issues one period at a time (same as the click). Off until REDIS_URL is set. Leave it unset on a public no-login deploy. Not a booking calendar. Not email.";

export type QueueSkipReason = "no_key" | "not_due" | "missing";

export type RedisConnection = {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  tls?: Record<string, never>;
};

export type IssueRecurringJob = {
  recurringInvoiceId: string;
};

export type QueueRunPayload =
  | { kind: "sweep" }
  | { kind: "issue-recurring"; recurringInvoiceId: string };

export type ParseQueueRunResult =
  | { ok: true; payload: QueueRunPayload }
  | { ok: false; issues: string[] };

export type RecurringQueueRow = {
  id: string;
  status: string;
  frequency: string;
  nextIssueOn: string;
  endOn?: string | null;
  hasLines: boolean;
  jobStatus: string;
};

export type QueueAddFn = (input: {
  name: string;
  data: IssueRecurringJob;
  jobId: string;
}) => Promise<string>;

export type QueueEnqueueResult =
  | { status: "skipped"; reason: "no_key" }
  | { status: "error"; message: string }
  | { status: "queued"; ids: string[] };

const issueSchema = z.object({
  kind: z.literal("issue-recurring"),
  recurringInvoiceId: z.string().uuid(),
});

const sweepSchema = z.object({
  kind: z.literal("sweep").optional(),
});

/** Empty and junk → off. redis:// and rediss:// with a host only. */
export function parseRedisUrl(raw: string | number | null | undefined): RedisConnection | null {
  const trimmed = String(raw ?? "").trim();
  if (trimmed === "") {
    return null;
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    return null;
  }
  const host = url.hostname.trim();
  if (host === "") {
    return null;
  }
  const port = url.port === "" ? 6379 : Number(url.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }
  const dbPath = url.pathname.replace(/^\//, "");
  let db: number | undefined;
  if (dbPath !== "") {
    db = Number(dbPath);
    if (!Number.isInteger(db) || db < 0) {
      return null;
    }
  }
  const username = url.username ? decodeURIComponent(url.username) : "";
  const password = url.password ? decodeURIComponent(url.password) : "";
  return {
    host,
    port,
    ...(username ? { username } : {}),
    ...(password ? { password } : {}),
    ...(db !== undefined ? { db } : {}),
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
  };
}

export function redisUrlFromEnv(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const parsed = parseRedisUrl(env.REDIS_URL);
  return parsed ? env.REDIS_URL?.trim() : undefined;
}

export function queueConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(parseRedisUrl(env.REDIS_URL));
}

export function bullmqConnection(parsed: RedisConnection): {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  tls?: Record<string, never>;
  maxRetriesPerRequest: null;
} {
  return {
    host: parsed.host,
    port: parsed.port,
    ...(parsed.username ? { username: parsed.username } : {}),
    ...(parsed.password ? { password: parsed.password } : {}),
    ...(parsed.db !== undefined ? { db: parsed.db } : {}),
    ...(parsed.tls ? { tls: parsed.tls } : {}),
    maxRetriesPerRequest: null,
  };
}

export function queueJobId(recurringInvoiceId: string, nextIssueOn: string): string {
  return `${ISSUE_RECURRING_JOB}:${recurringInvoiceId}:${nextIssueOn}`;
}

export function parseIssueRecurringJob(json: unknown): IssueRecurringJob | null {
  const parsed = z.object({ recurringInvoiceId: z.string().uuid() }).safeParse(json);
  return parsed.success ? parsed.data : null;
}

/** Empty body or {} is a sweep (cron). Junk kind or a bad id is rejected. */
export function parseQueueRun(json: unknown): ParseQueueRunResult {
  if (json === null || json === undefined) {
    return { ok: true, payload: { kind: "sweep" } };
  }
  if (typeof json !== "object" || Array.isArray(json)) {
    return { ok: false, issues: ["Expected a JSON object"] };
  }
  const kind = (json as { kind?: unknown }).kind;
  if (kind === "issue-recurring") {
    const parsed = issueSchema.safeParse(json);
    if (!parsed.success) {
      return {
        ok: false,
        issues: parsed.error.issues.map((issue) => issue.message),
      };
    }
    return { ok: true, payload: parsed.data };
  }
  if (kind === undefined && Object.keys(json).length === 0) {
    return { ok: true, payload: { kind: "sweep" } };
  }
  const parsed = sweepSchema.safeParse(json);
  if (!parsed.success || kind !== "sweep") {
    return { ok: false, issues: ["Expected kind sweep or issue-recurring"] };
  }
  return { ok: true, payload: { kind: "sweep" } };
}

export function dueRecurringJobs(
  rows: RecurringQueueRow[],
  today: string,
): Array<{ recurringInvoiceId: string; nextIssueOn: string }> {
  return rows
    .filter((row) =>
      recurringIsDue(
        {
          status: row.status,
          frequency: row.frequency,
          nextIssueOn: row.nextIssueOn,
          endOn: row.endOn,
          hasLines: row.hasLines,
          jobStatus: row.jobStatus,
        },
        today,
      ),
    )
    .map((row) => ({
      recurringInvoiceId: row.id,
      nextIssueOn: row.nextIssueOn,
    }));
}

export async function enqueueDueRecurring(input: {
  configured: boolean;
  jobs: Array<{ recurringInvoiceId: string; nextIssueOn: string }>;
  add: QueueAddFn;
}): Promise<QueueEnqueueResult> {
  if (!input.configured) {
    return { status: "skipped", reason: "no_key" };
  }
  const ids: string[] = [];
  try {
    for (const job of input.jobs) {
      const jobId = queueJobId(job.recurringInvoiceId, job.nextIssueOn);
      const id = await input.add({
        name: ISSUE_RECURRING_JOB,
        data: { recurringInvoiceId: job.recurringInvoiceId },
        jobId,
      });
      ids.push(id);
    }
  } catch (error) {
    return { status: "error", message: redactQueueError(error) };
  }
  return { status: "queued", ids };
}

export function queueSkipReason(input: {
  configured: boolean;
  due: boolean;
  found: boolean;
}): QueueSkipReason | null {
  if (!input.configured) {
    return "no_key";
  }
  if (!input.found) {
    return "missing";
  }
  if (!input.due) {
    return "not_due";
  }
  return null;
}

export function describeQueueSkip(reason: QueueSkipReason): string {
  if (reason === "no_key") {
    return "The queue is off until REDIS_URL is set on this deploy. Leave it unset on a public no-login site. Issue due invoice still works as a click.";
  }
  if (reason === "missing") {
    return "Recurring invoice not found.";
  }
  return "Only an active due template is queued. Paused, cancelled, and future dates are skipped. Issue is one period at a time.";
}

export function queueRejectStatus(reason: QueueSkipReason | "missing"): 404 | 409 {
  return reason === "missing" ? 404 : 409;
}

export function redactQueueError(error: unknown): string {
  const raw = error instanceof Error ? error.message : "Redis is not reachable.";
  return raw
    .replace(/rediss?:\/\/[^\s]+/gi, "redis://***")
    .replace(/(password|pwd)=([^\s&]+)/gi, "$1=***")
    .slice(0, 200);
}
