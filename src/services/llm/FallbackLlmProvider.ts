import { isAxiosError } from 'axios';

import { childLogger } from '../../utils/logger.js';
import { RetryExhaustedError } from '../../utils/retry.js';
import type { ILlmProvider, LlmGenerationOptions } from '../interfaces/ILlmProvider.js';

const log = childLogger('fallback-llm');

/**
 * Returns true for the two failures that mean "this model can't serve us right
 * now, but another one might": 429 RESOURCE_EXHAUSTED (the free tier's 20
 * requests/day/model cap, which cannot clear for hours) and 5xx UNAVAILABLE
 * (Google-side capacity). Anything else — an empty response, malformed JSON, a
 * bad API key — would fail identically on every model, so switching would just
 * burn a second model's quota for the same error.
 */
function isModelUnavailable(error: unknown): boolean {
  const cause = error instanceof RetryExhaustedError ? error.cause : error;
  if (!isAxiosError(cause)) return false;
  const status = cause.response?.status;
  return status === 429 || (status !== undefined && status >= 500);
}

/**
 * Tries an ordered list of models and moves to the next one when the current
 * model is rate-limited or overloaded.
 *
 * The chosen model is *sticky*: once we've moved on, every later call in the
 * run goes straight to the new model. That matters on the free tier, where one
 * Reel needs ~7 LLM calls against a 20 requests/day/model cap — retrying the
 * exhausted model for each of those calls would spend the retry budget on a
 * guaranteed 429 and could exhaust the fallback's quota before the Reel is done.
 */
export class FallbackLlmProvider implements ILlmProvider {
  private activeIndex = 0;

  constructor(private readonly providers: readonly ILlmProvider[]) {
    if (providers.length === 0) {
      throw new Error('FallbackLlmProvider requires at least one model');
    }
  }

  get modelName(): string {
    return this.providers[this.activeIndex]!.modelName;
  }

  async generateText(prompt: string, options: LlmGenerationOptions = {}): Promise<string> {
    return this.run((provider) => provider.generateText(prompt, options), options);
  }

  async generateJson<T>(prompt: string, options: LlmGenerationOptions = {}): Promise<T> {
    return this.run((provider) => provider.generateJson<T>(prompt, options), options);
  }

  private async run<T>(
    call: (provider: ILlmProvider) => Promise<T>,
    options: LlmGenerationOptions,
  ): Promise<T> {
    let lastError: unknown;

    while (this.activeIndex < this.providers.length) {
      const provider = this.providers[this.activeIndex]!;
      try {
        return await call(provider);
      } catch (error) {
        if (!isModelUnavailable(error)) throw error;
        lastError = error;

        const next = this.providers[this.activeIndex + 1];
        log.warn(
          {
            model: provider.modelName,
            nextModel: next?.modelName,
            purpose: options.purpose,
            error: error instanceof Error ? error.message : String(error),
          },
          next
            ? 'model is rate-limited or overloaded; switching to the next model for the rest of this run'
            : 'model is rate-limited or overloaded and no fallback models remain',
        );

        this.activeIndex += 1;
      }
    }

    // Keep the index on the last provider so modelName still reports something
    // real, and so a later call retries it rather than indexing past the end.
    this.activeIndex = this.providers.length - 1;
    throw lastError;
  }
}
