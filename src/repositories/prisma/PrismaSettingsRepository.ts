import type { PrismaClient, Setting } from '@prisma/client';

import type { ContentSettings } from '../../entities/ContentSettings.js';
import type { ISettingsRepository } from '../interfaces/ISettingsRepository.js';

function toDomain(row: Setting): ContentSettings {
  return {
    id: row.id,
    key: row.key,
    niche: row.niche,
    language: row.language,
    postingFrequency: row.postingFrequency,
    videoDurationSeconds: row.videoDurationSeconds,
    writingStyle: row.writingStyle,
    cronExpression: row.cronExpression,
    timezone: row.timezone,
    isActive: row.isActive,
    envPrefix: row.envPrefix,
    audienceLevel: row.audienceLevel as ContentSettings['audienceLevel'],
    qualityThreshold: row.qualityThreshold,
    qualityMaxRetries: row.qualityMaxRetries,
    captionStylePreset: row.captionStylePreset,
    voiceSpeed: row.voiceSpeed as ContentSettings['voiceSpeed'],
    voiceStyle: row.voiceStyle,
  };
}

export class PrismaSettingsRepository implements ISettingsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findActive(): Promise<ContentSettings[]> {
    const rows = await this.prisma.setting.findMany({ where: { isActive: true } });
    return rows.map(toDomain);
  }

  async findByKey(key: string): Promise<ContentSettings | null> {
    const row = await this.prisma.setting.findUnique({ where: { key } });
    return row ? toDomain(row) : null;
  }

  async upsertFromEnvDefaults(defaults: Omit<ContentSettings, 'id'>): Promise<ContentSettings> {
    const row = await this.prisma.setting.upsert({
      where: { key: defaults.key },
      create: {
        key: defaults.key,
        niche: defaults.niche,
        language: defaults.language,
        postingFrequency: defaults.postingFrequency,
        videoDurationSeconds: defaults.videoDurationSeconds,
        writingStyle: defaults.writingStyle,
        cronExpression: defaults.cronExpression,
        timezone: defaults.timezone,
        isActive: defaults.isActive,
        envPrefix: defaults.envPrefix,
        audienceLevel: defaults.audienceLevel,
        qualityThreshold: defaults.qualityThreshold,
        qualityMaxRetries: defaults.qualityMaxRetries,
        captionStylePreset: defaults.captionStylePreset,
        voiceSpeed: defaults.voiceSpeed,
        voiceStyle: defaults.voiceStyle,
      },
      update: {
        niche: defaults.niche,
        language: defaults.language,
        postingFrequency: defaults.postingFrequency,
        videoDurationSeconds: defaults.videoDurationSeconds,
        writingStyle: defaults.writingStyle,
        cronExpression: defaults.cronExpression,
        timezone: defaults.timezone,
        audienceLevel: defaults.audienceLevel,
        qualityThreshold: defaults.qualityThreshold,
        qualityMaxRetries: defaults.qualityMaxRetries,
        captionStylePreset: defaults.captionStylePreset,
        voiceSpeed: defaults.voiceSpeed,
        voiceStyle: defaults.voiceStyle,
      },
    });
    return toDomain(row);
  }
}
