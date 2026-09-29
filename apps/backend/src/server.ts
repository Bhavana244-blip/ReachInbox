import dotenv from 'dotenv';
import path from 'path';

// Load .env first
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { createApp } from './app';
import { config, validateConfig } from './config';
import { prisma } from './db/prisma';
import { closeRedis } from './db/redis';
import { initElasticsearchIndex, closeElasticsearch } from './integrations/elasticsearch';
import { closeEmailQueue } from './queues/emailQueue';
import { logger } from './utils/logger';

async function start(): Promise<void> {
  // Validate configuration
  validateConfig();

  // Initialize Elasticsearch index
  await initElasticsearchIndex();

  // Create and start the Express app
  const app = createApp();

  const server = app.listen(config.port, () => {
    logger.info(
      {
        port: config.port,
        env: config.env,
        bullBoard: `http://localhost:${config.port}/admin/queues`,
      },
      'Server started',
    );
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down server...');

    server.close(async () => {
      try {
        await closeEmailQueue();
        await closeRedis();
        await closeElasticsearch();
        await prisma.$disconnect();
        logger.info('Server shut down gracefully');
        process.exit(0);
      } catch (err) {
        logger.error({ err }, 'Error during shutdown');
        process.exit(1);
      }
    });

    // Force exit after 10s
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught errors
  process.on('unhandledRejection', (err) => {
    logger.error({ err }, 'Unhandled rejection');
  });

  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Uncaught exception');
    process.exit(1);
  });
}

start().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
