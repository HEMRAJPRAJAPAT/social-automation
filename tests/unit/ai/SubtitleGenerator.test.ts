import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { HeuristicSubtitleTimingStrategy } from '../../../src/ai/HeuristicSubtitleTimingStrategy.js';
import { SubtitleGenerator } from '../../../src/ai/SubtitleGenerator.js';

const tempFiles: string[] = [];

afterEach(async () => {
  await Promise.all(tempFiles.splice(0).map((file) => fs.unlink(file).catch(() => undefined)));
});

describe('SubtitleGenerator', () => {
  it('writes a valid SRT file with sequential indices and increasing timestamps', async () => {
    const generator = new SubtitleGenerator(new HeuristicSubtitleTimingStrategy());
    const outputPath = path.join(os.tmpdir(), `subtitles-${Date.now()}.srt`);
    tempFiles.push(outputPath);

    const track = await generator.generate(
      'This is a reasonably long sentence used to test subtitle cue grouping behavior',
      12,
      outputPath,
    );

    expect(track.cues.length).toBeGreaterThan(0);
    expect(track.cues[0]!.index).toBe(1);

    const fileContent = await fs.readFile(outputPath, 'utf-8');
    expect(fileContent).toMatch(/^1\n\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}\n/);

    for (let i = 1; i < track.cues.length; i++) {
      expect(track.cues[i]!.index).toBe(i + 1);
      expect(track.cues[i]!.startSeconds).toBeGreaterThanOrEqual(track.cues[i - 1]!.startSeconds);
    }
  });

  it('caps each cue at the configured max words per line', async () => {
    const generator = new SubtitleGenerator(new HeuristicSubtitleTimingStrategy());
    const outputPath = path.join(os.tmpdir(), `subtitles-${Date.now()}-b.srt`);
    tempFiles.push(outputPath);

    const words = Array.from({ length: 23 }, (_, i) => `word${i}`).join(' ');
    const track = await generator.generate(words, 20, outputPath);

    for (const cue of track.cues) {
      expect(cue.text.split(' ').length).toBeLessThanOrEqual(5);
    }
  });
});
