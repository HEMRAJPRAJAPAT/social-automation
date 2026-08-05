import { describe, expect, it } from 'vitest';

import { CaptionGenerator } from '../../../src/ai/CaptionGenerator.js';
import type { Script } from '../../../src/entities/Script.js';
import { FakeLlmProvider, makeContentSettings, makeTopic } from '../../mocks/fakes.js';

const settings = makeContentSettings();
const topic = makeTopic();
const script: Script = {
  hook: 'A hook',
  lines: [{ index: 0, text: 'line', visualKeyword: 'coding' }],
  callToAction: 'Follow for more',
  fullNarrationText: 'A hook line Follow for more',
  estimatedDurationSeconds: 10,
  language: 'en',
};

describe('CaptionGenerator', () => {
  it('returns a validated caption package', async () => {
    const llm = new FakeLlmProvider();
    llm.enqueueJson({
      igTitle: 'A punchy title',
      captionText: 'A caption long enough to satisfy the minimum length requirement for validation.',
    });

    const generator = new CaptionGenerator(llm);
    const result = await generator.generate(topic, script, settings, 'post-1');

    expect(result.igTitle).toBe('A punchy title');
    expect(result.captionText.length).toBeGreaterThan(20);
  });

  it('throws when the response fails schema validation', async () => {
    const llm = new FakeLlmProvider();
    llm.enqueueJson({ igTitle: 'x', captionText: 'too short' });

    const generator = new CaptionGenerator(llm);
    await expect(generator.generate(topic, script, settings, 'post-1')).rejects.toThrow(
      /schema validation/i,
    );
  });
});
