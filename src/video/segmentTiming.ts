import type { SourcedMediaAsset, StockMediaAsset } from '../entities/MediaAsset.js';
import type { Script } from '../entities/Script.js';
import type { WordTiming } from '../entities/Subtitle.js';
import { countWords } from '../utils/text.js';

export interface VideoSegmentTiming {
  lineIndex: number;
  startSeconds: number;
  endSeconds: number;
}

/**
 * Maps each script line to a contiguous time range within the full
 * narration, so the matching stock media clip is shown for exactly as long
 * as that line is being spoken. The first line absorbs the hook's time and
 * the last line absorbs the call-to-action's time (neither has its own
 * media asset — see MediaSourcingService), so segments are gapless and sum
 * to the full narration duration.
 */
export function computeSegmentTimings(
  script: Script,
  wordTimings: WordTiming[],
): VideoSegmentTiming[] {
  if (script.lines.length === 0) return [];

  const totalDuration =
    wordTimings[wordTimings.length - 1]?.endSeconds ?? script.estimatedDurationSeconds;
  const hookWordCount = countWords(script.hook);

  let wordCursor = hookWordCount;
  const rawRanges = script.lines.map((line) => {
    const wordCount = countWords(line.text);
    const startWord = wordCursor;
    const endWord = wordCursor + wordCount;
    wordCursor = endWord;

    const startSeconds = wordTimings[startWord]?.startSeconds ?? 0;
    const lastWordOfLine = wordTimings[Math.max(startWord, endWord - 1)];
    const endSeconds = lastWordOfLine?.endSeconds ?? startSeconds;
    return { lineIndex: line.index, startSeconds, endSeconds };
  });

  const lastIndex = rawRanges.length - 1;
  return rawRanges.map((range, i) => ({
    lineIndex: range.lineIndex,
    startSeconds: i === 0 ? 0 : range.startSeconds,
    endSeconds: i === lastIndex ? totalDuration : range.endSeconds,
  }));
}

export interface AlignedMediaSegment {
  asset: StockMediaAsset;
  startSeconds: number;
  endSeconds: number;
}

/**
 * Zips sourced media assets (keyed by script line index, and possibly
 * missing some lines if no media was found for them) against the full set
 * of line timings, producing a gapless, contiguous list. A line with no
 * media has its time range absorbed into the following kept segment (or
 * the previous one, if it was the last line).
 */
export function alignMediaToSegments(
  segmentTimings: VideoSegmentTiming[],
  sourcedMedia: SourcedMediaAsset[],
): AlignedMediaSegment[] {
  const assetByLine = new Map(sourcedMedia.map((sourced) => [sourced.lineIndex, sourced.asset]));
  const result: AlignedMediaSegment[] = [];
  let pendingStart = 0;

  for (const segment of segmentTimings) {
    const asset = assetByLine.get(segment.lineIndex);
    if (!asset) continue;
    result.push({ asset, startSeconds: pendingStart, endSeconds: segment.endSeconds });
    pendingStart = segment.endSeconds;
  }

  const overallEnd = segmentTimings[segmentTimings.length - 1]?.endSeconds;
  const last = result[result.length - 1];
  if (last && overallEnd !== undefined) {
    last.endSeconds = overallEnd;
  }

  return result;
}
