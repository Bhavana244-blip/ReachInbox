import { Queue } from 'bullmq';
import { getRedisConnection } from '../db/redis';
import { logger } from '../utils/logger';

export const EMAIL_QUEUE_NAME = 'email-sending';

let emailQueue: Queue | null = null;

export interface EmailJobData {
  emailId: string;
}

export function getEmailQueue(): Queue {
  if (!emailQueue) {
    emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: {
          age: 24 * 3600, // Keep completed jobs for 24h
          count: 1000,
        },
        removeOnFail: {
          age: 7 * 24 * 3600, // Keep failed jobs for 7 days
        },
      },
    });

    logger.info('Email queue initialized');
  }

  return emailQueue;
}

/**
 * Add a delayed email job to the queue.
 * Uses the emailId as the job ID for deterministic deduplication.
 */
export async function addEmailJob(
  emailId: string,
  delay: number,
): Promise<void> {
  const queue = getEmailQueue();

  await queue.add(
    'send-email',
    { emailId },
    {
      jobId: `email-${emailId}`,
      delay: Math.max(0, delay),
    },
  );

  logger.debug({ emailId, delay }, 'Email job added to queue');
}

/**
 * Reschedule an email job with a new delay.
 * Removes the old job and creates a new one.
 */
export async function rescheduleEmailJob(
  emailId: string,
  newDelay: number,
): Promise<void> {
  const queue = getEmailQueue();

  // Remove existing job if present
  const existingJob = await queue.getJob(`email-${emailId}`);
  if (existingJob) {
    try {
      await existingJob.remove();
    } catch (err) {
      // Job may be active; log but continue
      logger.warn({ emailId, err }, 'Could not remove existing job for rescheduling');
    }
  }

  // Add with new delay
  await queue.add(
    'send-email',
    { emailId },
    {
      jobId: `email-${emailId}-${Date.now()}`,
      delay: Math.max(0, newDelay),
    },
  );

  logger.info({ emailId, newDelay }, 'Email job rescheduled');
}

export async function closeEmailQueue(): Promise<void> {
  if (emailQueue) {
    await emailQueue.close();
    emailQueue = null;
    logger.info('Email queue closed');
  }
}
