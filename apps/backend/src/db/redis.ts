import IORedis from 'ioredis';
import { config } from '../config';
import { logger } from '../utils/logger';

let redisConnection: IORedis | null = null;

export function getRedisConnection(): IORedis {
  if (!redisConnection) {
    redisConnection = new IORedis(config.redis.url, {
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: false,
      retryStrategy(times: number) {
        const delay = Math.min(times * 200, 5000);
        logger.warn({ times, delay }, 'Redis reconnecting...');
        return delay;
      },
    });

    redisConnection.on('connect', () => {
      logger.info('Redis connected');
    });

    redisConnection.on('error', (err) => {
      logger.error({ err }, 'Redis connection error');
    });
  }

  return redisConnection;
}

/**
 * Create a duplicate Redis connection for BullMQ workers.
 * BullMQ requires separate connections for the Queue and Worker.
 */
export function createRedisConnection(): IORedis {
  return new IORedis(config.redis.url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times: number) {
      const delay = Math.min(times * 200, 5000);
      return delay;
    },
  });
}

export async function closeRedis(): Promise<void> {
  if (redisConnection) {
    await redisConnection.quit();
    redisConnection = null;
    logger.info('Redis connection closed');
  }
}
