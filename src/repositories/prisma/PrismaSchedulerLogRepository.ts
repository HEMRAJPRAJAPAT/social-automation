import type { PrismaClient } from '@prisma/client';

import type {
  ISchedulerLogRepository,
  SchedulerLogEntry,
} from '../interfaces/ISchedulerLogRepository.js';

export class PrismaSchedulerLogRepository implements ISchedulerLogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async log(entry: SchedulerLogEntry): Promise<void> {
    await this.prisma.schedulerLog.create({
      data: {
        jobName: entry.jobName,
        status: entry.status,
        message: entry.message,
        executionId: entry.executionId,
        startedAt: entry.startedAt,
        finishedAt: entry.finishedAt,
      },
    });
  }
}
