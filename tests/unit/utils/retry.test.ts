import { describe, expect, it, vi } from 'vitest';

import { RetryExhaustedError, withRetry } from '../../../src/utils/retry.js';

describe('withRetry', () => {
  it('returns the result on the first successful attempt without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { attempts: 3, baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and eventually succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom 1'))
      .mockRejectedValueOnce(new Error('boom 2'))
      .mockResolvedValue('ok');

    const result = await withRetry(fn, { attempts: 3, baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws RetryExhaustedError after exhausting all attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));

    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 1, label: 'my-op' })).rejects.toThrow(
      RetryExhaustedError,
    );
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('stops immediately when isRetryable returns false', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('non-retryable'));

    await expect(
      withRetry(fn, { attempts: 5, baseDelayMs: 1, isRetryable: () => false }),
    ).rejects.toThrow(RetryExhaustedError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('calls onAttemptFailed for every failed attempt', async () => {
    const onAttemptFailed = vi.fn();
    const fn = vi.fn().mockRejectedValueOnce(new Error('first')).mockResolvedValue('ok');

    await withRetry(fn, { attempts: 3, baseDelayMs: 1, onAttemptFailed });
    expect(onAttemptFailed).toHaveBeenCalledTimes(1);
    expect(onAttemptFailed).toHaveBeenCalledWith(expect.any(Error), 1);
  });
});
