import dotenv from 'dotenv';
import path from 'path';

// Load .env from backend root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),

  database: {
    url: process.env.DATABASE_URL!,
    directUrl: process.env.DIRECT_URL,
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  elasticsearch: {
    url: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    callbackUrl: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:4000/auth/google/callback',
  },

  session: {
    secret: process.env.SESSION_SECRET || 'change-me-in-production',
  },

  ethereal: {
    host: process.env.ETHEREAL_HOST || 'smtp.ethereal.email',
    port: parseInt(process.env.ETHEREAL_PORT || '587', 10),
    user: process.env.ETHEREAL_USER!,
    password: process.env.ETHEREAL_PASSWORD!,
  },

  slack: {
    clientId: process.env.SLACK_CLIENT_ID!,
    clientSecret: process.env.SLACK_CLIENT_SECRET!,
    redirectUri: process.env.SLACK_REDIRECT_URI || 'http://localhost:4000/api/slack/callback',
  },

  worker: {
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || '10', 10),
    minEmailDelayMs: parseInt(process.env.MIN_EMAIL_DELAY_MS || '2000', 10),
    maxEmailsPerHourPerSender: parseInt(process.env.MAX_EMAILS_PER_HOUR_PER_SENDER || '100', 10),
  },

  frontend: {
    url: process.env.FRONTEND_URL || 'http://localhost:3000',
  },
} as const;

// Validate required env vars at startup
export function validateConfig(): void {
  const required = [
    'DATABASE_URL',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'ETHEREAL_USER',
    'ETHEREAL_PASSWORD',
    'SESSION_SECRET',
  ];

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
