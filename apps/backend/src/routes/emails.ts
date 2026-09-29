import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import {
  scheduleEmails,
  getScheduledEmails,
  getSentEmails,
  getUserSenders,
  createSender,
} from '../services/emailService';
import { searchEmails } from '../integrations/elasticsearch';
import { getSenderHourlyCount } from '../services/rateLimiter';
import { logger } from '../utils/logger';

const router = Router();

// Validation schemas
const scheduleEmailSchema = z.object({
  senderId: z.string().min(1, 'Sender is required'),
  subject: z.string().min(1, 'Subject is required').max(500, 'Subject too long'),
  body: z.string().min(1, 'Body is required'),
  recipients: z
    .array(z.string().email('Invalid email address'))
    .min(1, 'At least one recipient is required')
    .max(10000, 'Too many recipients'),
  startTime: z.string().refine((val) => {
    const date = new Date(val);
    return !isNaN(date.getTime());
  }, 'Invalid start time'),
  delayMs: z.number().int().min(500).max(60000).default(2000),
  hourlyLimit: z.number().int().min(1).max(10000).default(100),
});

const createSenderSchema = z.object({
  email: z.string().email('Invalid email address'),
  smtpHost: z.string().min(1, 'SMTP host is required'),
  smtpPort: z.number().int().min(1).max(65535),
  smtpUser: z.string().min(1, 'SMTP user is required'),
  smtpPassword: z.string().min(1, 'SMTP password is required'),
});

// POST /api/emails/schedule - Schedule emails for a campaign
router.post(
  '/schedule',
  requireAuth,
  validateBody(scheduleEmailSchema),
  async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const { senderId, subject, body, recipients, startTime, delayMs, hourlyLimit } = req.body;

      // Remove duplicate recipients
      const uniqueRecipients = [...new Set(recipients as string[])];

      const result = await scheduleEmails({
        userId: user.id,
        senderId,
        subject,
        body,
        recipients: uniqueRecipients,
        startTime: new Date(startTime),
        delayMs,
        hourlyLimit,
      });

      res.status(201).json({
        message: 'Emails scheduled successfully',
        ...result,
      });
    } catch (err) {
      logger.error({ err }, 'Failed to schedule emails');
      const message = err instanceof Error ? err.message : 'Failed to schedule emails';
      res.status(400).json({ error: message });
    }
  },
);

// GET /api/emails/scheduled - Get scheduled emails
router.get('/scheduled', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);

    const result = await getScheduledEmails(user.id, page, limit);
    res.json(result);
  } catch (err) {
    logger.error({ err }, 'Failed to get scheduled emails');
    res.status(500).json({ error: 'Failed to get scheduled emails' });
  }
});

// GET /api/emails/sent - Get sent emails
router.get('/sent', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);

    const result = await getSentEmails(user.id, page, limit);
    res.json(result);
  } catch (err) {
    logger.error({ err }, 'Failed to get sent emails');
    res.status(500).json({ error: 'Failed to get sent emails' });
  }
});

// GET /api/emails/search - Search emails via Elasticsearch
router.get('/search', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const query = req.query.q as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);

    if (!query || query.trim().length === 0) {
      res.status(400).json({ error: 'Search query is required' });
      return;
    }

    const result = await searchEmails(user.id, query.trim(), page, limit);
    res.json({
      data: result.results,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
    });
  } catch (err) {
    logger.error({ err }, 'Search failed');
    res.status(500).json({ error: 'Search failed' });
  }
});

// GET /api/senders - Get user's senders
router.get('/senders', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const senders = await getUserSenders(user.id);

    // Enrich with current hourly count
    const enrichedSenders = await Promise.all(
      senders.map(async (sender) => {
        const hourlyCount = await getSenderHourlyCount(sender.id);
        return { ...sender, hourlyCount };
      }),
    );

    res.json({ data: enrichedSenders });
  } catch (err) {
    logger.error({ err }, 'Failed to get senders');
    res.status(500).json({ error: 'Failed to get senders' });
  }
});

// POST /api/senders - Create a new sender
router.post(
  '/senders',
  requireAuth,
  validateBody(createSenderSchema),
  async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const sender = await createSender(user.id, req.body);
      res.status(201).json(sender);
    } catch (err) {
      logger.error({ err }, 'Failed to create sender');
      const message = err instanceof Error ? err.message : 'Failed to create sender';
      res.status(400).json({ error: message });
    }
  },
);

export default router;
