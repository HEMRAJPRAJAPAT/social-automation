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
}

export type NewTopic = Omit<Topic, 'id' | 'createdAt'>;
