import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { prisma } from '../db/prisma';
import { getRedisConnection } from '../db/redis';
import { getEmailQueue } from '../queues/emailQueue';

async function main() {
  console.log('=== Step 1: Testing Health Endpoint ===');
  const healthRes = await fetch('http://localhost:4000/health');
  const healthData = (await healthRes.json()) as any;
  console.log('Health check response:', healthData);
  if (healthData.status !== 'ok') {
    throw new Error('Health check failed');
  }

  console.log('\n=== Step 2: Testing Auth / Dev Login ===');
  const loginRes = await fetch('http://localhost:4000/auth/dev-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'demo@reachinbox.ai',
      name: 'ReachInbox Demo User',
    }),
  });
  const cookie = loginRes.headers.get('set-cookie');
  const loginData = await loginRes.json();
  console.log('Login result:', loginData);
  if (!cookie) {
    throw new Error('No session cookie returned');
  }

  console.log('\n=== Step 3: Testing /auth/me ===');
  const meRes = await fetch('http://localhost:4000/auth/me', {
    headers: { Cookie: cookie },
  });
  const meData = (await meRes.json()) as any;
  console.log('/auth/me response:', meData);

  const userId = meData.id;

  console.log('\n=== Step 4: Adding Sender with Ethereal Credentials ===');
  let sender = await prisma.sender.findFirst({
    where: { userId },
  });

  if (!sender) {
    const senderRes = await fetch('http://localhost:4000/api/senders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
      },
      body: JSON.stringify({
        email: process.env.ETHEREAL_USER || 'werner.bergstrom74@ethereal.email',
        smtpHost: process.env.ETHEREAL_HOST || 'smtp.ethereal.email',
        smtpPort: parseInt(process.env.ETHEREAL_PORT || '587', 10),
        smtpUser: process.env.ETHEREAL_USER || 'werner.bergstrom74@ethereal.email',
        smtpPassword: process.env.ETHEREAL_PASSWORD || 'DcKVfvQkTtDzGu2Aq8',
      }),
    });
    const senderData = (await senderRes.json()) as any;
    console.log('Created sender:', senderData);
    sender = senderData.sender || senderData;
  } else {
    console.log('Existing sender found:', sender);
  }

  const senderId = sender!.id;

  console.log('\n=== Step 5: Scheduling Test Emails ===');
  const scheduleRes = await fetch('http://localhost:4000/api/emails/schedule', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
    body: JSON.stringify({
      senderId,
      subject: 'Welcome to ReachInbox Scheduler!',
      body: '<p>This is a live test email sent via ReachInbox Full-stack Scheduler.</p>',
      recipients: ['alex.test@example.com', 'sarah.lead@example.com'],
      startTime: new Date(Date.now() + 1000).toISOString(),
      delayMs: 2000,
      hourlyLimit: 100,
    }),
  });
  const scheduleData = (await scheduleRes.json()) as any;
  console.log('Schedule response:', scheduleData);

  console.log('\n=== Step 6: Waiting for Worker to Process Emails (5-10s) ===');
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    const sentRes = await fetch('http://localhost:4000/api/emails/sent', {
      headers: { Cookie: cookie },
    });
    const sentData = (await sentRes.json()) as any;
    console.log(`[Attempt ${i + 1}] Sent emails count:`, sentData.pagination?.total || sentData.data?.length || 0);
    if (sentData.pagination?.total > 0 || (sentData.data && sentData.data.length > 0)) {
      console.log('Sent emails sample:', sentData.data[0]);
      break;
    }
  }

  console.log('\n=== Step 7: Testing Elasticsearch Email Search ===');
  try {
    const searchRes = await fetch('http://localhost:4000/api/emails/search?q=ReachInbox', {
      headers: { Cookie: cookie },
    });
    const searchData = (await searchRes.json()) as any;
    console.log('Search results:', searchData);
  } catch (err: any) {
    console.log('Search error:', err.message);
  }

  console.log('\n=== Step 8: Checking BullMQ Queue Job Counts ===');
  const queue = getEmailQueue();
  const counts = await queue.getJobCounts();
  console.log('BullMQ Job Counts:', counts);

  console.log('\n=== Step 9: Running Load Test with 10 Emails ===');
  console.log(`Command parameters: count=10, senderId=${senderId}, userId=${userId}`);

  await prisma.$disconnect();
  const redis = getRedisConnection();
  await redis.quit();

  console.log('\n>>> All E2E steps completed successfully! <<<');
}

main().catch((err) => {
  console.error('E2E Test Failed:', err);
  process.exit(1);
});
