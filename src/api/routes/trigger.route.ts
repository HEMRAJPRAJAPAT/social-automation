import { Router } from 'express';
import { z } from 'zod';

import type { AppContainer } from '../../container.js';
import { childLogger } from '../../utils/logger.js';

const log = childLogger('trigger-route');

const triggerBodySchema = z.object({ settingKey: z.string().optional() });

/** Manual/CI-triggered pipeline run — spec bonus: operational control beyond the daily cron. */
export function triggerRouter(container: AppContainer): Router {
  const router = Router();

  router.post('/trigger', async (req, res) => {
    const { settingKey } = triggerBodySchema.parse(req.body ?? {});

    const settingsList = settingKey
      ? [await container.settingsRepository.findByKey(settingKey)].filter((s) => s !== null)
      : await container.getActiveSettings();

    if (settingsList.length === 0) {
      res.status(404).json({ error: 'No matching active setting found' });
      return;
    }

    const results = [];
    for (const settings of settingsList) {
      log.info({ settingId: settings.id }, 'manually triggering pipeline');
      const summary = await container.pipelineOrchestrator.runForSetting(settings);
      results.push(summary);
    }

    res.status(200).json({ results });
  });

  return router;
}
