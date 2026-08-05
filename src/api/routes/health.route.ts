import { Router } from 'express';

import { prisma } from '../../db/prisma.js';

export function healthRouter(): Router {
  const router = Router();

  router.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res
        .status(200)
        .json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
    } catch (error) {
      res.status(503).json({
        status: 'degraded',
        database: 'unreachable',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });
    }
  });

  return router;
}
