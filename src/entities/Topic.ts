export const TOPIC_CATEGORIES = [
  'TUTORIAL',
  'TIPS',
  'NEWS',
  'MISTAKES',
  'COMPARISON',
  'LIST',
  'BEGINNER',
  'ADVANCED',
] as const;

export type TopicCategory = (typeof TOPIC_CATEGORIES)[number];

export type TopicStatus = 'PLANNED' | 'USED' | 'SKIPPED';

/** Reusable Reel structures — the ScriptGenerator writes to whichever one the topic was planned for. */
export const CONTENT_FORMATS = [
  'quick-tip',
  'mistake',
  'beginner-explanation',
  'did-you-know',
  'before-after',
  'myth-reality',
  'challenge',
  'mini-story',
] as const;

export type ContentFormat = (typeof CONTENT_FORMATS)[number];

/** Opening-line strategies, rotated so consecutive Reels don't all open the same way. */
export const HOOK_CATEGORIES = [
  'curiosity',
  'problem',
  'mistake',
  'challenge',
  'surprise',
  'story',
  'question',
] as const;

export type HookCategory = (typeof HOOK_CATEGORIES)[number];

export const AUDIENCE_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type AudienceLevel = (typeof AUDIENCE_LEVELS)[number];

export interface Topic {
  id: string;
  settingId: string;
  title: string;
  normalizedTitle: string;
  slug: string;
  category: TopicCategory;
  hook: string;
  summary: string;
  keywords: string[];
  status: TopicStatus;
  plannedFor: Date;
  usedAt: Date | null;
  createdAt: Date;
  /** One specific, concrete thing the viewer should walk away knowing. */
  coreLesson: string;
  /** A short description of the visual concept for the hook (e.g. "customer -> waiter -> kitchen diagram"). */
  visualIdea: string;
  format: ContentFormat;
  difficulty: AudienceLevel;
  audienceLevel: AudienceLevel;
  hookCategory: HookCategory;
}

export type NewTopic = Omit<Topic, 'id' | 'createdAt'>;
