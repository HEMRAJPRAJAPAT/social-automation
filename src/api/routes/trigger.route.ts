import { timingSafeEqual } from 'node:crypto';

import { Router } from 'express';
import { z } from 'zod';

import { env } from '../../config/env.js';
import type { AppContainer } from '../../container.js';
import { childLogger } from '../../utils/logger.js';

const log = childLogger('trigger-route');

const triggerBodySchema = z.object({
  settingKey: z.string().optional(),
  // Manual trigger always renders a fresh Reel by default, bypassing the
  // once-per-day dedup the automatic cron relies on. Pass force:false to get
  // the cron's "skip if today's already done" behavior instead.
  force: z.boolean().optional().default(true),
});

function isValidSecret(provided: string | undefined): boolean {
  if (!provided) return false;
  const expected = Buffer.from(env.TRIGGER_SECRET);
  const actual = Buffer.from(provided);
  // Lengths must match before timingSafeEqual (it throws on mismatched
  // buffer lengths), but that length check itself leaks no useful info here.
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Manual/CI-triggered pipeline run — spec bonus: operational control beyond the daily cron. */
export function triggerRouter(container: AppContainer): Router {
  const router = Router();

  router.post('/trigger', async (req, res) => {
    if (!isValidSecret(req.header('x-trigger-secret'))) {
      log.warn({ ip: req.ip }, 'rejected unauthorized /trigger request');
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { settingKey, force } = triggerBodySchema.parse(req.body ?? {});

    const settingsList = settingKey
      ? [await container.settingsRepository.findByKey(settingKey)].filter((s) => s !== null)
      : await container.getActiveSettings();

    if (settingsList.length === 0) {
      res.status(404).json({ error: 'No matching active setting found' });
      return;
    }

    const results = [];
    for (const settings of settingsList) {
      log.info({ settingId: settings.id, force }, 'manually triggering pipeline');
      const summary = await container.pipelineOrchestrator.runForSetting(settings, { force });
      results.push(summary);
    }

    res.status(200).json({ results });
  });

  return router;
}
