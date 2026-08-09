import { describe, expect, it } from 'vitest';

import {
  countWords,
  escapeFfmpegFilterValue,
  isNearDuplicate,
  jaccardSimilarity,
  normalizeTitle,
  sanitizeDrawtextLabel,
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

describe('escapeFfmpegFilterValue', () => {
  it('escapes an apostrophe using close-escape-reopen quoting, not a bare backslash', () => {
    // Verified empirically: a bare `\'` silently breaks ffmpeg drawtext.
    expect(escapeFfmpegFilterValue("User's Cache")).toBe("User'\\''s Cache");
  });

  it('escapes colons and percent signs', () => {
    expect(escapeFfmpegFilterValue('a:b%c')).toBe('a\\:b\\%c');
  });

  it('leaves plain text untouched', () => {
    expect(escapeFfmpegFilterValue('plain text')).toBe('plain text');
  });
});

describe('sanitizeDrawtextLabel', () => {
  it('strips characters outside the safe set', () => {
    expect(sanitizeDrawtextLabel('50% faster: really!')).toBe('50 faster really!');
  });

  it('keeps apostrophes, hyphens, and basic punctuation', () => {
    expect(sanitizeDrawtextLabel("It's a trade-off, right?")).toBe("It's a trade-off, right?");
  });

  it('truncates to the max word count and then the max length', () => {
    const long = Array.from({ length: 20 }, (_, i) => `word${i}`).join(' ');
    const result = sanitizeDrawtextLabel(long, 200);
    // truncateWords caps at 8 words, appending an ellipsis to the last one.
    expect(result.split(' ')).toHaveLength(8);
    expect(result.endsWith('…')).toBe(true);
  });
});
