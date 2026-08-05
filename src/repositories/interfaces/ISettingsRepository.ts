import type { ContentSettings } from '../../entities/ContentSettings.js';

export interface ISettingsRepository {
  findActive(): Promise<ContentSettings[]>;
  findByKey(key: string): Promise<ContentSettings | null>;
  upsertFromEnvDefaults(defaults: Omit<ContentSettings, 'id'>): Promise<ContentSettings>;
}
