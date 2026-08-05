import { TOPIC_CATEGORIES, type TopicCategory } from '../entities/Topic.js';

/**
 * Fixed rotation order across the required content mix (spec §2: "Mix
 * tutorials, tips, news, mistakes, comparisons, lists, beginner, advanced").
 * Picking the category deterministically (rather than randomly) guarantees
 * every category appears before any repeats, which a random pick could
 * fail to do for many days in a row.
 */
const ROTATION: readonly TopicCategory[] = TOPIC_CATEGORIES;

export function pickNextCategory(lastCategory: TopicCategory | null): TopicCategory {
  if (!lastCategory) return ROTATION[0] ?? 'TUTORIAL';
  const lastIndex = ROTATION.indexOf(lastCategory);
  const nextIndex = (lastIndex + 1) % ROTATION.length;
  return ROTATION[nextIndex] ?? ROTATION[0] ?? 'TUTORIAL';
}

export function categoryPromptHint(category: TopicCategory): string {
  const hints: Record<TopicCategory, string> = {
    TUTORIAL: 'a short step-by-step tutorial teaching one specific skill',
    TIPS: 'a punchy list of practical tips or shortcuts',
    NEWS: 'a summary of a recent, notable development, framed as "what happened and why it matters"',
    MISTAKES: 'a common mistake people make, why it happens, and how to avoid it',
    COMPARISON: 'a head-to-head comparison between two tools, approaches, or concepts',
    LIST: 'a numbered list of items (tools, resources, techniques) worth knowing',
    BEGINNER: 'a beginner-friendly explanation of a foundational concept',
    ADVANCED: 'an advanced, nuanced insight for experienced practitioners',
  };
  return hints[category];
}
