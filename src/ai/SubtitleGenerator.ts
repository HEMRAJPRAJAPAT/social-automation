import fs from 'node:fs/promises';

import type { SubtitleCue, SubtitleTrack, WordTiming } from '../entities/Subtitle.js';
import type { ISubtitleTimingStrategy } from '../services/interfaces/ISubtitleTimingStrategy.js';

/** Max words shown per on-screen subtitle cue — keeps captions readable on a vertical Reel. */
const MAX_WORDS_PER_CUE = 5;

function formatSrtTimestamp(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = Math.floor(clamped % 60);
  const millis = Math.round((clamped - Math.floor(clamped)) * 1000);
  const pad = (value: number, length = 2): string => String(value).padStart(length, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`;
}

function groupIntoCues(wordTimings: WordTiming[], maxWordsPerCue: number): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  for (let i = 0; i < wordTimings.length; i += maxWordsPerCue) {
    const group = wordTimings.slice(i, i + maxWordsPerCue);
    const first = group[0];
    const last = group[group.length - 1];
    if (!first || !last) continue;
    cues.push({
      index: cues.length + 1,
      startSeconds: first.startSeconds,
      endSeconds: last.endSeconds,
      text: group.map((word) => word.word).join(' '),
    });
  }
  return cues;
}

function toSrt(cues: SubtitleCue[]): string {
  return cues
    .map(
      (cue) =>
        `${cue.index}\n${formatSrtTimestamp(cue.startSeconds)} --> ${formatSrtTimestamp(cue.endSeconds)}\n${cue.text}\n`,
    )
    .join('\n');
}

export class SubtitleGenerator {
  constructor(private readonly timingStrategy: ISubtitleTimingStrategy) {}

  async generate(
    fullNarrationText: string,
    totalDurationSeconds: number,
    outputSrtPath: string,
  ): Promise<SubtitleTrack> {
    const wordTimings = this.timingStrategy.computeWordTimings(
      fullNarrationText,
      totalDurationSeconds,
    );
    const cues = groupIntoCues(wordTimings, MAX_WORDS_PER_CUE);
    await fs.writeFile(outputSrtPath, toSrt(cues), 'utf-8');

    return { cues, wordTimings, srtFilePath: outputSrtPath };
  }
}
