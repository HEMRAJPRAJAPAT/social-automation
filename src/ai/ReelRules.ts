import type { Script } from '../entities/Script.js';
import { countWords } from '../utils/text.js';

/**
 * Deterministic Reel checks adapted from the instagram-agent-skill pack
 * (https://github.com/Jakeschincariol/instagram-agent-skill, MIT, Jake
 * Schincariol): its hook scorer wants a hook of 12 words or fewer and its beat
 * sheet flags any beat held on screen for more than 4 seconds.
 *
 * Only the language-neutral rules are taken. The pack's hook "stakes" and
 * "address" scores and its AI-phrase lexicon are English word lists: run on
 * this project's Hinglish scripts they marked a hook WEAK (44) whose exact
 * English translation scored STRONG (85.6), so they would reject good scripts
 * and spend Gemini quota on retries for nothing.
 *
 * These complement ContentEvaluator rather than replace it: the evaluator is
 * Gemini grading its own output, which is what let a 25-word "3-second" hook
 * through on Oct 7. A word count can't be talked out of its verdict.
 */

/** Average natural speaking pace for narrated short-form video, in words/second. */
export const SPEAKING_WORDS_PER_SECOND = 2.5;

/** The pack's hook-length ceiling; past this the hook lands after the viewer has decided. */
export const HOOK_MAX_WORDS = 12;

/** The pack's beat ceiling: each script line is one b-roll shot, and a static shot is where people leave. */
export const LINE_MAX_SECONDS = 4;

export const LINE_MAX_WORDS = Math.floor(LINE_MAX_SECONDS * SPEAKING_WORDS_PER_SECOND);

function seconds(words: number): string {
  return (words / SPEAKING_WORDS_PER_SECOND).toFixed(1);
}

/**
 * Returns one plain-language problem per broken rule, worded so it can be fed
 * straight back to the script generator as a fix instruction. Empty means the
 * script passes.
 */
export function checkScriptRules(script: Script): string[] {
  const violations: string[] = [];

  const hookWords = countWords(script.hook);
  if (hookWords > HOOK_MAX_WORDS) {
    violations.push(
      `Hook is ${hookWords} words (~${seconds(hookWords)}s to say); ` +
        `cut it to ${HOOK_MAX_WORDS} words or fewer so it lands in the first 3 seconds.`,
    );
  }

  script.lines.forEach((line, position) => {
    const words = countWords(line.text);
    if (words > LINE_MAX_WORDS) {
      violations.push(
        `Line ${position + 1} is ${words} words (~${seconds(words)}s on one shot); ` +
          `split it so no line is over ${LINE_MAX_WORDS} words.`,
      );
    }
  });

  return violations;
}

// Zero-width spaces/joiners, word joiner and invisible operators, BOM, soft
// hyphen, Mongolian vowel separator, and Unicode tag characters: invisible in
// every editor, survive copy-paste, and are a known machine-text fingerprint.
const INVISIBLE_CHARS = /[\u200B-\u200F\u2060-\u2064\uFEFF\u00AD\u180E\u{E0000}-\u{E007F}]/gu;
const HARD_SPACES = /[\u00A0\u2007\u202F]/g;

/**
 * The pack's safe, mechanical cleanup only. Its phrase-rewriting pass is not
 * used: it is English-only, and in testing it turned "mindset. Stop
 * scrolling!" into "mindset.!", which must never reach a published caption.
 */
export function sanitizeCaptionText(text: string): string {
  return text
    .replace(INVISIBLE_CHARS, '')
    .replace(HARD_SPACES, ' ')
    .replace(/\s*\u2014\s*/g, ', ')
    .replace(/\u2013/g, '-');
}
