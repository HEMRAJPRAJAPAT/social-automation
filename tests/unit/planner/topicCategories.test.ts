import { describe, expect, it } from 'vitest';

import { TOPIC_CATEGORIES } from '../../../src/entities/Topic.js';
import { categoryPromptHint, pickNextCategory } from '../../../src/planner/topicCategories.js';

describe('pickNextCategory', () => {
  it('starts at the first category when there is no history', () => {
    expect(pickNextCategory(null)).toBe(TOPIC_CATEGORIES[0]);
  });

  it('advances to the next category in rotation order', () => {
    for (let i = 0; i < TOPIC_CATEGORIES.length - 1; i++) {
      expect(pickNextCategory(TOPIC_CATEGORIES[i]!)).toBe(TOPIC_CATEGORIES[i + 1]);
    }
  });

  it('wraps around after the last category', () => {
    const last = TOPIC_CATEGORIES[TOPIC_CATEGORIES.length - 1]!;
    expect(pickNextCategory(last)).toBe(TOPIC_CATEGORIES[0]);
  });

  it('cycles through every category exactly once before repeating', () => {
    const seen = new Set<string>();
    let current: (typeof TOPIC_CATEGORIES)[number] | null = null;
    for (let i = 0; i < TOPIC_CATEGORIES.length; i++) {
      current = pickNextCategory(current);
      seen.add(current);
    }
    expect(seen.size).toBe(TOPIC_CATEGORIES.length);
  });
});

describe('categoryPromptHint', () => {
  it('returns a non-empty hint for every category', () => {
    for (const category of TOPIC_CATEGORIES) {
      expect(categoryPromptHint(category).length).toBeGreaterThan(0);
    }
  });
});
