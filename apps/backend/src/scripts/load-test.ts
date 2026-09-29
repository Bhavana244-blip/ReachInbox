import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { prisma } from '../db/prisma';
import { getRedisConnection } from '../db/redis';
import { getEmailQueue, addEmailJob } from '../queues/emailQueue';
import { logger } from '../utils/logger';
import crypto from 'crypto';

/**
 * Load Test Script
 * 
 * Generates a configurable number of test email jobs to demonstrate
 * queue behavior under load. Uses existing campaigns and senders.
 * 
 * Usage: npx tsx src/scripts/load-test.ts [emailCount] [senderId] [userId]
 */
async function loadTest() {
  const emailCount = parseInt(process.argv[2] || '100', 10);
  const senderId = process.argv[3];
  const userId = process.argv[4];

  if (!senderId || !userId) {
    console.log('Usage: npx tsx src/scripts/load-test.ts <emailCount> <senderId> <userId>');
    console.log('Example: npx tsx src/scripts/load-test.ts 100 clxyz... clxyz...');
    
    // List existing users and senders
    const users = await prisma.user.findMany({ select: { id: true, email: true } });
    const senders = await prisma.sender.findMany({ select: { id: true, email: true, userId: true } });
    
    console.log('\nExisting users:', users);
    console.log('Existing senders:', senders);
    
    await prisma.$disconnect();
    process.exit(1);
  }

  logger.info({ emailCount, senderId, userId }, 'Starting load test');

  // Create a test campaign
  const campaign = await prisma.campaign.create({
    data: {
      userId,
      subject: `Load Test - ${emailCount} emails`,
      body: '<p>This is a load test email.</p>',
      startTime: new Date(),
      delayMs: 2000,
      hourlyLimit: 100,
      totalEmails: emailCount,
    },
  });

  logger.info({ campaignId: campaign.id }, 'Created test campaign');

  // Create email records and queue jobs
  const now = Date.now();
  let created = 0;

  for (let i = 0; i < emailCount; i++) {
    const recipient = `loadtest-${i}@example.com`;
    const idempotencyKey = crypto
      .createHash('sha256')
      .update(`${campaign.id}:${recipient}`)
      .digest('hex')
      .slice(0, 32);

    const scheduledAt = new Date(now + i * 2000); // 2s spacing

    const email = await prisma.email.create({
      data: {
        campaignId: campaign.id,
        userId,
        senderId,
        recipient,
        subject: campaign.subject,
        body: campaign.body,
        scheduledAt,
        status: 'SCHEDULED',
        idempotencyKey,
      },
    });

    await addEmailJob(email.id, Math.max(0, scheduledAt.getTime() - Date.now()));

    await prisma.email.update({
      where: { id: email.id },
      data: { bullJobId: `email-${email.id}` },
    });

    created++;
    if (created % 50 === 0) {
      logger.info({ created, total: emailCount }, 'Progress...');
    }
  }

  logger.info(
    {
      campaignId: campaign.id,
      totalCreated: created,
      firstScheduledAt: new Date(now).toISOString(),
      lastScheduledAt: new Date(now + (emailCount - 1) * 2000).toISOString(),
    },
    'Load test complete',
  );

  // Show queue stats
  const queue = getEmailQueue();
  const counts = await queue.getJobCounts();
  logger.info({ queueCounts: counts }, 'Queue statistics');

  await prisma.$disconnect();
  const redis = getRedisConnection();
  await redis.quit();
  process.exit(0);
}

loadTest().catch((err) => {
  logger.error({ err }, 'Load test failed');
  process.exit(1);
});
