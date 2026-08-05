import { describe, expect, it } from 'vitest';

import { HashtagGenerator } from '../../../src/ai/HashtagGenerator.js';
import { FakeLlmProvider, makeContentSettings, makeTopic } from '../../mocks/fakes.js';

const settings = makeContentSettings();
const topic = makeTopic();

function tagList(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}${i}`);
}

describe('HashtagGenerator', () => {
  it('produces between 15 and 20 deduplicated, hash-prefixed tags', async () => {
    const llm = new FakeLlmProvider();
    llm.enqueueJson({
      small: tagList('small', 8),
      medium: tagList('medium', 8),
      popular: tagList('popular', 8),
    });

    const generator = new HashtagGenerator(llm);
    const hashtags = generator.generate(topic, settings, 'post-1');
    const result = await hashtags;

    expect(result.length).toBeGreaterThanOrEqual(15);
    expect(result.length).toBeLessThanOrEqual(20);
    for (const tag of result) {
      expect(tag.startsWith('#')).toBe(true);
    }
    expect(new Set(result).size).toBe(result.length);
  });

  it('interleaves tiers so the result is a healthy mix, not one tier exhausted first', async () => {
    const llm = new FakeLlmProvider();
    llm.enqueueJson({
      small: tagList('small', 3),
      medium: tagList('medium', 3),
      popular: tagList('popular', 3),
    });

    const generator = new HashtagGenerator(llm);
    const result = await generator.generate(topic, settings, 'post-1');

    expect(result).toContain('#small0');
    expect(result).toContain('#medium0');
    expect(result).toContain('#popular0');
  });

  it('strips punctuation and spaces from raw tag candidates', async () => {
    const llm = new FakeLlmProvider();
    llm.enqueueJson({
      small: ['#already-hashed', 'two words', ...tagList('small', 3)],
      medium: tagList('medium', 5),
      popular: tagList('popular', 5),
    });

    const generator = new HashtagGenerator(llm);
    const result = await generator.generate(topic, settings, 'post-1');

    expect(result).toContain('#alreadyhashed');
    expect(result).toContain('#twowords');
  });

  it('throws when the LLM response fails schema validation', async () => {
    const llm = new FakeLlmProvider();
    llm.enqueueJson({ small: [], medium: [], popular: [] });

    const generator = new HashtagGenerator(llm);
    await expect(generator.generate(topic, settings, 'post-1')).rejects.toThrow(/schema validation/i);
  });
});
