import axios, { AxiosError, AxiosHeaders } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GeminiVoiceProvider } from '../../../src/services/voice/GeminiVoiceProvider.js';
import { makeFakeApiLogRepository } from '../../mocks/fakes.js';

function httpFailure(status: number): AxiosError {
  const headers = new AxiosHeaders();
  return new AxiosError('Request failed', undefined, undefined, undefined, {
    status,
    statusText: '',
    headers,
    config: { headers },
    data: { error: { code: status } },
  });
}

const options = { outputPath: '/tmp/never-written.wav', language: 'hi' };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GeminiVoiceProvider retries', () => {
  it('gives up on a 429 immediately instead of burning the retry budget on a spent daily quota', async () => {
    const post = vi.spyOn(axios, 'post').mockRejectedValue(httpFailure(429));
    const voice = new GeminiVoiceProvider('key', 'gemini-tts', makeFakeApiLogRepository(), 5, 1);

    await expect(voice.synthesize('hi', options)).rejects.toThrow();
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('still retries a 503, since an overload can clear within seconds', async () => {
    const post = vi.spyOn(axios, 'post').mockRejectedValue(httpFailure(503));
    const voice = new GeminiVoiceProvider('key', 'gemini-tts', makeFakeApiLogRepository(), 3, 1);

    await expect(voice.synthesize('hi', options)).rejects.toThrow();
    expect(post).toHaveBeenCalledTimes(3);
  });
});
