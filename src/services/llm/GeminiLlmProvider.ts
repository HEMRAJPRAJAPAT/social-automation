import axios, { isAxiosError } from 'axios';

import type { IApiLogRepository } from '../../repositories/interfaces/IApiLogRepository.js';
import { childLogger } from '../../utils/logger.js';
import { withRetry } from '../../utils/retry.js';
import type { ILlmProvider, LlmGenerationOptions } from '../interfaces/ILlmProvider.js';

const log = childLogger('gemini-llm');

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiCandidate {
  content?: { parts?: Array<{ text?: string }> };
  finishReason?: string;
}

interface GeminiGenerateContentResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: { totalTokenCount?: number };
}

export class GeminiLlmProvider implements ILlmProvider {
  constructor(
    private readonly apiKey: string,
    public readonly modelName: string,
    private readonly apiLogRepository: IApiLogRepository,
    private readonly retryAttempts: number,
    private readonly retryBaseDelayMs: number,
  ) {}

  async generateText(prompt: string, options: LlmGenerationOptions = {}): Promise<string> {
    const endpoint = `${GEMINI_BASE_URL}/${this.modelName}:generateContent`;
    let attemptCounter = 0;

    const response = await withRetry(
      async () => {
        attemptCounter += 1;
        const startedAt = Date.now();
        try {
          const result = await axios.post<GeminiGenerateContentResponse>(
            `${endpoint}?key=${this.apiKey}`,
            {
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: options.temperature ?? 0.8,
                // Generous headroom: current Gemini models spend a variable,
                // often substantial share of this budget on internal
                // "thinking" tokens before producing any visible output
                // (observed 200-600+ thinking tokens even for trivial
                // prompts), so a low cap risks silently truncating the JSON
                // we actually need.
                maxOutputTokens: options.maxOutputTokens ?? 4096,
              },
            },
            // Gemini can spend a substantial, variable share of maxOutputTokens
            // on internal "thinking" before any visible output appears (see
            // above), and Render's free-tier shared CPU adds further latency
            // on top — 30s was too tight and caused real requests to time out
            // on their first attempt every time rather than occasionally.
            { timeout: 60_000 },
          );
          await this.apiLogRepository.log({
            provider: 'gemini',
            endpoint: this.modelName,
            method: 'POST',
            statusCode: result.status,
            latencyMs: Date.now() - startedAt,
            attempt: attemptCounter,
            success: true,
            requestSummary: { purpose: options.purpose ?? 'unspecified' },
          });
          return result.data;
        } catch (error) {
          const statusCode = isAxiosError(error) ? error.response?.status : undefined;
          // error.message is just a generic "Request failed with status code
          // N" wrapper; error.response.data carries Google's actual error
          // body (e.g. {"error":{"code":503,"status":"UNAVAILABLE",...}}),
          // which is what actually distinguishes overload vs. other causes.
          const responseData: unknown = isAxiosError(error) ? error.response?.data : undefined;
          await this.apiLogRepository.log({
            provider: 'gemini',
            endpoint: this.modelName,
            method: 'POST',
            statusCode,
            latencyMs: Date.now() - startedAt,
            attempt: attemptCounter,
            success: false,
            errorMessage: responseData
              ? JSON.stringify(responseData)
              : error instanceof Error
                ? error.message
                : String(error),
            requestSummary: { purpose: options.purpose ?? 'unspecified' },
          });
          throw error;
        }
      },
      {
        attempts: this.retryAttempts,
        baseDelayMs: this.retryBaseDelayMs,
        label: `gemini:${options.purpose ?? this.modelName}`,
        isRetryable: (error) => {
          if (!isAxiosError(error)) return true;
          const status = error.response?.status;
          // 429 on the free tier is almost always the per-day request quota
          // (RESOURCE_EXHAUSTED), not a brief per-minute throttle -- it
          // cannot clear within a retry loop's lifetime, so retrying it
          // just burns wall-clock time for a guaranteed-failed outcome.
          return status === undefined || status >= 500;
        },
      },
    );

    const candidate = response.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text;

    if (candidate?.finishReason === 'MAX_TOKENS') {
      log.error(
        { response, purpose: options.purpose },
        'Gemini response was truncated by maxOutputTokens (likely consumed by internal "thinking" tokens)',
      );
      throw new Error(
        `Gemini response for purpose "${options.purpose ?? 'unspecified'}" was truncated (finishReason: MAX_TOKENS). ` +
          'Increase maxOutputTokens for this call.',
      );
    }

    if (!text) {
      log.error({ response }, 'Gemini response contained no text');
      throw new Error('Gemini returned an empty response');
    }
    return text;
  }

  async generateJson<T>(prompt: string, options: LlmGenerationOptions = {}): Promise<T> {
    const raw = await this.generateText(prompt, options);
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    try {
      return JSON.parse(cleaned) as T;
    } catch (error) {
      log.error({ raw, cleaned, error }, 'failed to parse Gemini JSON response');
      throw new Error(
        `Gemini response for purpose "${options.purpose ?? 'unspecified'}" was not valid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
