import { createApp } from './api/app.js';
import { env } from './config/env.js';
import { container } from './container.js';
import { disconnectPrisma } from './db/prisma.js';
import { DailyReelScheduler } from './scheduler/DailyReelScheduler.js';
import { logger } from './utils/logger.js';

async function main(): Promise<void> {
  await container.bootstrap();
  const activeSettings = await container.getActiveSettings();

  if (activeSettings.length === 0) {
    logger.warn(
      'No active content settings found after bootstrap; the scheduler will have nothing to run.',
    );
  }

  const scheduler = new DailyReelScheduler(container.pipelineOrchestrator);
  scheduler.start(activeSettings);

  if (env.RUN_ON_STARTUP) {
    for (const settings of activeSettings) {
      logger.info({ settingId: settings.id }, 'RUN_ON_STARTUP is set, triggering an immediate run');
      void scheduler.runOnce(settings);
    }
  }

  const app = createApp(container);
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'reel-automation server listening');
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down');
    scheduler.stop();
    server.close();
    await disconnectPrisma();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  logger.fatal({ error }, 'fatal error during startup');
  process.exit(1);
});
