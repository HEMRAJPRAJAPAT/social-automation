import { describe, expect, it } from 'vitest';

import { VisualPlanner } from '../../../src/ai/VisualPlanner.js';
import type { Script } from '../../../src/entities/Script.js';
import { FakeLlmProvider, makeTopic } from '../../mocks/fakes.js';

const topic = makeTopic();
const script: Script = {
  hook: 'A hook',
  lines: [
    { index: 0, text: 'First line.', visualKeyword: 'coding' },
    { index: 1, text: 'Second line.', visualKeyword: 'testing' },
  ],
  callToAction: 'Follow for more.',
  fullNarrationText: 'A hook First line. Second line. Follow for more.',
  estimatedDurationSeconds: 10,
  language: 'en',
};

describe('VisualPlanner', () => {
  it('returns the parsed plan on a valid LLM response', async () => {
    const llm = new FakeLlmProvider();
    llm.enqueueJson({
      scenes: [
        { lineIndex: 0, type: 'stock', stockKeywords: ['coding'] },
        {
          lineIndex: 1,
          type: 'diagram',
          diagramSpec: { title: 'How it works', boxes: [{ label: 'A' }, { label: 'B' }], layout: 'vertical-flow' },
        },
      ],
    });

    const planner = new VisualPlanner(llm);
    const plan = await planner.plan(script, topic, 'post-1');

    expect(plan.scenes).toHaveLength(2);
    expect(plan.scenes[1]).toMatchObject({ lineIndex: 1, type: 'diagram' });
  });

  it('fills in any line the LLM skipped with a plain stock scene instead of retrying', async () => {
    const llm = new FakeLlmProvider();
    llm.enqueueJson({
      scenes: [{ lineIndex: 0, type: 'stock', stockKeywords: ['coding'] }],
    });

    const planner = new VisualPlanner(llm);
    const plan = await planner.plan(script, topic, 'post-1');

    expect(plan.scenes).toHaveLength(2);
    const line1Scene = plan.scenes.find((s) => s.lineIndex === 1);
    expect(line1Scene?.type).toBe('stock');
  });

  it('falls back to an all-stock plan when the LLM response is invalid JSON shape', async () => {
    const llm = new FakeLlmProvider();
    llm.enqueueJson({ garbage: true });
    llm.enqueueJson({ garbage: true });

    const planner = new VisualPlanner(llm);
    const plan = await planner.plan(script, topic, 'post-1');

    expect(plan.scenes).toHaveLength(2);
    expect(plan.scenes.every((s) => s.type === 'stock')).toBe(true);
  });

  it('falls back to an all-stock plan when the LLM call throws', async () => {
    const llm = new FakeLlmProvider(); // empty queue — every call throws

    const planner = new VisualPlanner(llm);
    const plan = await planner.plan(script, topic, 'post-1');

    expect(plan.scenes).toHaveLength(2);
    expect(plan.scenes.every((s) => s.type === 'stock')).toBe(true);
  });
});
