import { Worker, Job } from 'bullmq';
import { EmailStatus } from '@prisma/client';
import { config, validateConfig } from './config';
import { prisma } from './db/prisma';
import { createRedisConnection, closeRedis } from './db/redis';
import { EMAIL_QUEUE_NAME, EmailJobData, rescheduleEmailJob } from './queues/emailQueue';
import { sendEmail } from './integrations/ethereal';
import { updateEmailIndex } from './integrations/elasticsearch';
import {
  tryReserveSendSlot,
  checkMinDelay,
  markRateLimitNotified,
  getNextHourWindowStart,
} from './services/rateLimiter';
import { sendRateLimitNotification } from './integrations/slack';
import { runStartupReconciliation } from './services/reconciliation';
import { logger } from './utils/logger';

// Load environment variables
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

/**
 * Email Worker
 * 
 * Processes email jobs from the BullMQ queue.
 * 
 * For each job:
 * 1. Look up the email record in PostgreSQL
 * 2. Verify it hasn't already been sent (idempotency)
 * 3. Atomically claim the email (SCHEDULED → PROCESSING)
 * 4. Check minimum delay between sends (Redis-coordinated)
 * 5. Check hourly rate limit (Redis-backed atomic counter)
 * 6. If rate-limited: reschedule and notify Slack
 * 7. Send via Ethereal SMTP
 * 8. Update status to SENT with Ethereal preview URL
 * 9. Update Elasticsearch index
 */
