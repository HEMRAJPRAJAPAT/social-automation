import { childLogger } from './logger.js';

const log = childLogger('retry');

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Called after every failed attempt (before the retry sleep). */
  onAttemptFailed?: (error: unknown, attempt: number) => void;
  /** Return false to abort retrying immediately (e.g. non-retryable 4xx). */
  isRetryable?: (error: unknown) => boolean;
  label?: string;
}

export class RetryExhaustedError extends Error {
  constructor(
    public readonly label: string,
    public readonly attempts: number,
    public override readonly cause: unknown,
  ) {
    super(
      `"${label}" failed after ${attempts} attempt(s): ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    this.name = 'RetryExhaustedError';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exponential = baseDelayMs * 2 ** (attempt - 1);
  const jitter = Math.random() * baseDelayMs;
  return Math.min(exponential + jitter, maxDelayMs);
}

/**
 * Executes `fn`, retrying on failure with exponential backoff + jitter.
 * Every external API call in this project (Gemini, Pexels, Pixabay,
 * Instagram Graph) goes through this so retry behavior stays consistent
 * (spec §14: "Retry every external API: 3 attempts. Exponential backoff.").
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    attempts = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30_000,
    onAttemptFailed,
    isRetryable = () => true,
    label = 'operation',
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      onAttemptFailed?.(error, attempt);

      const canRetry = attempt < attempts && isRetryable(error);
      log.warn(
        {
          label,
          attempt,
          attempts,
          canRetry,
          error: error instanceof Error ? error.message : error,
        },
        'attempt failed',
      );

      if (!canRetry) break;

      await sleep(backoffDelay(attempt, baseDelayMs, maxDelayMs));
    }
  }

  throw new RetryExhaustedError(label, attempts, lastError);
}
