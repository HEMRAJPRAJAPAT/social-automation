import { describe, expect, it } from 'vitest';

import type { VoiceOverResult } from '../../../src/entities/VoiceOver.js';
import type {
  IVoiceProvider,
  VoiceSynthesisOptions,
} from '../../../src/services/interfaces/IVoiceProvider.js';
import { FallbackVoiceProvider } from '../../../src/services/voice/FallbackVoiceProvider.js';

const options: VoiceSynthesisOptions = { outputPath: '/tmp/voice.wav', language: 'hi' };

/** Records every call so a test can assert a provider was or wasn't reached. */
class StubVoice implements IVoiceProvider {
  public calls = 0;

  constructor(
    public readonly name: string,
    private readonly fail?: Error,
  ) {}

  async synthesize(text: string, opts: VoiceSynthesisOptions): Promise<VoiceOverResult> {
    this.calls += 1;
    if (this.fail) throw this.fail;
    return {
      audioFilePath: opts.outputPath,
      durationSeconds: 30,
      sampleRateHz: 24000,
      provider: this.name,
      text,
    };
  }
}

const overloaded = () => new Error('"gemini-tts:synthesize" failed after 5 attempt(s): 503 UNAVAILABLE');

describe('FallbackVoiceProvider', () => {
  it('uses the first voice when it works', async () => {
    const primary = new StubVoice('gemini-3.1-flash-tts-preview');
    const backup = new StubVoice('espeak-ng');

    const result = await new FallbackVoiceProvider([primary, backup]).synthesize('hi', options);

    expect(result.provider).toBe('gemini-3.1-flash-tts-preview');
    expect(backup.calls).toBe(0);
  });

  it('falls through to the next voice when one is overloaded', async () => {
    // Oct 8: every Gemini 3.x TTS model returned 503 while 2.5 still answered.
    const primary = new StubVoice('gemini-3.1-flash-tts-preview', overloaded());
    const backup = new StubVoice('gemini-2.5-flash-preview-tts');

    const result = await new FallbackVoiceProvider([primary, backup]).synthesize('hi', options);

    expect(result.provider).toBe('gemini-2.5-flash-preview-tts');
  });

  it('reaches the offline voice when every cloud voice fails, so the Reel still ships', async () => {
    const providers = [
      new StubVoice('gemini-3.1-flash-tts-preview', overloaded()),
      new StubVoice('gemini-2.5-flash-preview-tts', new Error('429 RESOURCE_EXHAUSTED')),
      new StubVoice('espeak-ng'),
    ];

    const result = await new FallbackVoiceProvider(providers).synthesize('hi', options);

    expect(result.provider).toBe('espeak-ng');
  });

  it('starts from the best voice on every run rather than staying on a fallback', async () => {
    // One synthesis per Reel, so there is no quota to protect by staying on
    // the fallback -- a transient overload yesterday shouldn't cost today's
    // Reel its natural voice.
    let primaryFails = true;
    const primary: IVoiceProvider = {
      name: 'gemini-3.1-flash-tts-preview',
      synthesize: async (text, opts) => {
        if (primaryFails) throw overloaded();
        return {
          audioFilePath: opts.outputPath,
          durationSeconds: 30,
          sampleRateHz: 24000,
          provider: 'gemini-3.1-flash-tts-preview',
          text,
        };
      },
    };
    const provider = new FallbackVoiceProvider([primary, new StubVoice('espeak-ng')]);

    await provider.synthesize('day one', options);
    primaryFails = false;
    const second = await provider.synthesize('day two', options);

    expect(second.provider).toBe('gemini-3.1-flash-tts-preview');
  });

  it('throws the last error, naming every voice that was tried, when all of them fail', async () => {
    const providers = [
      new StubVoice('gemini-3.1-flash-tts-preview', overloaded()),
      new StubVoice('espeak-ng', new Error('espeak-ng exited with code 1')),
    ];

    await expect(new FallbackVoiceProvider(providers).synthesize('hi', options)).rejects.toThrow(
      /gemini-3\.1-flash-tts-preview.*espeak-ng.*espeak-ng exited with code 1/s,
    );
  });

  it('requires at least one voice', () => {
    expect(() => new FallbackVoiceProvider([])).toThrow();
  });
});
