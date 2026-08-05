import type { WordTiming } from '../../entities/Subtitle.js';

/**
 * Strategy for assigning start/end times to each word of a narration script,
 * given the script text and the total measured audio duration. Kept behind
 * an interface so a real ASR-based forced aligner can replace the default
 * heuristic estimator later (see ARCHITECTURE.md §9) without touching the
 * SRT-writing code in SubtitleGenerator.
 */
export interface ISubtitleTimingStrategy {
  computeWordTimings(fullText: string, totalDurationSeconds: number): WordTiming[];
}
