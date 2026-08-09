import { describe, expect, it } from 'vitest';

import type { Script } from '../../../src/entities/Script.js';
import type { WordTiming } from '../../../src/entities/Subtitle.js';
import type { VisualPlan } from '../../../src/entities/VisualPlan.js';
import { alignMediaToSegments, computeSegmentTimings } from '../../../src/video/segmentTiming.js';

function makeWordTimings(words: string[], secondsPerWord = 1): WordTiming[] {
  return words.map((word, i) => ({
    word,
    startSeconds: i * secondsPerWord,
    endSeconds: (i + 1) * secondsPerWord,
  }));
}

function allStockPlan(lineIndexes: number[]): VisualPlan {
  return {
    scenes: lineIndexes.map((lineIndex) => ({
      lineIndex,
      type: 'stock' as const,
      stockKeywords: ['test'],
    })),
  };
}

const script: Script = {
  hook: 'hook word here', // 3 words
  lines: [
    { index: 0, text: 'line zero has four words', visualKeyword: 'coding' }, // 5 words
    { index: 1, text: 'line one has three', visualKeyword: 'testing' }, // 4 words
  ],
  callToAction: 'follow now please', // 3 words
  fullNarrationText: 'hook word here line zero has four words line one has three follow now please',
  estimatedDurationSeconds: 15,
  language: 'en',
};

describe('computeSegmentTimings', () => {
  it('produces one contiguous range per script line, absorbing hook and CTA at the ends', () => {
    const words = script.fullNarrationText.split(' ');
    const wordTimings = makeWordTimings(words, 1);

    const segments = computeSegmentTimings(script, wordTimings);

    expect(segments).toHaveLength(2);
    expect(segments[0]!.startSeconds).toBe(0); // absorbs the hook
    expect(segments[1]!.endSeconds).toBe(words.length); // absorbs the CTA

    // Contiguous: line 0 ends exactly where line 1 begins.
    expect(segments[0]!.endSeconds).toBe(segments[1]!.startSeconds);
  });

  it('returns an empty array when the script has no lines', () => {
    const emptyScript: Script = { ...script, lines: [] };
    expect(computeSegmentTimings(emptyScript, [])).toEqual([]);
  });
});

describe('alignMediaToSegments', () => {
  it('zips media assets to their matching line by lineIndex', () => {
    const segments = [
      { lineIndex: 0, startSeconds: 0, endSeconds: 5 },
      { lineIndex: 1, startSeconds: 5, endSeconds: 10 },
    ];
    const sourced = [
      { lineIndex: 0, asset: { localPath: '/a.mp4' } as never },
      { lineIndex: 1, asset: { localPath: '/b.mp4' } as never },
    ];

    const aligned = alignMediaToSegments(segments, sourced, allStockPlan([0, 1]));
    expect(aligned).toHaveLength(2);
    expect(aligned[0]!.kind).toBe('stock');
    expect(aligned[0]!.kind === 'stock' && aligned[0]!.asset.localPath).toBe('/a.mp4');
    expect(aligned[1]!.startSeconds).toBe(5);
    expect(aligned[1]!.endSeconds).toBe(10);
  });

  it('absorbs a line with no media into the following kept segment, staying gapless', () => {
    const segments = [
      { lineIndex: 0, startSeconds: 0, endSeconds: 5 },
      { lineIndex: 1, startSeconds: 5, endSeconds: 10 },
      { lineIndex: 2, startSeconds: 10, endSeconds: 15 },
    ];
    // No media found for line 1.
    const sourced = [
      { lineIndex: 0, asset: { localPath: '/a.mp4' } as never },
      { lineIndex: 2, asset: { localPath: '/c.mp4' } as never },
    ];

    const aligned = alignMediaToSegments(segments, sourced, allStockPlan([0, 1, 2]));
    expect(aligned).toHaveLength(2);
    expect(aligned[0]!.startSeconds).toBe(0);
    expect(aligned[0]!.endSeconds).toBe(5);
    // Line 1's [5,10) range is absorbed into line 2's segment.
    expect(aligned[1]!.startSeconds).toBe(5);
    expect(aligned[1]!.endSeconds).toBe(15);
  });

  it('extends the last kept segment when the final line has no media', () => {
    const segments = [
      { lineIndex: 0, startSeconds: 0, endSeconds: 5 },
      { lineIndex: 1, startSeconds: 5, endSeconds: 10 },
    ];
    const sourced = [{ lineIndex: 0, asset: { localPath: '/a.mp4' } as never }];

    const aligned = alignMediaToSegments(segments, sourced, allStockPlan([0, 1]));
    expect(aligned).toHaveLength(1);
    expect(aligned[0]!.endSeconds).toBe(10);
  });

  it('always renders a diagram-type line as its own segment, even though it has no sourced media', () => {
    const segments = [
      { lineIndex: 0, startSeconds: 0, endSeconds: 5 },
      { lineIndex: 1, startSeconds: 5, endSeconds: 10 },
    ];
    const sourced = [{ lineIndex: 0, asset: { localPath: '/a.mp4' } as never }];
    const visualPlan: VisualPlan = {
      scenes: [
        { lineIndex: 0, type: 'stock', stockKeywords: ['test'] },
        {
          lineIndex: 1,
          type: 'diagram',
          diagramSpec: { title: 'How it works', boxes: [{ label: 'A' }, { label: 'B' }], layout: 'vertical-flow' },
        },
      ],
    };

    const aligned = alignMediaToSegments(segments, sourced, visualPlan);
    expect(aligned).toHaveLength(2);
    expect(aligned[1]!.kind).toBe('diagram');
    expect(aligned[1]!.startSeconds).toBe(5);
    expect(aligned[1]!.endSeconds).toBe(10);
  });
});
