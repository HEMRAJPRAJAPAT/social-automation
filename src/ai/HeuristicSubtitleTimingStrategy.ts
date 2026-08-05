import type { WordTiming } from '../entities/Subtitle.js';
import type { ISubtitleTimingStrategy } from '../services/interfaces/ISubtitleTimingStrategy.js';

const PUNCTUATION_PAUSE_WEIGHT = 2.5;
const MIN_WORD_WEIGHT = 1;

function wordWeight(token: string): number {
  const letters = token.replace(/[^\p{L}\p{N}]/gu, '').length;
  const endsWithPause = /[.!?,;:]$/.test(token);
  return Math.max(MIN_WORD_WEIGHT, letters) + (endsWithPause ? PUNCTUATION_PAUSE_WEIGHT : 0);
}

/**
 * Distributes a known total narration duration across words proportionally
 * to each word's character length (plus extra weight for words ending in
 * punctuation, to approximate natural pauses). This is a deliberate,
 * documented approximation in place of real forced alignment/ASR — see
 * ARCHITECTURE.md §9. Swap this for an ASR-backed implementation of
 * ISubtitleTimingStrategy later without touching any caller.
 */
export class HeuristicSubtitleTimingStrategy implements ISubtitleTimingStrategy {
  computeWordTimings(fullText: string, totalDurationSeconds: number): WordTiming[] {
    const tokens = fullText.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];

    const weights = tokens.map(wordWeight);
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    const secondsPerWeight = totalDurationSeconds / totalWeight;

    const timings: WordTiming[] = [];
    let cursor = 0;
    for (let i = 0; i < tokens.length; i++) {
      const duration = (weights[i] ?? MIN_WORD_WEIGHT) * secondsPerWeight;
      const startSeconds = cursor;
      const endSeconds = cursor + duration;
      timings.push({ word: tokens[i] ?? '', startSeconds, endSeconds });
      cursor = endSeconds;
    }
    return timings;
  }
}
