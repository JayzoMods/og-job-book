import { Queue, UnrecoverableError, Worker } from "bullmq";
import { Redis } from "ioredis";
import {
  ISSUE_RECURRING_JOB,
  QUEUE_NAME,
  bullmqConnection,
  parseIssueRecurringJob,
  parseRedisUrl,
  queueConfigured,
  queueJobId,
  redactQueueError,
  type IssueRecurringJob,
  type RedisConnection,
} from "@/lib/ledger/queue";

function redisClient(parsed: RedisConnection): Redis {
  return new Redis(bullmqConnection(parsed));
}

export async function enqueueIssueRecurringJobs(
  jobs: Array<{ recurringInvoiceId: string; nextIssueOn: string }>,
  env: Record<string, string | undefined> = process.env,
): Promise<{ ids: string[] }> {
  const parsed = parseRedisUrl(env.REDIS_URL);
  if (!parsed) {
    throw new Error("REDIS_URL is not set.");
  }
  const connection = redisClient(parsed);
  const queue = new Queue<IssueRecurringJob>(QUEUE_NAME, { connection });
  const ids: string[] = [];
  try {
    for (const job of jobs) {
      const jobId = queueJobId(job.recurringInvoiceId, job.nextIssueOn);
      try {
        const added = await queue.add(
          ISSUE_RECURRING_JOB,
          { recurringInvoiceId: job.recurringInvoiceId },
          {
            jobId,
            removeOnComplete: 100,
            removeOnFail: 50,
          },
        );
        ids.push(added.id ?? jobId);
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (/already exists/i.test(message)) {
          ids.push(jobId);
          continue;
        }
        throw new Error(redactQueueError(error));
      }
    }
    return { ids };
  } finally {
    await queue.close();
    connection.disconnect();
  }
}

export function createIssueRecurringWorker(
  processor: (recurringInvoiceId: string) => Promise<void>,
  env: Record<string, string | undefined> = process.env,
): Worker<IssueRecurringJob> {
  const parsed = parseRedisUrl(env.REDIS_URL);
  if (!parsed || !queueConfigured(env)) {
    throw new Error("REDIS_URL is not set.");
  }
  const connection = redisClient(parsed);
  return new Worker<IssueRecurringJob>(
    QUEUE_NAME,
    async (job) => {
      if (job.name !== ISSUE_RECURRING_JOB) {
        throw new UnrecoverableError(`Unknown job ${job.name}`);
      }
      const payload = parseIssueRecurringJob(job.data);
      if (!payload) {
        throw new UnrecoverableError("Junk issue-recurring payload");
      }
      await processor(payload.recurringInvoiceId);
    },
    { connection },
  );
}
