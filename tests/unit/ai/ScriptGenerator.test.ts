import { describe, expect, it } from 'vitest';

import { ScriptGenerator } from '../../../src/ai/ScriptGenerator.js';
import type { ResearchResult } from '../../../src/entities/ResearchResult.js';
import { FakeLlmProvider, makeContentSettings, makeTopic } from '../../mocks/fakes.js';

const settings = makeContentSettings();
const topic = makeTopic();
const research: ResearchResult = {
  topicTitle: topic.title,
  keyPoints: ['point one', 'point two', 'point three'],
  facts: [{ point: 'fact', detail: 'detail', source: 'model-knowledge' }],
  examples: [{ title: 'example', description: 'description' }],
  latestDevelopments: [],
  suggestedAngle: 'angle',
};

function validScript(hook: string) {
  return {
    hook,
    lines: [
      { index: 0, text: 'This explains the first beat clearly.', visualKeyword: 'coding' },
      { index: 1, text: 'This explains the second beat clearly.', visualKeyword: 'testing' },
    ],
    callToAction: 'Follow for more tips like this.',
  };
}

describe('ScriptGenerator', () => {
  it('builds a script entity with a computed duration estimate', async () => {
    const llm = new FakeLlmProvider();
    llm.enqueueJson(validScript('A hook nobody has heard before'));

    const generator = new ScriptGenerator(llm);
    const script = await generator.generate(topic, research, settings, 'post-1', []);

    expect(script.hook).toBe('A hook nobody has heard before');
    expect(script.lines).toHaveLength(2);
    expect(script.fullNarrationText).toContain(script.hook);
    expect(script.fullNarrationText).toContain(script.callToAction);
    expect(script.estimatedDurationSeconds).toBeGreaterThan(0);
    expect(script.language).toBe(settings.language);
  });

  it('retries when the hook is too similar to a recent post', async () => {
    const llm = new FakeLlmProvider();
    llm.enqueueJson(validScript('5 React Hooks You Should Know'));
    llm.enqueueJson(validScript('A completely different and original hook'));

    const generator = new ScriptGenerator(llm);
    const script = await generator.generate(topic, research, settings, 'post-1', [
      '5 React Hooks You Should Know Today',
    ]);

    expect(script.hook).toBe('A completely different and original hook');
    expect(llm.calls).toHaveLength(2);
  });

  it('throws when no fresh hook can be generated after all retries', async () => {
    const llm = new FakeLlmProvider();
    for (let i = 0; i < 3; i++) {
      llm.enqueueJson(validScript('5 React Hooks You Should Know'));
    }

    const generator = new ScriptGenerator(llm);
    await expect(
      generator.generate(topic, research, settings, 'post-1', ['5 React Hooks You Should Know Today']),
    ).rejects.toThrow(/fresh hook/i);
  });
});
