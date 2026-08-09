import fs from 'node:fs/promises';

import type { SubtitleCue, SubtitleTrack, WordTiming } from '../entities/Subtitle.js';
import type { ISubtitleTimingStrategy } from '../services/interfaces/ISubtitleTimingStrategy.js';

import { buildAssHeader, resolveCaptionStylePreset } from './captionStyles.js';

/** Max words shown per on-screen subtitle cue — keeps captions readable on a vertical Reel. */
const MAX_WORDS_PER_CUE = 4;

export interface SubtitleStyleOptions {
  fontFamily: string;
  stylePreset: string;
}

function formatAssTimestamp(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = Math.floor(clamped % 60);
  const centiseconds = Math.round((clamped - Math.floor(clamped)) * 100);
  const pad = (value: number, length = 2): string => String(value).padStart(length, '0');
  return `${hours}:${pad(minutes)}:${pad(seconds)}.${pad(centiseconds)}`;
}

/** Strips ASS override-block delimiters from narration text so it can't break the karaoke markup. */
function escapeAssText(word: string): string {
  return word.replace(/[{}\\]/g, '');
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
      words: group,
    });
  }
  return cues;
}

/** One Dialogue line per cue, with a `{\k<centiseconds>}` tag per word for progressive highlight. */
function toAssDialogue(cue: SubtitleCue): string {
  const start = formatAssTimestamp(cue.startSeconds);
  const end = formatAssTimestamp(cue.endSeconds);
  const text = cue.words
    .map((word) => {
      const centiseconds = Math.max(1, Math.round((word.endSeconds - word.startSeconds) * 100));
      return `{\\k${centiseconds}}${escapeAssText(word.word)}`;
    })
    .join(' ');
  return `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`;
}

function toAss(cues: SubtitleCue[], fontFamily: string, stylePreset: string): string {
  const header = buildAssHeader(fontFamily, resolveCaptionStylePreset(stylePreset));
  const events = cues.map(toAssDialogue).join('\n');
  return `${header}\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${events}\n`;
}

export class SubtitleGenerator {
  constructor(private readonly timingStrategy: ISubtitleTimingStrategy) {}

  async generate(
    fullNarrationText: string,
    totalDurationSeconds: number,
    outputAssPath: string,
    styleOptions: SubtitleStyleOptions,
  ): Promise<SubtitleTrack> {
    const wordTimings = this.timingStrategy.computeWordTimings(
      fullNarrationText,
      totalDurationSeconds,
    );
    const cues = groupIntoCues(wordTimings, MAX_WORDS_PER_CUE);
    await fs.writeFile(
      outputAssPath,
      toAss(cues, styleOptions.fontFamily, styleOptions.stylePreset),
      'utf-8',
    );

    return { cues, wordTimings, assFilePath: outputAssPath };
  }
}
