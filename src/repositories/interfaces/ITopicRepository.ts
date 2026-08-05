import type { NewTopic, Topic, TopicCategory } from '../../entities/Topic.js';

export interface ITopicRepository {
  create(topic: NewTopic): Promise<Topic>;
  findRecentBySetting(settingId: string, limit?: number): Promise<Topic[]>;
  /** All titles ever planned for this setting — used for the dedup check. */
  findAllTitles(settingId: string): Promise<string[]>;
  findLastCategory(settingId: string): Promise<TopicCategory | null>;
  markUsed(topicId: string, usedAt: Date): Promise<Topic>;
  findPlannedForDate(settingId: string, date: Date): Promise<Topic | null>;
}
