import { Router, Request, Response } from 'express';
import { prisma } from '../db/prisma';
import { getRedisConnection } from '../db/redis';
import { getElasticsearchClient } from '../integrations/elasticsearch';
import { logger } from '../utils/logger';

const router = Router();

// GET /health - Health check
router.get('/', async (_req: Request, res: Response) => {
  const services: Record<string, string> = {};

  // Check PostgreSQL
  try {
    await prisma.$queryRaw`SELECT 1`;
    services.database = 'ok';
  } catch {
    services.database = 'error';
  }

  // Check Redis
  try {
    const redis = getRedisConnection();
    await redis.ping();
    services.redis = 'ok';
  } catch {
    services.redis = 'error';
  }

  // Check Elasticsearch
  try {
    const es = getElasticsearchClient();
    await es.cluster.health();
    services.elasticsearch = 'ok';
  } catch {
    services.elasticsearch = 'error';
  }

  const allOk = Object.values(services).every((s) => s === 'ok');

  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    services,
    timestamp: new Date().toISOString(),
  });
});

export default router;
