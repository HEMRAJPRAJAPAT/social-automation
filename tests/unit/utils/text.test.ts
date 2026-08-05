import { describe, expect, it } from 'vitest';

import {
  countWords,
  isNearDuplicate,
  jaccardSimilarity,
  normalizeTitle,
  slugify,
  truncateWords,
} from '../../../src/utils/text.js';

describe('slugify', () => {
  it('lowercases, strips punctuation, and hyphenates', () => {
    expect(slugify('5 React Hooks You Should Know!')).toBe('5-react-hooks-you-should-know');
  });

  it('collapses repeated whitespace and hyphens', () => {
    expect(slugify('Hello   World -- Test')).toBe('hello-world-test');
  });
});

describe('normalizeTitle', () => {
  it('produces a comparable lowercase, punctuation-free form', () => {
    expect(normalizeTitle("Docker vs. Kubernetes: What's Better?")).toBe('docker vs kubernetes what s better');
  });
});

describe('jaccardSimilarity', () => {
  it('returns 1 for identical strings', () => {
    expect(jaccardSimilarity('React hooks explained', 'React hooks explained')).toBe(1);
  });

  it('returns 0 for completely disjoint strings', () => {
    expect(jaccardSimilarity('React hooks', 'Docker containers')).toBe(0);
  });

  it('returns a partial score for overlapping strings', () => {
    const score = jaccardSimilarity('top 5 react hooks', 'top 5 vue composables');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });
});

describe('isNearDuplicate', () => {
  it('flags a title that is a close rephrasing of an existing one', () => {
    const existing = ['5 React Hooks You Should Know'];
    expect(isNearDuplicate('5 React Hooks You Should Know Today', existing, 0.6)).toBe(true);
  });

  it('does not flag a genuinely different title', () => {
    const existing = ['5 React Hooks You Should Know'];
    expect(isNearDuplicate('Docker Compose for Beginners', existing, 0.6)).toBe(false);
  });

  it('returns false when there is no history', () => {
    expect(isNearDuplicate('Anything', [], 0.6)).toBe(false);
  });
});

describe('truncateWords', () => {
  it('leaves short text untouched', () => {
    expect(truncateWords('short text here', 10)).toBe('short text here');
  });

  it('truncates and adds an ellipsis when over the limit', () => {
    expect(truncateWords('one two three four five', 3)).toBe('one two three…');
  });
});

describe('countWords', () => {
  it('counts whitespace-separated words', () => {
    expect(countWords('one two three')).toBe(3);
  });

  it('ignores extra whitespace', () => {
    expect(countWords('  one   two  ')).toBe(2);
  });
});
