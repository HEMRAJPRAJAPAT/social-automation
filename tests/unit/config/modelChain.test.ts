import { describe, expect, it } from 'vitest';

import { modelChain } from '../../../src/config/modelChain.js';

describe('modelChain', () => {
  it('puts the primary model first, then the fallbacks in order', () => {
    expect(modelChain('gemini-flash-latest', 'gemini-flash-lite-latest,gemini-3.1-flash-lite')).toEqual([
      'gemini-flash-latest',
      'gemini-flash-lite-latest',
      'gemini-3.1-flash-lite',
    ]);
  });

  it('drops a fallback that repeats the primary, so an overloaded model is not tried twice', () => {
    // Render has GEMINI_TEXT_MODEL=gemini-flash-lite-latest (changed Oct 7),
    // which is also the first default fallback.
    expect(
      modelChain('gemini-flash-lite-latest', 'gemini-flash-lite-latest,gemini-3.1-flash-lite'),
    ).toEqual(['gemini-flash-lite-latest', 'gemini-3.1-flash-lite']);
  });

  it('ignores blanks and surrounding spaces', () => {
    expect(modelChain('', ' a , ,b ,')).toEqual(['a', 'b']);
  });
});
