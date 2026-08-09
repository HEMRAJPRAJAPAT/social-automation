import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { HeuristicSubtitleTimingStrategy } from '../../../src/ai/HeuristicSubtitleTimingStrategy.js';
import { SubtitleGenerator } from '../../../src/ai/SubtitleGenerator.js';

const tempFiles: string[] = [];
const styleOptions = { fontFamily: 'DejaVu Sans', stylePreset: 'bold-highlight' };

afterEach(async () => {
  await Promise.all(tempFiles.splice(0).map((file) => fs.unlink(file).catch(() => undefined)));
});

describe('SubtitleGenerator', () => {
  it('writes a valid .ass file with sequential indices and increasing timestamps', async () => {
    const generator = new SubtitleGenerator(new HeuristicSubtitleTimingStrategy());
    const outputPath = path.join(os.tmpdir(), `subtitles-${Date.now()}.ass`);
    tempFiles.push(outputPath);

    const track = await generator.generate(
      'This is a reasonably long sentence used to test subtitle cue grouping behavior',
      12,
      outputPath,
      styleOptions,
    );

    expect(track.cues.length).toBeGreaterThan(0);
    expect(track.cues[0]!.index).toBe(1);

    const fileContent = await fs.readFile(outputPath, 'utf-8');
    expect(fileContent).toContain('[Script Info]');
    expect(fileContent).toContain('[V4+ Styles]');
    expect(fileContent).toContain('[Events]');
    expect(fileContent).toMatch(/Dialogue: 0,\d:\d{2}:\d{2}\.\d{2},\d:\d{2}:\d{2}\.\d{2},Default/);

    for (let i = 1; i < track.cues.length; i++) {
      expect(track.cues[i]!.index).toBe(i + 1);
      expect(track.cues[i]!.startSeconds).toBeGreaterThanOrEqual(track.cues[i - 1]!.startSeconds);
    }
  });

  it('caps each cue at the configured max words per line', async () => {
    const generator = new SubtitleGenerator(new HeuristicSubtitleTimingStrategy());
    const outputPath = path.join(os.tmpdir(), `subtitles-${Date.now()}-b.ass`);
    tempFiles.push(outputPath);

    const words = Array.from({ length: 23 }, (_, i) => `word${i}`).join(' ');
    const track = await generator.generate(words, 20, outputPath, styleOptions);

    for (const cue of track.cues) {
      expect(cue.text.split(' ').length).toBeLessThanOrEqual(4);
    }
  });

  it('emits a karaoke {\\k} tag per word so captions progressively highlight as spoken', async () => {
    const generator = new SubtitleGenerator(new HeuristicSubtitleTimingStrategy());
    const outputPath = path.join(os.tmpdir(), `subtitles-${Date.now()}-c.ass`);
    tempFiles.push(outputPath);

    await generator.generate('one two three four', 4, outputPath, styleOptions);
    const fileContent = await fs.readFile(outputPath, 'utf-8');

    expect(fileContent).toMatch(/\{\\k\d+\}one/);
    expect(fileContent).toMatch(/\{\\k\d+\}two/);
  });

  it('selects the clean-white style preset when configured', async () => {
    const generator = new SubtitleGenerator(new HeuristicSubtitleTimingStrategy());
    const outputPath = path.join(os.tmpdir(), `subtitles-${Date.now()}-d.ass`);
    tempFiles.push(outputPath);

    await generator.generate('hello world', 2, outputPath, {
      fontFamily: 'DejaVu Sans',
      stylePreset: 'clean-white',
    });
    const fileContent = await fs.readFile(outputPath, 'utf-8');

    // clean-white uses the same color for spoken/upcoming text (no karaoke pop).
    const styleLine = fileContent.split('\n').find((line) => line.startsWith('Style: Default'));
    const colors = styleLine!.split(',').slice(3, 5);
    expect(colors[0]).toBe(colors[1]);
  });
});
