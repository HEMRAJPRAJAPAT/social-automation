import type { Prisma, PrismaClient } from '@prisma/client';

import type { ApiLogEntry, IApiLogRepository } from '../interfaces/IApiLogRepository.js';

export class PrismaApiLogRepository implements IApiLogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async log(entry: ApiLogEntry): Promise<void> {
    await this.prisma.apiLog.create({
      data: {
        provider: entry.provider,
        endpoint: entry.endpoint,
        method: entry.method,
        statusCode: entry.statusCode,
        latencyMs: entry.latencyMs,
        attempt: entry.attempt,
        success: entry.success,
        errorMessage: entry.errorMessage,
        requestSummary: entry.requestSummary as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async recentFailureRate(provider: string, sinceMinutes: number): Promise<number> {
    const since = new Date(Date.now() - sinceMinutes * 60_000);
    const [total, failed] = await Promise.all([
      this.prisma.apiLog.count({ where: { provider, createdAt: { gte: since } } }),
      this.prisma.apiLog.count({ where: { provider, createdAt: { gte: since }, success: false } }),
    ]);
    return total === 0 ? 0 : failed / total;
  }
}
