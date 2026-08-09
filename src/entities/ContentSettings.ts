import type { AudienceLevel } from './Topic.js';

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
  audienceLevel: AudienceLevel;
  /** Minimum ContentEvaluator overall score (0-10) to accept a script without further retries. */
  qualityThreshold: number;
  /** Max script regeneration attempts if quality is below threshold, before shipping the best attempt. */
  qualityMaxRetries: number;
  /** Which entry in src/ai/captionStyles.ts to burn into the video. */
  captionStylePreset: string;
  voiceSpeed: 'slow' | 'normal' | 'fast';
  /** Free-text delivery hint passed to voice providers that support it (e.g. Gemini TTS). */
  voiceStyle: string | null;
}
