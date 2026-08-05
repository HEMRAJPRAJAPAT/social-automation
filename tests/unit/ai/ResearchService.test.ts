import { describe, expect, it } from 'vitest';

import { ResearchService } from '../../../src/ai/ResearchService.js';
import { FakeLlmProvider, makeTopic } from '../../mocks/fakes.js';

const topic = makeTopic();

describe('ResearchService', () => {
  it('returns validated research data on a well-formed LLM response', async () => {
    const llm = new FakeLlmProvider();
    llm.enqueueJson({
      topicTitle: topic.title,
      keyPoints: ['a', 'b', 'c'],
      facts: [
        { point: 'p1', detail: 'd1', source: 'model-knowledge' },
        { point: 'p2', detail: 'd2', source: 'model-knowledge' },
      ],
      examples: [{ title: 't', description: 'd' }],
      latestDevelopments: [],
      suggestedAngle: 'angle',
    });

    const service = new ResearchService(llm);
    const result = await service.research(topic, 'post-1');

    expect(result.keyPoints).toEqual(['a', 'b', 'c']);
    expect(result.suggestedAngle).toBe('angle');
  });

  it('throws a descriptive error when the response fails schema validation', async () => {
    const llm = new FakeLlmProvider();
    llm.enqueueJson({ topicTitle: topic.title, keyPoints: [] });

    const service = new ResearchService(llm);
    await expect(service.research(topic, 'post-1')).rejects.toThrow(/schema validation/i);
  });
});
