import { contentDefaults } from '../src/config/env.js';
import { prisma } from '../src/db/prisma.js';
import { PrismaSettingsRepository } from '../src/repositories/prisma/PrismaSettingsRepository.js';

/**
 * Standalone seed entry point (`npm run prisma:seed`): upserts the default
 * Setting row from the current .env content configuration without booting
 * the full server/scheduler. `container.bootstrap()` does the same thing on
 * every normal startup, so this is only needed for manual/CI seeding.
 */
async function main(): Promise<void> {
  const settingsRepository = new PrismaSettingsRepository(prisma);
  const setting = await settingsRepository.upsertFromEnvDefaults({
    key: 'default',
    niche: contentDefaults.niche,
    language: contentDefaults.language,
    postingFrequency: contentDefaults.postingFrequency,
    videoDurationSeconds: contentDefaults.videoDurationSeconds,
    writingStyle: contentDefaults.writingStyle,
    cronExpression: contentDefaults.cronExpression,
    timezone: contentDefaults.timezone,
    isActive: true,
    envPrefix: null,
    audienceLevel: contentDefaults.audienceLevel,
    qualityThreshold: contentDefaults.qualityThreshold,
    qualityMaxRetries: contentDefaults.qualityMaxRetries,
    captionStylePreset: contentDefaults.captionStylePreset,
    voiceSpeed: contentDefaults.voiceSpeed,
    voiceStyle: contentDefaults.voiceStyle,
  });

  // eslint-disable-next-line no-console -- seed scripts report to stdout, not through pino
  console.log(`Seeded setting "${setting.key}" (${setting.id}) for niche "${setting.niche}"`);
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console -- seed scripts report to stdout, not through pino
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
