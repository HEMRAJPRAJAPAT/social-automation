import cron, { type ScheduledTask } from 'node-cron';

import type { ContentSettings } from '../entities/ContentSettings.js';
import type { PipelineOrchestrator } from '../pipeline/PipelineOrchestrator.js';
import { childLogger } from '../utils/logger.js';

const log = childLogger('scheduler');

/**
 * Wraps node-cron to run the pipeline once per Setting on its own schedule
 * (spec §1, plus the bonus "support multiple niches/accounts" — each
 * Setting carries its own cron expression and timezone).
 */
export class DailyReelScheduler {
  private readonly tasks: ScheduledTask[] = [];

  constructor(private readonly orchestrator: PipelineOrchestrator) {}

  start(settingsList: ContentSettings[]): void {
    for (const settings of settingsList) {
      if (!cron.validate(settings.cronExpression)) {
        log.error(
          { settingId: settings.id, cron: settings.cronExpression },
          'invalid cron expression, skipping schedule for this setting',
        );
        continue;
      }

      const task = cron.schedule(
        settings.cronExpression,
        () => {
          void this.runOnce(settings);
        },
        { timezone: settings.timezone },
      );
      this.tasks.push(task);

      log.info(
        {
          settingId: settings.id,
          niche: settings.niche,
          cron: settings.cronExpression,
          timezone: settings.timezone,
        },
        'scheduled daily Reel job',
      );
    }
  }

  async runOnce(settings: ContentSettings): Promise<void> {
    log.info({ settingId: settings.id, niche: settings.niche }, 'triggering daily Reel pipeline');
    const summary = await this.orchestrator.runForSetting(settings);
    log.info({ settingId: settings.id, summary }, 'daily Reel pipeline run finished');
  }

  stop(): void {
    for (const task of this.tasks) task.stop();
    this.tasks.length = 0;
  }
}
