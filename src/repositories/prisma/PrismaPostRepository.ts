import type { Post as PrismaPost, Prisma, PrismaClient } from '@prisma/client';

import type { NewPost, Post, PostStatus } from '../../entities/Post.js';
import type { ResearchResult } from '../../entities/ResearchResult.js';
import type { Script } from '../../entities/Script.js';
import type { IPostRepository } from '../interfaces/IPostRepository.js';

function toDomain(row: PrismaPost): Post {
  return {
    id: row.id,
    topicId: row.topicId,
    language: row.language,
    status: row.status,
    researchJson: row.researchJson as unknown as ResearchResult | null,
    script: row.script as unknown as Script | null,
    captionText: row.captionText,
    hashtags: row.hashtags,
    igTitle: row.igTitle,
    selectedVideoId: row.selectedVideoId,
    instagramMediaId: row.instagramMediaId,
    instagramContainerId: row.instagramContainerId,
    instagramPermalink: row.instagramPermalink,
    publishAttempts: row.publishAttempts,
    lastPublishError: row.lastPublishError,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PrismaPostRepository implements IPostRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(post: NewPost): Promise<Post> {
    const row = await this.prisma.post.create({
      data: {
        topicId: post.topicId,
        language: post.language,
        status: post.status,
        researchJson: post.researchJson as unknown as Prisma.InputJsonValue,
        script: post.script as unknown as Prisma.InputJsonValue,
        captionText: post.captionText,
        hashtags: post.hashtags ?? [],
        igTitle: post.igTitle,
        instagramMediaId: post.instagramMediaId,
        instagramContainerId: post.instagramContainerId,
        instagramPermalink: post.instagramPermalink,
        lastPublishError: post.lastPublishError,
        publishedAt: post.publishedAt,
      },
    });
    return toDomain(row);
  }

  async findById(id: string): Promise<Post | null> {
    const row = await this.prisma.post.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async update(id: string, patch: Partial<Post>): Promise<Post> {
    const row = await this.prisma.post.update({
      where: { id },
      data: {
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.researchJson !== undefined
          ? { researchJson: patch.researchJson as unknown as Prisma.InputJsonValue }
          : {}),
        ...(patch.script !== undefined
          ? { script: patch.script as unknown as Prisma.InputJsonValue }
          : {}),
        ...(patch.captionText !== undefined ? { captionText: patch.captionText } : {}),
        ...(patch.hashtags !== undefined ? { hashtags: patch.hashtags } : {}),
        ...(patch.igTitle !== undefined ? { igTitle: patch.igTitle } : {}),
        ...(patch.selectedVideoId !== undefined ? { selectedVideoId: patch.selectedVideoId } : {}),
        ...(patch.instagramMediaId !== undefined
          ? { instagramMediaId: patch.instagramMediaId }
          : {}),
        ...(patch.instagramContainerId !== undefined
          ? { instagramContainerId: patch.instagramContainerId }
          : {}),
        ...(patch.instagramPermalink !== undefined
          ? { instagramPermalink: patch.instagramPermalink }
          : {}),
        ...(patch.lastPublishError !== undefined
          ? { lastPublishError: patch.lastPublishError }
          : {}),
        ...(patch.publishedAt !== undefined ? { publishedAt: patch.publishedAt } : {}),
      },
    });
    return toDomain(row);
  }

  async setStatus(id: string, status: PostStatus, error: string | null = null): Promise<Post> {
    const row = await this.prisma.post.update({
      where: { id },
      data: {
        status,
        lastPublishError: error,
        ...(status === 'PUBLISHING' ? { publishAttempts: { increment: 1 } } : {}),
      },
    });
    return toDomain(row);
  }

  async recentCaptionHooks(limit: number): Promise<string[]> {
    const rows = await this.prisma.post.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { script: true },
    });
    return rows
      .map((row) => (row.script as unknown as Script | null)?.hook)
      .filter((hook): hook is string => Boolean(hook));
  }
}
