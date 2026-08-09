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
      },
      update: {
        niche: defaults.niche,
        language: defaults.language,
        postingFrequency: defaults.postingFrequency,
        videoDurationSeconds: defaults.videoDurationSeconds,
        writingStyle: defaults.writingStyle,
        cronExpression: defaults.cronExpression,
        timezone: defaults.timezone,
      },
    });
    return toDomain(row);
  }
}
