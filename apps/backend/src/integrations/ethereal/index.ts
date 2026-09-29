import nodemailer from 'nodemailer';
import { config } from '../../config';
import { logger } from '../../utils/logger';

export interface SendEmailOptions {
  from: string;
  to: string;
  subject: string;
  html: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
}

export interface SendEmailResult {
  messageId: string;
  previewUrl: string | false;
}

/**
 * Create a nodemailer transporter.
 * Uses sender-specific SMTP if provided, otherwise falls back to Ethereal defaults.
 */
function createTransporter(options?: {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
}) {
  const host = options?.host || config.ethereal.host;
  const port = options?.port || config.ethereal.port;
  const user = options?.user || config.ethereal.user;
  const password = options?.password || config.ethereal.password;

  return nodemailer.createTransport({
    host,
    port,
    secure: false,
    auth: {
      user,
      pass: password,
    },
  });
}

/**
 * Send an email via SMTP (Ethereal by default).
 * Returns the message ID and Ethereal preview URL.
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const transporter = createTransporter({
    host: options.smtpHost,
    port: options.smtpPort,
    user: options.smtpUser,
    password: options.smtpPassword,
  });

  const info = await transporter.sendMail({
    from: options.from,
    to: options.to,
    subject: options.subject,
    html: options.html,
  });

  const previewUrl = nodemailer.getTestMessageUrl(info);

  logger.info(
    {
      messageId: info.messageId,
      from: options.from,
      to: options.to,
      previewUrl,
    },
    'Email sent via Ethereal',
  );

  return {
    messageId: info.messageId,
    previewUrl,
  };
}
