import { EmailStatus } from '@prisma/client';
import { prisma } from '../db/prisma';
import { addEmailJob } from '../queues/emailQueue';
import { indexEmail } from '../integrations/elasticsearch';
import { logger } from '../utils/logger';
import crypto from 'crypto';

export interface ScheduleEmailsInput {
  userId: string;
  senderId: string;
  subject: string;
  body: string;
  recipients: string[];
  startTime: Date;
  delayMs: number;
  hourlyLimit: number;
}

export interface ScheduleResult {
  campaignId: string;
  totalEmails: number;
  estimatedCompletionTime: Date;
}

/**
 * Schedule a batch of emails for a campaign.
 * 
 * 1. Validates the sender belongs to the user
 * 2. Creates a campaign record
 * 3. Creates email records with calculated send times
 * 4. Adds BullMQ delayed jobs for each email
 * 5. Indexes emails in Elasticsearch
 * 
 * All database operations are transactional.
 */
export async function scheduleEmails(input: ScheduleEmailsInput): Promise<ScheduleResult> {
  const { userId, senderId, subject, body, recipients, startTime, delayMs, hourlyLimit } = input;

  // Validate sender belongs to user
  const sender = await prisma.sender.findFirst({
    where: { id: senderId, userId },
  });

  if (!sender) {
    throw new Error('Sender not found or does not belong to user');
  }

  // Calculate scheduled times for each email
  // Respects both the delay between emails and the hourly limit
  const emailSchedules = calculateScheduleTimes(
    recipients,
    startTime,
    delayMs,
    hourlyLimit,
  );

  const estimatedCompletionTime = emailSchedules[emailSchedules.length - 1]?.scheduledAt || startTime;

  // Create campaign and emails in a transaction
  const campaign = await prisma.$transaction(async (tx) => {
    // Create campaign
    const campaign = await tx.campaign.create({
      data: {
        userId,
        subject,
        body,
        startTime,
        delayMs,
        hourlyLimit,
        totalEmails: recipients.length,
      },
    });

    // Create email records
    const emailRecords = await Promise.all(
      emailSchedules.map(async (schedule) => {
        const idempotencyKey = generateIdempotencyKey(campaign.id, schedule.recipient);

        return tx.email.create({
          data: {
            campaignId: campaign.id,
            userId,
            senderId,
            recipient: schedule.recipient,
            subject,
            body,
            scheduledAt: schedule.scheduledAt,
            status: EmailStatus.SCHEDULED,
            idempotencyKey,
          },
        });
      }),
    );

    return { ...campaign, emails: emailRecords };
  });

  // Add BullMQ jobs (outside transaction - these are durable in Redis)
  const now = Date.now();
  for (const email of campaign.emails) {
    const delay = Math.max(0, email.scheduledAt.getTime() - now);

    await addEmailJob(email.id, delay);

    // Update the bullJobId reference
    await prisma.email.update({
      where: { id: email.id },
      data: { bullJobId: `email-${email.id}` },
    });
  }

  // Index emails in Elasticsearch (non-blocking, non-fatal)
  for (const email of campaign.emails) {
    indexEmail({
      emailId: email.id,
      userId,
      campaignId: campaign.id,
      senderId,
      recipient: email.recipient,
      senderEmail: sender.email,
      subject,
      body,
      status: email.status,
      scheduledAt: email.scheduledAt.toISOString(),
    }).catch((err) => {
      logger.error({ err, emailId: email.id }, 'Failed to index email');
    });
  }

  logger.info(
    {
      campaignId: campaign.id,
      totalEmails: recipients.length,
      startTime,
      estimatedCompletionTime,
    },
    'Campaign scheduled successfully',
  );

  return {
    campaignId: campaign.id,
    totalEmails: recipients.length,
    estimatedCompletionTime,
  };
}

/**
 * Calculate the scheduled time for each email in the campaign.
 * 
 * Takes into account:
 * - Start time
 * - Minimum delay between emails
 * - Hourly limit per sender
 */
