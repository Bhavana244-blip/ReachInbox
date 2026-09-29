import { EmailStatus } from '@prisma/client';
import { prisma } from '../db/prisma';
import { getEmailQueue, addEmailJob } from '../queues/emailQueue';
import { logger } from '../utils/logger';

/**
 * Startup Reconciliation Service
 * 
 * Handles the case where the server was stopped while emails were in various states.
 * This runs on startup and is designed to be idempotent and safe.
 * 
 * Strategy:
 * 1. Reset PROCESSING emails back to SCHEDULED (server crashed mid-send)
 * 2. Check for SCHEDULED emails that don't have corresponding BullMQ jobs
 * 3. Re-add missing BullMQ jobs for any orphaned SCHEDULED emails
 * 
 * This is safe because:
 * - BullMQ job IDs are deterministic (based on emailId)
 * - Adding a job with an existing ID is idempotent (BullMQ ignores duplicates)
 * - We only reconcile emails that need it, not ALL emails
 */
export async function runStartupReconciliation(): Promise<void> {
  logger.info('Starting startup reconciliation...');

  try {
    // Step 1: Reset any PROCESSING emails back to SCHEDULED
    // These were being processed when the server crashed
    const processingReset = await prisma.email.updateMany({
      where: { status: EmailStatus.PROCESSING },
      data: {
        status: EmailStatus.SCHEDULED,
        attempts: { increment: 0 }, // Keep current attempt count
      },
    });

    if (processingReset.count > 0) {
      logger.warn(
        { count: processingReset.count },
        'Reset PROCESSING emails to SCHEDULED after restart',
      );
    }

    // Step 2: Reset RATE_LIMITED emails back to SCHEDULED
    const rateLimitedReset = await prisma.email.updateMany({
      where: { status: EmailStatus.RATE_LIMITED },
      data: { status: EmailStatus.SCHEDULED },
    });

    if (rateLimitedReset.count > 0) {
      logger.info(
        { count: rateLimitedReset.count },
        'Reset RATE_LIMITED emails to SCHEDULED',
      );
    }

    // Step 3: Find all SCHEDULED emails and verify they have BullMQ jobs
    const scheduledEmails = await prisma.email.findMany({
      where: {
        status: EmailStatus.SCHEDULED,
      },
      select: {
        id: true,
        scheduledAt: true,
        bullJobId: true,
      },
    });

    if (scheduledEmails.length === 0) {
      logger.info('No scheduled emails to reconcile');
      return;
    }

    const queue = getEmailQueue();
    let reconciled = 0;

    for (const email of scheduledEmails) {
      // Check if BullMQ job exists
      const jobId = `email-${email.id}`;
      const existingJob = await queue.getJob(jobId);

      if (!existingJob) {
        // Job is missing from Redis - re-add it
        const now = Date.now();
        const delay = Math.max(0, email.scheduledAt.getTime() - now);

        await addEmailJob(email.id, delay);

        // Update bullJobId reference
        await prisma.email.update({
          where: { id: email.id },
          data: { bullJobId: jobId },
        });

        reconciled++;
        logger.debug(
          { emailId: email.id, delay, scheduledAt: email.scheduledAt },
          'Reconciled missing BullMQ job',
        );
      }
    }

    if (reconciled > 0) {
      logger.info(
        { totalScheduled: scheduledEmails.length, reconciled },
        'Startup reconciliation completed with re-created jobs',
      );
    } else {
      logger.info(
        { totalScheduled: scheduledEmails.length },
        'Startup reconciliation completed, all jobs intact',
      );
    }
  } catch (err) {
    logger.error({ err }, 'Startup reconciliation failed');
    // Non-fatal: the worker will still process jobs that exist in Redis
    // Emails without Redis jobs will need manual intervention
  }
}
