import axios, { AxiosError, AxiosHeaders } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GeminiLlmProvider } from '../../../src/services/llm/GeminiLlmProvider.js';
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GeminiLlmProvider retries', () => {
  it('does not retry a timed-out request, handing the next model its turn at once', async () => {
    // Oct 13, run #75: five 60-second timeouts on one model = 6.5 minutes,
    // which across a three-model chain would blow the Action's 15-minute cap.
    const post = vi
      .spyOn(axios, 'post')
      .mockRejectedValue(new AxiosError('timeout of 60000ms exceeded', 'ECONNABORTED'));
    const llm = new GeminiLlmProvider('key', 'gemini-flash-lite-latest', makeFakeApiLogRepository(), 5, 1);

    await expect(llm.generateText('prompt', { purpose: 'TOPIC' })).rejects.toThrow(/timeout/);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('still retries a 503, since a demand spike can clear within seconds', async () => {
    const post = vi.spyOn(axios, 'post').mockRejectedValue(httpFailure(503));
    const llm = new GeminiLlmProvider('key', 'gemini-flash-lite-latest', makeFakeApiLogRepository(), 3, 1);

    await expect(llm.generateText('prompt', { purpose: 'TOPIC' })).rejects.toThrow();
    expect(post).toHaveBeenCalledTimes(3);
  });
});
