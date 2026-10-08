import type { VoiceOverResult } from '../../entities/VoiceOver.js';
import { childLogger } from '../../utils/logger.js';
import type { IVoiceProvider, VoiceSynthesisOptions } from '../interfaces/IVoiceProvider.js';

const log = childLogger('fallback-voice');

/**
 * Tries an ordered list of voices and uses the first one that succeeds.
 *
 * Narration is the one step a Reel cannot ship without, and cloud TTS fails in
 * ways no retry loop fixes: on Oct 8 every Gemini 3.x TTS model returned 503
 * for hours while gemini-2.5-flash-preview-tts kept answering. Ending the
 * chain with the offline espeak-ng voice means a Reel always gets narration —
 * robotic on a bad day, but published rather than lost.
 *
 * Unlike FallbackLlmProvider this falls back on *any* error and is not sticky.
 * Each voice failure (overload, quota, empty audio, timeout) is specific to
 * that model, so the next voice is worth trying; and there is only one
 * synthesis per Reel, so there is no per-call quota to protect by staying on a
 * fallback — every run starts again from the best-sounding voice.
 */
export class FallbackVoiceProvider implements IVoiceProvider {
  constructor(private readonly providers: readonly IVoiceProvider[]) {
    if (providers.length === 0) {
      throw new Error('FallbackVoiceProvider requires at least one voice');
    }
  }

  get name(): string {
    return this.providers.map((provider) => provider.name).join(' > ');
  }

  async synthesize(text: string, options: VoiceSynthesisOptions): Promise<VoiceOverResult> {
    const failures: string[] = [];

    for (const [index, provider] of this.providers.entries()) {
      try {
        const result = await provider.synthesize(text, options);
        if (index > 0) {
          log.warn(
            { voice: provider.name, failedVoices: failures },
            'narrated with a fallback voice because the preferred voice(s) failed',
          );
        }
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${provider.name}: ${message}`);
        log.warn(
          { voice: provider.name, nextVoice: this.providers[index + 1]?.name, error: message },
          'voice failed; trying the next one',
        );
      }
    }

    throw new Error(`Every voice failed. ${failures.join(' | ')}`);
  }
}
