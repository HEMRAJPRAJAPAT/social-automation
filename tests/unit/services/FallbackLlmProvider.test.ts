import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';

import type { ILlmProvider, LlmGenerationOptions } from '../../../src/services/interfaces/ILlmProvider.js';
import { FallbackLlmProvider } from '../../../src/services/llm/FallbackLlmProvider.js';
import { RetryExhaustedError } from '../../../src/utils/retry.js';

/** Builds the error GeminiLlmProvider throws once withRetry gives up on an HTTP failure. */
function retryExhausted(status: number, status_text: string): RetryExhaustedError {
  const headers = new AxiosHeaders();
  const axiosError = new AxiosError('Request failed', undefined, undefined, undefined, {
    status,
    statusText: '',
    headers,
    config: { headers },
    data: { error: { code: status, status: status_text } },
  });
  return new RetryExhaustedError('gemini:TOPIC', 5, axiosError);
}

/** Records every call so a test can assert a provider was never reached. */
class StubProvider implements ILlmProvider {
  public calls = 0;

  constructor(
    public readonly modelName: string,
    private readonly behavior: () => string,
  ) {}

  async generateText(_prompt: string, _options?: LlmGenerationOptions): Promise<string> {
    this.calls += 1;
    return this.behavior();
  }

  async generateJson<T>(prompt: string, options?: LlmGenerationOptions): Promise<T> {
    return JSON.parse(await this.generateText(prompt, options)) as T;
  }
}

const ok = (value: string) => () => value;
const fails = (error: Error) => () => {
  throw error;
};

describe('FallbackLlmProvider', () => {
  it('falls back to the next model when the first is out of free-tier quota', async () => {
    const primary = new StubProvider('gemini-flash-latest', fails(retryExhausted(429, 'RESOURCE_EXHAUSTED')));
    const backup = new StubProvider('gemini-flash-lite-latest', ok('a topic'));

    const provider = new FallbackLlmProvider([primary, backup]);

    await expect(provider.generateText('prompt')).resolves.toBe('a topic');
    expect(backup.calls).toBe(1);
  });

  it('falls back when the model is overloaded', async () => {
    const primary = new StubProvider('gemini-flash-latest', fails(retryExhausted(503, 'UNAVAILABLE')));
    const backup = new StubProvider('gemini-flash-lite-latest', ok('a topic'));

    const provider = new FallbackLlmProvider([primary, backup]);

    await expect(provider.generateText('prompt')).resolves.toBe('a topic');
  });

  it('stays on the fallback model for later calls instead of re-spending quota on the dead one', async () => {
    const primary = new StubProvider('gemini-flash-latest', fails(retryExhausted(429, 'RESOURCE_EXHAUSTED')));
    const backup = new StubProvider('gemini-flash-lite-latest', ok('a topic'));

    const provider = new FallbackLlmProvider([primary, backup]);
    await provider.generateText('first');
    await provider.generateText('second');

    expect(primary.calls).toBe(1);
    expect(backup.calls).toBe(2);
    expect(provider.modelName).toBe('gemini-flash-lite-latest');
  });

  it('propagates a non-quota failure without spending a fallback model', async () => {
    const primary = new StubProvider('gemini-flash-latest', fails(new Error('Gemini returned an empty response')));
    const backup = new StubProvider('gemini-flash-lite-latest', ok('a topic'));

    const provider = new FallbackLlmProvider([primary, backup]);

    await expect(provider.generateText('prompt')).rejects.toThrow('Gemini returned an empty response');
    expect(backup.calls).toBe(0);
  });

  it('throws the last failure once every model is exhausted', async () => {
    const primary = new StubProvider('gemini-flash-latest', fails(retryExhausted(429, 'RESOURCE_EXHAUSTED')));
    const backup = new StubProvider('gemini-flash-lite-latest', fails(retryExhausted(503, 'UNAVAILABLE')));

    const provider = new FallbackLlmProvider([primary, backup]);

    await expect(provider.generateText('prompt')).rejects.toThrow(RetryExhaustedError);
    expect(primary.calls).toBe(1);
    expect(backup.calls).toBe(1);
  });

  it('parses JSON through whichever model answered', async () => {
    const primary = new StubProvider('gemini-flash-latest', fails(retryExhausted(429, 'RESOURCE_EXHAUSTED')));
    const backup = new StubProvider('gemini-flash-lite-latest', ok('{"topic":"squats"}'));

    const provider = new FallbackLlmProvider([primary, backup]);

    await expect(provider.generateJson('prompt')).resolves.toEqual({ topic: 'squats' });
  });

  it('requires at least one model', () => {
    expect(() => new FallbackLlmProvider([])).toThrow();
  });
});
