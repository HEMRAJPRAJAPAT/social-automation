/** Domain shape of a channel/content profile (maps to the `settings` table). */
export interface ContentSettings {
  id: string;
  key: string;
  niche: string;
  language: string;
  postingFrequency: string;
  videoDurationSeconds: number;
  writingStyle: string;
  cronExpression: string;
  timezone: string;
  isActive: boolean;
  envPrefix: string | null;
}
