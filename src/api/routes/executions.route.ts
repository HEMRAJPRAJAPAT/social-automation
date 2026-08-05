import { Router } from 'express';

import { prisma } from '../../db/prisma.js';

/** Read-only reporting endpoints backing the "performance dashboard" bonus feature. */
export function executionsRouter(): Router {
  const router = Router();

  router.get('/executions', async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const executions = await prisma.execution.findMany({
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: { steps: true, post: { select: { id: true, status: true, igTitle: true } } },
    });
    res.status(200).json({ executions });
  });

  router.get('/executions/:id', async (req, res) => {
    const execution = await prisma.execution.findUnique({
      where: { id: req.params.id },
      include: { steps: true, post: true },
    });
    if (!execution) {
      res.status(404).json({ error: 'Execution not found' });
      return;
    }
    res.status(200).json({ execution });
  });

  return router;
}
