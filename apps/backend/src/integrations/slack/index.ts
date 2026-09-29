import { config } from '../../config';
import { prisma } from '../../db/prisma';
import { logger } from '../../utils/logger';

/**
 * Get Slack OAuth authorization URL.
 * Includes the user ID in the state parameter for association after callback.
 */
export function getSlackAuthUrl(userId: string, scope?: string): string {
  const scopes = scope || process.env.SLACK_SCOPES || 'incoming-webhook,chat:write';
  const params = new URLSearchParams({
    client_id: config.slack.clientId,
    scope: scopes,
    redirect_uri: config.slack.redirectUri,
    state: userId,
  });

  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

/**
 * Exchange Slack OAuth code for access token and store the connection.
 */
export async function handleSlackCallback(
  code: string,
  userId: string,
): Promise<{ teamName: string }> {
  const response = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.slack.clientId,
      client_secret: config.slack.clientSecret,
      code,
      redirect_uri: config.slack.redirectUri,
    }),
  });

  const data = await response.json() as any;

  if (!data.ok) {
    logger.error({ error: data.error }, 'Slack OAuth failed');
    throw new Error(`Slack OAuth failed: ${data.error}`);
  }

  const { team, access_token, incoming_webhook } = data;

  // Upsert Slack connection
  await prisma.slackConnection.upsert({
    where: { userId },
    update: {
      teamId: team.id,
      teamName: team.name,
      accessToken: access_token,
      webhookUrl: incoming_webhook?.url || null,
      channelId: incoming_webhook?.channel_id || null,
    },
    create: {
      userId,
      teamId: team.id,
      teamName: team.name,
      accessToken: access_token,
      webhookUrl: incoming_webhook?.url || null,
      channelId: incoming_webhook?.channel_id || null,
    },
  });

  logger.info({ userId, teamName: team.name }, 'Slack connected');
  return { teamName: team.name };
}

/**
 * Send a Slack notification for a rate limit event.
 * Fails silently if Slack is not connected.
 */
export async function sendRateLimitNotification(
  userId: string,
  senderEmail: string,
  hourlyLimit: number,
  rescheduledCount: number,
): Promise<void> {
  try {
    const connection = await prisma.slackConnection.findUnique({
      where: { userId },
    });

    if (!connection) {
      logger.debug({ userId }, 'No Slack connection, skipping rate limit notification');
      return;
    }

    const message = {
      text: `⚠️ *ReachInbox Email Scheduler: Rate Limit Reached*\n\nSender \`${senderEmail}\` reached its hourly limit of *${hourlyLimit}* emails.\n\n${rescheduledCount} queued email(s) have been rescheduled to the next available window.\n\n_${new Date().toUTCString()}_`,
    };

    // Try webhook first, fall back to chat.postMessage
    if (connection.webhookUrl) {
      const response = await fetch(connection.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        throw new Error(`Webhook failed: ${response.statusText}`);
      }
    } else {
      // Use chat.postMessage API
      const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${connection.accessToken}`,
        },
        body: JSON.stringify({
          channel: connection.channelId || '#general',
          ...message,
        }),
      });

      const result = await response.json() as any;
      if (!result.ok) {
        throw new Error(`Slack API error: ${result.error}`);
      }
    }

    logger.info(
      { userId, senderEmail, hourlyLimit, rescheduledCount },
      'Slack rate limit notification sent',
    );
  } catch (err) {
    // Non-fatal: Slack notification failure should never crash the scheduler
    logger.error({ err, userId, senderEmail }, 'Failed to send Slack notification');
  }
}

/**
 * Get Slack connection status for a user.
 */
export async function getSlackStatus(userId: string): Promise<{
  connected: boolean;
  teamName?: string;
}> {
  const connection = await prisma.slackConnection.findUnique({
    where: { userId },
    select: { teamName: true },
  });

  return {
    connected: !!connection,
    teamName: connection?.teamName,
  };
}

/**
 * Disconnect Slack for a user.
 */
export async function disconnectSlack(userId: string): Promise<void> {
  await prisma.slackConnection.delete({
    where: { userId },
  }).catch(() => {
    // Already disconnected
  });

  logger.info({ userId }, 'Slack disconnected');
}
