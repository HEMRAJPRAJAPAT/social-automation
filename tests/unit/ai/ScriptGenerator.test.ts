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

  it('includes the evaluator feedback in the prompt when regenerating after a low score', async () => {
    const llm = new FakeLlmProvider();
    llm.enqueueJson(validScript('A hook nobody has heard before'));

    const generator = new ScriptGenerator(llm);
    await generator.generate(topic, research, settings, 'post-1', [], {
      scores: {
        hookStrength: 3,
        clarity: 3,
        beginnerFriendliness: 3,
        originality: 3,
        visualFeasibility: 3,
        value: 3,
        overall: 3,
        improvementNotes: 'Too much unexplained jargon in the second line.',
      },
    });

    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]!.prompt).toContain('Too much unexplained jargon in the second line.');
    expect(llm.calls[0]!.prompt).toContain('scored 3/10');
  });

  it('states the hook and line length limits up front, so the first attempt can already pass', async () => {
    const llm = new FakeLlmProvider();
    llm.enqueueJson(validScript('A hook nobody has heard before'));

    await new ScriptGenerator(llm).generate(topic, research, settings, 'post-1', []);

    expect(llm.calls[0]!.prompt).toMatch(/hook.*12 words or fewer/is);
    expect(llm.calls[0]!.prompt).toMatch(/no line.*over 10 words/is);
  });

  it('feeds broken length rules back word for word when regenerating', async () => {
    const llm = new FakeLlmProvider();
    llm.enqueueJson(validScript('A hook nobody has heard before'));
    const violation = 'Hook is 25 words (~10.0s to say); cut it to 12 words or fewer.';

    await new ScriptGenerator(llm).generate(topic, research, settings, 'post-1', [], {
      scores: {
        hookStrength: 8,
        clarity: 8,
        beginnerFriendliness: 8,
        originality: 8,
        visualFeasibility: 8,
        value: 8,
        overall: 8,
        improvementNotes: 'Solid.',
      },
      ruleViolations: [violation],
    });

    expect(llm.calls[0]!.prompt).toContain(violation);
  });

  it('throws when no fresh hook can be generated after all retries', async () => {
    const llm = new FakeLlmProvider();
    for (let i = 0; i < 3; i++) {
      llm.enqueueJson(validScript('5 React Hooks You Should Know'));
    }

    const generator = new ScriptGenerator(llm);
    await expect(
      generator.generate(topic, research, settings, 'post-1', [
        '5 React Hooks You Should Know Today',
      ]),
    ).rejects.toThrow(/fresh hook/i);
  });
});
