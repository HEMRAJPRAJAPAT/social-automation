import { CONTENT_FORMATS, type ContentFormat } from '../entities/Topic.js';

/**
 * Fixed rotation across reusable Reel structures, same rationale as
 * topicCategories.ts's category rotation: deterministic cycling guarantees
 * every format appears before any repeats.
 */
const ROTATION: readonly ContentFormat[] = CONTENT_FORMATS;

export function pickNextFormat(lastFormat: ContentFormat | null): ContentFormat {
  if (!lastFormat) return ROTATION[0] ?? 'beginner-explanation';
  const lastIndex = ROTATION.indexOf(lastFormat);
  const nextIndex = (lastIndex + 1) % ROTATION.length;
  return ROTATION[nextIndex] ?? ROTATION[0] ?? 'beginner-explanation';
}

export function formatPromptHint(format: ContentFormat): string {
  const hints: Record<ContentFormat, string> = {
    'quick-tip': 'Quick Tip: hook, one specific actionable tip, a concrete example, a short CTA.',
    mistake:
      'Mistake: name a common mistake, explain why it happens and what it costs you, then the correct approach with an example.',
    'beginner-explanation':
      'Beginner Explanation: introduce the concept, ground it in a real-world analogy a total beginner would get, then a simple example.',
    'did-you-know':
      'Did You Know: open with a surprising, genuinely useful fact, explain why it matters, then a short explanation of the mechanism.',
    'before-after':
      'Before vs After: show the bad/naive approach, explain why it is bad, then the better approach and the concrete result.',
    'myth-reality':
      'Myth vs Reality: state a common belief people have, correct it with the reality, then explain why the misconception exists.',
    challenge:
      'Challenge: pose a question or puzzle, give the viewer a beat to think, then reveal the answer and explain the reasoning.',
    'mini-story':
      'Mini Story: a brief first-person situation, the problem that came up, what was discovered, and the one lesson learned.',
  };
  return hints[format];
}
