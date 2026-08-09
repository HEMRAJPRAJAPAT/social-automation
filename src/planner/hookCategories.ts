import { HOOK_CATEGORIES, type HookCategory } from '../entities/Topic.js';

/** Same deterministic-rotation rationale as topicCategories.ts / contentFormats.ts. */
const ROTATION: readonly HookCategory[] = HOOK_CATEGORIES;

export function pickNextHookCategory(lastHookCategory: HookCategory | null): HookCategory {
  if (!lastHookCategory) return ROTATION[0] ?? 'curiosity';
  const lastIndex = ROTATION.indexOf(lastHookCategory);
  const nextIndex = (lastIndex + 1) % ROTATION.length;
  return ROTATION[nextIndex] ?? ROTATION[0] ?? 'curiosity';
}

export function hookCategoryPromptHint(category: HookCategory): string {
  const hints: Record<HookCategory, string> = {
    curiosity:
      'Curiosity hook — e.g. "Most beginners don\'t know this..." or "You probably use this every day without realizing it."',
    problem:
      'Problem hook — e.g. "Your app feels slow? This could be why." or "Still doing this manually?"',
    mistake:
      'Mistake hook — e.g. "Stop making this beginner mistake." or "If you\'re learning this, don\'t do this."',
    challenge:
      'Challenge hook — e.g. "Can you answer this in 5 seconds?" or "Most developers get this wrong."',
    surprise:
      'Surprise hook — e.g. "This tiny feature can save you hours." or "This does something surprisingly useful."',
    story: 'Story hook — e.g. "I wasted 3 hours because of this one mistake."',
    question:
      'Question hook — e.g. "Why does this happen?" or "Have you ever wondered why this works this way?"',
  };
  return hints[category];
}
