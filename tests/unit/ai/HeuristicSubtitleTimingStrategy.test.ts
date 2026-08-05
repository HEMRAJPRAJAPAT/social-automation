import { describe, expect, it } from 'vitest';

import { HeuristicSubtitleTimingStrategy } from '../../../src/ai/HeuristicSubtitleTimingStrategy.js';

describe('HeuristicSubtitleTimingStrategy', () => {
  const strategy = new HeuristicSubtitleTimingStrategy();

  it('returns one timing per word', () => {
    const timings = strategy.computeWordTimings('one two three four', 10);
    expect(timings).toHaveLength(4);
  });

  it('produces contiguous, monotonically increasing timings starting at 0', () => {
    const timings = strategy.computeWordTimings('one two three four five', 10);
    expect(timings[0]!.startSeconds).toBe(0);
    for (let i = 1; i < timings.length; i++) {
      expect(timings[i]!.startSeconds).toBeCloseTo(timings[i - 1]!.endSeconds, 5);
      expect(timings[i]!.endSeconds).toBeGreaterThan(timings[i]!.startSeconds);
    }
  });

  it('ends exactly at the total duration', () => {
    const totalDuration = 12.5;
    const timings = strategy.computeWordTimings('a short sentence about testing things', totalDuration);
    expect(timings[timings.length - 1]!.endSeconds).toBeCloseTo(totalDuration, 5);
  });

  it('gives longer words more time than shorter words, all else equal', () => {
    const timings = strategy.computeWordTimings('a extraordinarily', 10);
    const [shortWord, longWord] = timings;
    const shortDuration = shortWord!.endSeconds - shortWord!.startSeconds;
    const longDuration = longWord!.endSeconds - longWord!.startSeconds;
    expect(longDuration).toBeGreaterThan(shortDuration);
  });

  it('returns an empty array for empty text', () => {
    expect(strategy.computeWordTimings('   ', 10)).toEqual([]);
  });
});
