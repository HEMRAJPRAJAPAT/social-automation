import type { VoiceOverResult } from '../../entities/VoiceOver.js';

export interface VoiceSynthesisOptions {
  outputPath: string;
  language: string;
  speed?: 'slow' | 'normal' | 'fast';
  /** Free-text delivery hint (e.g. "upbeat and energetic") — supported providers fold this into their prompt/config; others ignore it. */
  style?: string | null;
}

/** Port for text-to-speech. See ARCHITECTURE.md §8 for why two adapters exist. */
export interface IVoiceProvider {
  readonly name: string;

  synthesize(text: string, options: VoiceSynthesisOptions): Promise<VoiceOverResult>;
}