function calculateScheduleTimes(
  recipients: string[],
  startTime: Date,
  delayMs: number,
  hourlyLimit: number,
): Array<{ recipient: string; scheduledAt: Date }> {
  const schedules: Array<{ recipient: string; scheduledAt: Date }> = [];

  let currentTime = startTime.getTime();
  let emailsInCurrentHour = 0;
  let currentHourStart = getHourStart(startTime).getTime();

  for (const recipient of recipients) {
    // Check if we've exceeded the hourly limit
    if (emailsInCurrentHour >= hourlyLimit) {
      // Move to next hour
      currentHourStart += 3600000; // 1 hour in ms
      currentTime = currentHourStart;
      emailsInCurrentHour = 0;
    }

    schedules.push({
      recipient,
      scheduledAt: new Date(currentTime),
    });

    emailsInCurrentHour++;
    currentTime += delayMs;

    // If we've crossed into a new hour with the delay, reset counter
    if (currentTime >= currentHourStart + 3600000) {
      currentHourStart = getHourStart(new Date(currentTime)).getTime();
      emailsInCurrentHour = 0;
    }
  }

  return schedules;
}

/**
 * Get the start of the hour for a given date.
 */
function getHourStart(date: Date): Date {
  const d = new Date(date);
  d.setUTCMinutes(0, 0, 0);
  return d;
}

/**
 * Generate a deterministic idempotency key for an email.
 * Ensures the same campaign+recipient combination cannot be duplicated.
 */
function generateIdempotencyKey(campaignId: string, recipient: string): string {
  return crypto
    .createHash('sha256')
    .update(`${campaignId}:${recipient}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * Get scheduled emails for a user with pagination.
 */
export async function getScheduledEmails(
  userId: string,
  page: number = 1,
  limit: number = 25,
) {
  const skip = (page - 1) * limit;

  const [emails, total] = await Promise.all([
    prisma.email.findMany({
      where: {
        userId,
        status: { in: [EmailStatus.SCHEDULED, EmailStatus.PROCESSING, EmailStatus.RATE_LIMITED] },
      },
      include: {
        sender: { select: { email: true } },
        campaign: { select: { subject: true } },
      },
      orderBy: { scheduledAt: 'asc' },
      skip,
      take: limit,
    }),
    prisma.email.count({
      where: {
        userId,
        status: { in: [EmailStatus.SCHEDULED, EmailStatus.PROCESSING, EmailStatus.RATE_LIMITED] },
      },
    }),
  ]);

  return {
    data: emails,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get sent emails for a user with pagination.
 */
export async function getSentEmails(
  userId: string,
  page: number = 1,
  limit: number = 25,
) {
  const skip = (page - 1) * limit;

  const [emails, total] = await Promise.all([
    prisma.email.findMany({
      where: {
        userId,
        status: { in: [EmailStatus.SENT, EmailStatus.FAILED] },
      },
      include: {
        sender: { select: { email: true } },
        campaign: { select: { subject: true } },
      },
      orderBy: { sentAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.email.count({
      where: {
        userId,
        status: { in: [EmailStatus.SENT, EmailStatus.FAILED] },
      },
    }),
  ]);

  return {
    data: emails,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get senders for a user.
 */
export async function getUserSenders(userId: string) {
  return prisma.sender.findMany({
    where: { userId },
    select: {
      id: true,
      email: true,
      smtpHost: true,
      smtpPort: true,
      createdAt: true,
    },
  });
}

/**
 * Create a new sender for a user.
 */
export async function createSender(
  userId: string,
  data: {
    email: string;
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPassword: string;
  },
) {
  return prisma.sender.upsert({
    where: {
      userId_email: {
        userId,
        email: data.email,
      },
    },
    update: {
      smtpHost: data.smtpHost,
      smtpPort: data.smtpPort,
      smtpUser: data.smtpUser,
      smtpPassword: data.smtpPassword,
    },
    create: {
      userId,
      ...data,
    },
    select: {
      id: true,
      email: true,
      smtpHost: true,
      smtpPort: true,
      createdAt: true,
    },
  });
}
