import { describe, expect, it } from 'vitest';

import { checkScriptRules, sanitizeCaptionText } from '../../../src/ai/ReelRules.js';
import type { Script } from '../../../src/entities/Script.js';

function makeScript(hook: string, lineTexts: string[]): Script {
  return {
    hook,
    lines: lineTexts.map((text, index) => ({ index, text, visualKeyword: 'b-roll' })),
    callToAction: 'Follow karo.',
    fullNarrationText: [hook, ...lineTexts].join(' '),
    estimatedDurationSeconds: 30,
    language: 'hi',
  };
}

describe('checkScriptRules', () => {
  it('passes a script with a short hook and short lines', () => {
    const script = makeScript('Mera API bill 40,000 rupaye tha. Ab 9,000 hai.', [
      'Ye ek prompt trick se hua.',
      'Static instructions hamesha shuru mein rakho.',
    ]);

    expect(checkScriptRules(script)).toEqual([]);
  });

  it('flags a hook that takes too long to say', () => {
    // The real Oct 7 hook: 25 words, roughly ten seconds of speech.
    const script = makeScript(
      'Aapka A P I bill bina baat ke badh raha hai, kyunki aap AI ko baar-baar wahi puraani kitaab padhne par majboor kar rahe ho.',
      ['Ye ek prompt trick se hua.'],
    );

    const violations = checkScriptRules(script);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/hook is 25 words/i);
  });

  it('flags each line that holds one shot on screen for too long', () => {
    const script = makeScript('Mera API bill 40,000 rupaye tha.', [
      'Short line.',
      'Socho ek librarian ko jo har naye customer ke liye shuru se moti rulebook loudly padh raha hai.',
    ]);

    const violations = checkScriptRules(script);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/line 2 is 18 words/i);
  });

  it('counts words the same way for Hinglish and English', () => {
    const hinglish = makeScript('Koi nahi batata ki aapke pehle 30 reels flop hone chahiye.', []);
    const english = makeScript('Nobody tells you your first 30 reels are supposed to flop.', []);

    expect(checkScriptRules(hinglish)).toEqual([]);
    expect(checkScriptRules(english)).toEqual([]);
  });
});

describe('sanitizeCaptionText', () => {
  it('removes invisible characters that mark text as machine-generated', () => {
    expect(sanitizeCaptionText('API\u200B bill\u200D kam\uFEFF hua\u00AD')).toBe('API bill kam hua');
  });

  it('turns em dashes into commas and en dashes into hyphens', () => {
    expect(sanitizeCaptionText('Ye trick \u2014 sach mein kaam karti hai. Page 3\u20135 dekho.')).toBe(
      'Ye trick, sach mein kaam karti hai. Page 3-5 dekho.',
    );
  });

  it('turns non-breaking spaces into normal spaces', () => {
    expect(sanitizeCaptionText('API\u00A0bill')).toBe('API bill');
  });

  it('leaves line breaks and emoji alone', () => {
    const text = 'Line one 🔥\n\nLine two';
    expect(sanitizeCaptionText(text)).toBe(text);
  });
});
