import type { VoiceOverResult } from '../../entities/VoiceOver.js';

export interface VoiceSynthesisOptions {
  outputPath: string;
  language: string;
}

/** Port for text-to-speech. See ARCHITECTURE.md §8 for why two adapters exist. */
export interface IVoiceProvider {
  readonly name: string;

  synthesize(text: string, options: VoiceSynthesisOptions): Promise<VoiceOverResult>;
}
