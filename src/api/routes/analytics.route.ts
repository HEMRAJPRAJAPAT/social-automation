import { Router } from 'express';

import { prisma } from '../../db/prisma.js';

/** Aggregate metrics backing the "analytics collection" bonus feature. */
export function analyticsRouter(): Router {
  const router = Router();

  router.get('/analytics/summary', async (_req, res) => {
    const sinceDays = 30;
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

    const [postsPublished, postsFailed, topicsByCategory, apiCallsByProvider] = await Promise.all([
      prisma.post.count({ where: { status: 'PUBLISHED', createdAt: { gte: since } } }),
      prisma.post.count({ where: { status: 'FAILED', createdAt: { gte: since } } }),
      prisma.topic.groupBy({
        by: ['category'],
        _count: { _all: true },
        where: { createdAt: { gte: since } },
      }),
      prisma.apiLog.groupBy({
        by: ['provider', 'success'],
        _count: { _all: true },
        where: { createdAt: { gte: since } },
      }),
    ]);

    res.status(200).json({
      windowDays: sinceDays,
      postsPublished,
      postsFailed,
      topicsByCategory: topicsByCategory.map((row) => ({
        category: row.category,
        count: row._count._all,
      })),
      apiCallsByProvider: apiCallsByProvider.map((row) => ({
        provider: row.provider,
        success: row.success,
        count: row._count._all,
      })),
    });
  });

  return router;
}
