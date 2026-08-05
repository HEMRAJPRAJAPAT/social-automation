import type { PrismaClient } from '@prisma/client';

import type {
  IPromptHistoryRepository,
  PromptHistoryEntry,
  PromptPurpose,
} from '../interfaces/IPromptHistoryRepository.js';

export class PrismaPromptHistoryRepository implements IPromptHistoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async log(entry: PromptHistoryEntry): Promise<void> {
    await this.prisma.promptHistory.create({
      data: {
        postId: entry.postId,
        purpose: entry.purpose,
        model: entry.model,
        prompt: entry.prompt,
        response: entry.response,
        tokensUsed: entry.tokensUsed,
      },
    });
  }

  async recentHooksForPurpose(purpose: PromptPurpose, limit: number): Promise<string[]> {
    const rows = await this.prisma.promptHistory.findMany({
      where: { purpose },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { response: true },
    });
    return rows.map((row) => row.response);
  }
}
