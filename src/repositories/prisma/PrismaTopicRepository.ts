import type { PrismaClient, Topic as PrismaTopic } from '@prisma/client';

import type { NewTopic, Topic, TopicCategory } from '../../entities/Topic.js';
import type { ITopicRepository } from '../interfaces/ITopicRepository.js';

function toDomain(row: PrismaTopic): Topic {
  return {
    id: row.id,
    settingId: row.settingId,
    title: row.title,
    normalizedTitle: row.normalizedTitle,
    slug: row.slug,
    category: row.category,
    hook: row.hook,
    summary: row.summary,
    keywords: row.keywords,
    status: row.status,
    plannedFor: row.plannedFor,
    usedAt: row.usedAt,
    createdAt: row.createdAt,
  };
}

export class PrismaTopicRepository implements ITopicRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(topic: NewTopic): Promise<Topic> {
    const row = await this.prisma.topic.create({
      data: {
        settingId: topic.settingId,
        title: topic.title,
        normalizedTitle: topic.normalizedTitle,
        slug: topic.slug,
        category: topic.category,
        hook: topic.hook,
        summary: topic.summary,
        keywords: topic.keywords,
        status: topic.status,
        plannedFor: topic.plannedFor,
        usedAt: topic.usedAt,
      },
    });
    return toDomain(row);
  }

  async findRecentBySetting(settingId: string, limit = 30): Promise<Topic[]> {
    const rows = await this.prisma.topic.findMany({
      where: { settingId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(toDomain);
  }

  async findAllTitles(settingId: string): Promise<string[]> {
    const rows = await this.prisma.topic.findMany({
      where: { settingId },
      select: { title: true },
    });
    return rows.map((row) => row.title);
  }

  async findLastCategory(settingId: string): Promise<TopicCategory | null> {
    const row = await this.prisma.topic.findFirst({
      where: { settingId },
      orderBy: { createdAt: 'desc' },
      select: { category: true },
    });
    return row?.category ?? null;
  }

  async markUsed(topicId: string, usedAt: Date): Promise<Topic> {
    const row = await this.prisma.topic.update({
      where: { id: topicId },
      data: { status: 'USED', usedAt },
    });
    return toDomain(row);
  }

  async findPlannedForDate(settingId: string, date: Date): Promise<Topic | null> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const row = await this.prisma.topic.findFirst({
      where: { settingId, plannedFor: { gte: startOfDay, lt: endOfDay } },
      orderBy: { createdAt: 'desc' },
    });
    return row ? toDomain(row) : null;
  }
}
