import express from 'express';
import session from 'express-session';
import passport from 'passport';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { config } from './config';
import { configureGoogleAuth } from './integrations/google';
import { getEmailQueue, EMAIL_QUEUE_NAME } from './queues/emailQueue';
import authRoutes from './routes/auth';
import emailRoutes from './routes/emails';
import slackRoutes from './routes/slack';
import healthRoutes from './routes/health';
import { errorHandler } from './middleware/auth';
import { logger } from './utils/logger';

export function createApp(): express.Application {
  const app = express();

  // Security middleware
  app.use(
    helmet({
      contentSecurityPolicy: false, // Allow Bull Board
      crossOriginEmbedderPolicy: false,
    }),
  );

  // CORS
  app.use(
    cors({
      origin: config.frontend.url,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Request logging
  app.use(
    morgan('short', {
      stream: {
        write: (message: string) => {
          logger.info(message.trim());
        },
      },
    }),
  );

  // Session
  app.use(
    session({
      secret: config.session.secret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: config.env === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: config.env === 'production' ? 'none' : 'lax',
      },
    }),
  );

  // Passport
  configureGoogleAuth();
  app.use(passport.initialize());
  app.use(passport.session());

  // Bull Board (queue dashboard)
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  createBullBoard({
    queues: [new BullMQAdapter(getEmailQueue()) as any],
    serverAdapter,
  });

  app.use('/admin/queues', serverAdapter.getRouter());

  // Routes
  app.use('/health', healthRoutes);
  app.use('/auth', authRoutes);
  app.use('/api/emails', emailRoutes);
  app.use('/api', emailRoutes); // Also mount senders under /api
  app.use('/api/slack', slackRoutes);

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}
