import { container } from '../container.js';
import { disconnectPrisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';

/** One-shot manual/CI entry point: `npm run run:pipeline`. */
async function main(): Promise<void> {
  await container.bootstrap();
  const activeSettings = await container.getActiveSettings();

  if (activeSettings.length === 0) {
    logger.warn('No active content settings found; nothing to run.');
    return;
  }

  for (const settings of activeSettings) {
    const summary = await container.pipelineOrchestrator.runForSetting(settings);
    logger.info({ settingId: settings.id, summary }, 'pipeline run complete');
  }
}

main()
  .catch((error) => {
    logger.fatal({ error }, 'run-pipeline script failed');
    process.exitCode = 1;
  })
  .finally(() => {
    void disconnectPrisma();
  });