async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const { emailId } = job.data;
  const jobLogger = logger.child({ emailId, jobId: job.id });

  jobLogger.info('Processing email job');

  // Step 1: Look up the email
  const email = await prisma.email.findUnique({
    where: { id: emailId },
    include: {
      sender: true,
      user: true,
    },
  });

  if (!email) {
    jobLogger.error('Email record not found, skipping');
    return; // Don't retry - record doesn't exist
  }

  // Step 2: Check if already sent or failed (idempotency)
  if (email.status === EmailStatus.SENT) {
    jobLogger.info('Email already sent, skipping');
    return;
  }

  if (email.status === EmailStatus.FAILED && email.attempts >= 3) {
    jobLogger.info('Email permanently failed, skipping');
    return;
  }

  // Step 3: Atomically claim the email (SCHEDULED → PROCESSING)
  // This prevents multiple workers from processing the same email
  const claimed = await prisma.email.updateMany({
    where: {
      id: emailId,
      status: { in: [EmailStatus.SCHEDULED, EmailStatus.RATE_LIMITED] },
    },
    data: {
      status: EmailStatus.PROCESSING,
      attempts: { increment: 1 },
    },
  });

  if (claimed.count === 0) {
    // Another worker already claimed it, or it's in a terminal state
    jobLogger.info({ currentStatus: email.status }, 'Email already claimed or in terminal state');
    return;
  }

  jobLogger.info('Email claimed for processing');

  try {
    // Step 4: Check minimum delay between sends for this sender
    const waitMs = await checkMinDelay(email.senderId);

    if (waitMs > 0) {
      jobLogger.debug({ waitMs }, 'Waiting for minimum delay');
      await sleep(waitMs);
    }

    // Step 5: Check hourly rate limit for this sender
    const rateLimitResult = await tryReserveSendSlot(
      email.senderId,
      config.worker.maxEmailsPerHourPerSender,
    );

    if (!rateLimitResult.allowed) {
      // Rate limited: reschedule to next window
      jobLogger.warn('Sender rate limit reached, rescheduling');

      const nextWindowStart = rateLimitResult.nextWindowStart || getNextHourWindowStart();
      const newDelay = nextWindowStart.getTime() - Date.now();

      // Update email status and scheduled time
      await prisma.email.update({
        where: { id: emailId },
        data: {
          status: EmailStatus.RATE_LIMITED,
          scheduledAt: nextWindowStart,
          attempts: { decrement: 1 }, // Don't count rate limiting as an attempt
        },
      });

      // Reschedule the BullMQ job
      await rescheduleEmailJob(emailId, newDelay);

      // Update Elasticsearch
      updateEmailIndex(emailId, {
        status: EmailStatus.RATE_LIMITED,
        scheduledAt: nextWindowStart.toISOString(),
      }).catch(() => {});

      // Send Slack notification (deduplicated per sender per hour window)
      const shouldNotify = await markRateLimitNotified(email.senderId);
      if (shouldNotify) {
        // Count rescheduled emails for this sender
        const rescheduledCount = await prisma.email.count({
          where: {
            senderId: email.senderId,
            status: EmailStatus.RATE_LIMITED,
          },
        });

        sendRateLimitNotification(
          email.userId,
          email.sender.email,
          config.worker.maxEmailsPerHourPerSender,
          rescheduledCount,
        ).catch((err) => {
          jobLogger.error({ err }, 'Failed to send Slack notification');
        });
      }

      return;
    }

    // Step 6: Send the email via Ethereal SMTP
    jobLogger.info({ to: email.recipient, from: email.sender.email }, 'Sending email');

    const result = await sendEmail({
      from: email.sender.email,
      to: email.recipient,
      subject: email.subject,
      html: email.body,
      smtpHost: email.sender.smtpHost,
      smtpPort: email.sender.smtpPort,
      smtpUser: email.sender.smtpUser,
      smtpPassword: email.sender.smtpPassword,
    });

    // Step 7: Update status to SENT
    await prisma.email.update({
      where: { id: emailId },
      data: {
        status: EmailStatus.SENT,
        sentAt: new Date(),
        etherealMessageId: result.messageId,
        etherealPreviewUrl: result.previewUrl || null,
      },
    });

    // Step 8: Update Elasticsearch
    updateEmailIndex(emailId, {
      status: EmailStatus.SENT,
      sentAt: new Date().toISOString(),
    }).catch(() => {});

    jobLogger.info(
      {
        messageId: result.messageId,
        previewUrl: result.previewUrl,
      },
      'Email sent successfully',
    );
  } catch (err) {
    // Step 9: Handle send failure
    jobLogger.error({ err }, 'Failed to send email');

    const updatedEmail = await prisma.email.findUnique({
      where: { id: emailId },
      select: { attempts: true },
    });

    const attempts = updatedEmail?.attempts || 1;
    const isFinalAttempt = attempts >= 3;

    await prisma.email.update({
      where: { id: emailId },
      data: {
        status: isFinalAttempt ? EmailStatus.FAILED : EmailStatus.SCHEDULED,
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
      },
    });

    // Update Elasticsearch
    updateEmailIndex(emailId, {
      status: isFinalAttempt ? EmailStatus.FAILED : EmailStatus.SCHEDULED,
    }).catch(() => {});

    if (!isFinalAttempt) {
      // Let BullMQ's built-in retry mechanism handle retries
      throw err;
    }
    // If final attempt, don't throw - the email is permanently failed
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Start the email worker.
 */
async function startWorker(): Promise<void> {
  validateConfig();

  logger.info(
    {
      concurrency: config.worker.concurrency,
      minDelayMs: config.worker.minEmailDelayMs,
      maxPerHourPerSender: config.worker.maxEmailsPerHourPerSender,
    },
    'Starting email worker',
  );

  // Run startup reconciliation
  await runStartupReconciliation();

  const connection = createRedisConnection();

  const worker = new Worker<EmailJobData>(
    EMAIL_QUEUE_NAME,
    processEmailJob,
    {
      connection,
      concurrency: config.worker.concurrency,
      // Prevent stale jobs from blocking the queue
      lockDuration: 60000, // 1 minute lock
      stalledInterval: 30000, // Check for stalled jobs every 30s
    },
  );

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'Job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, err: err.message, attempts: job?.attemptsMade },
      'Job failed',
    );
  });

  worker.on('stalled', (jobId) => {
    logger.warn({ jobId }, 'Job stalled');
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Worker error');
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down worker...');

    await worker.close();
    await connection.quit();
    await prisma.$disconnect();
    await closeRedis();

    logger.info('Worker shut down gracefully');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  logger.info('Email worker is running');
}

startWorker().catch((err) => {
  logger.error({ err }, 'Failed to start worker');
  process.exit(1);
});
