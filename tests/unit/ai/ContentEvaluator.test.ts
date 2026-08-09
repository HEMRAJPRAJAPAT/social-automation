import { describe, expect, it } from 'vitest';

import { ContentEvaluator } from '../../../src/ai/ContentEvaluator.js';
import type { Script } from '../../../src/entities/Script.js';
import { FakeLlmProvider, makeContentSettings, makeTopic } from '../../mocks/fakes.js';

const settings = makeContentSettings();
const topic = makeTopic();
const script: Script = {
  hook: 'A hook',
  lines: [{ index: 0, text: 'A line.', visualKeyword: 'coding' }],
  callToAction: 'Follow for more.',
  fullNarrationText: 'A hook A line. Follow for more.',
  estimatedDurationSeconds: 10,
  language: 'en',
};

const validScores = {
  hookStrength: 8,
  clarity: 8,
  beginnerFriendliness: 8,
  originality: 8,
  visualFeasibility: 8,
  value: 8,
  overall: 8,
  improvementNotes: 'Solid.',
};

describe('ContentEvaluator', () => {
  it('returns the parsed scores on a valid LLM response', async () => {
    const llm = new FakeLlmProvider();
    llm.enqueueJson(validScores);

    const evaluator = new ContentEvaluator(llm);
    const scores = await evaluator.evaluate(script, topic, settings, 'post-1');

    expect(scores).toEqual(validScores);
  });

  it('fails open with a neutral passing score when the LLM response fails validation', async () => {
    const llm = new FakeLlmProvider();
    llm.enqueueJson({ not: 'a valid evaluation shape' });

    const evaluator = new ContentEvaluator(llm);
    const scores = await evaluator.evaluate(script, topic, settings, 'post-1');

    expect(scores.overall).toBeGreaterThanOrEqual(settings.qualityThreshold);
  });

  it('fails open with a neutral passing score when the LLM call throws', async () => {
    const llm = new FakeLlmProvider(); // queue left empty — generateJson throws
    const evaluator = new ContentEvaluator(llm);

    const scores = await evaluator.evaluate(script, topic, settings, 'post-1');

    expect(scores.overall).toBeGreaterThanOrEqual(settings.qualityThreshold);
  });
});
