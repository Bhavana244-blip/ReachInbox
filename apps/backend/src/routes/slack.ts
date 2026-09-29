import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { config } from '../config';
import {
  getSlackAuthUrl,
  handleSlackCallback,
  getSlackStatus,
  disconnectSlack,
  sendRateLimitNotification,
} from '../integrations/slack';
import { prisma } from '../db/prisma';
import { logger } from '../utils/logger';

const router = Router();

// GET /api/slack/connect - Redirect to Slack OAuth
router.get('/connect', requireAuth, (req: Request, res: Response) => {
  const user = req.user as any;
  const scope = (req.query.scope as string) || undefined;
  const authUrl = getSlackAuthUrl(user.id, scope);
  res.json({ url: authUrl });
});

// GET /api/slack/callback - Handle Slack OAuth callback
router.get('/callback', async (req: Request, res: Response) => {
  try {
    const { code, state: userId } = req.query;

    if (!code || !userId) {
      res.redirect(`${config.frontend.url}/dashboard?slack=error&reason=missing_params`);
      return;
    }

    await handleSlackCallback(code as string, userId as string);
    res.redirect(`${config.frontend.url}/dashboard?slack=connected`);
  } catch (err) {
    logger.error({ err }, 'Slack callback error');
    res.redirect(`${config.frontend.url}/dashboard?slack=error`);
  }
});

// GET /api/slack/status - Get Slack connection status
router.get('/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const status = await getSlackStatus(user.id);
    res.json(status);
  } catch (err) {
    logger.error({ err }, 'Failed to get Slack status');
    res.status(500).json({ error: 'Failed to get Slack status' });
  }
});

// POST /api/slack/webhook - Direct webhook setup
router.post('/webhook', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { webhookUrl, channelName } = req.body;

    if (!webhookUrl || !webhookUrl.startsWith('https://hooks.slack.com/')) {
      res.status(400).json({
        error: 'Invalid Slack Webhook URL. It must start with https://hooks.slack.com/',
      });
      return;
    }

    // Test ping to verify webhook works
    const testRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: '✅ *ReachInbox Scheduler*: Slack notifications successfully connected!',
      }),
    });

    if (!testRes.ok) {
      res.status(400).json({ error: 'Failed to send test message to the provided Slack webhook' });
      return;
    }

    await prisma.slackConnection.upsert({
      where: { userId: user.id },
      update: {
        teamId: 'webhook',
        teamName: channelName || 'Custom Slack Webhook',
        accessToken: 'webhook',
        webhookUrl,
        channelId: channelName || null,
      },
      create: {
        userId: user.id,
        teamId: 'webhook',
        teamName: channelName || 'Custom Slack Webhook',
        accessToken: 'webhook',
        webhookUrl,
        channelId: channelName || null,
      },
    });

    res.json({
      message: 'Slack webhook connected and verified successfully',
      teamName: channelName || 'Custom Slack Webhook',
    });
  } catch (err: any) {
    logger.error({ err }, 'Failed to connect Slack webhook');
    res.status(500).json({ error: err.message || 'Failed to connect Slack webhook' });
  }
});

// POST /api/slack/test - Send a test rate limit notification to Slack
router.post('/test', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const connection = await prisma.slackConnection.findUnique({
      where: { userId: user.id },
    });

    if (!connection) {
      res.status(400).json({ error: 'Slack is not connected' });
      return;
    }

    await sendRateLimitNotification(user.id, 'outreach@reachinbox.ai', 100, 3);
    res.json({ message: 'Test notification sent to Slack!' });
  } catch (err: any) {
    logger.error({ err }, 'Failed to send test notification');
    res.status(500).json({ error: err.message || 'Failed to send test notification' });
  }
});

// POST /api/slack/disconnect - Disconnect Slack
router.post('/disconnect', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    await disconnectSlack(user.id);
    res.json({ message: 'Slack disconnected' });
  } catch (err) {
    logger.error({ err }, 'Failed to disconnect Slack');
    res.status(500).json({ error: 'Failed to disconnect Slack' });
  }
});

export default router;
