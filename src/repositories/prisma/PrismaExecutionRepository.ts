import type { Prisma, PrismaClient } from '@prisma/client';

import type {
  Execution,
  ExecutionStatus,
  ExecutionStepRecord,
  PipelineStepName,
  StepStatus,
} from '../../entities/Execution.js';
import type { IExecutionRepository } from '../interfaces/IExecutionRepository.js';

function toDayStart(date: Date): Date {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

interface PrismaExecutionWithSteps {
  id: string;
  settingId: string;
  postId: string | null;
  runDate: Date;
  status: ExecutionStatus;
  currentStep: string | null;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  steps: Array<{
    id: string;
    executionId: string;
    stepName: string;
    status: StepStatus;
    attempt: number;
    output: Prisma.JsonValue;
    errorMessage: string | null;
    startedAt: Date;
    finishedAt: Date | null;
  }>;
}

function toDomain(row: PrismaExecutionWithSteps): Execution {
  return {
    id: row.id,
    settingId: row.settingId,
    postId: row.postId,
    runDate: row.runDate,
    status: row.status,
    currentStep: row.currentStep as PipelineStepName | null,
    errorMessage: row.errorMessage,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    steps: row.steps.map((step) => ({
      id: step.id,
      executionId: step.executionId,
      stepName: step.stepName as PipelineStepName,
      status: step.status,
      attempt: step.attempt,
      output: step.output,
      errorMessage: step.errorMessage,
      startedAt: step.startedAt,
      finishedAt: step.finishedAt,
    })),
  };
}

export class PrismaExecutionRepository implements IExecutionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findOrCreateForToday(settingId: string, runDate: Date): Promise<Execution> {
    const day = toDayStart(runDate);
    const existing = await this.prisma.execution.findUnique({
      where: { settingId_runDate: { settingId, runDate: day } },
      include: { steps: true },
    });
    if (existing) return toDomain(existing);

    const created = await this.prisma.execution.create({
      data: { settingId, runDate: day, status: 'PENDING' },
      include: { steps: true },
    });
    return toDomain(created);
  }

  async deleteForToday(settingId: string, runDate: Date): Promise<void> {
    const day = toDayStart(runDate);
    const existing = await this.prisma.execution.findUnique({
      where: { settingId_runDate: { settingId, runDate: day } },
    });
    if (!existing) return;
    // execution_steps has ON DELETE RESTRICT on executionId, so steps must
    // go first or the Execution delete below fails with a FK violation.
    await this.prisma.executionStep.deleteMany({ where: { executionId: existing.id } });
    await this.prisma.execution.delete({ where: { id: existing.id } });
  }

  async setStatus(
    executionId: string,
    status: ExecutionStatus,
    patch: {
      currentStep?: PipelineStepName | null;
      errorMessage?: string | null;
      postId?: string;
    } = {},
  ): Promise<Execution> {
    const row = await this.prisma.execution.update({
      where: { id: executionId },
      data: {
        status,
        ...(patch.currentStep !== undefined ? { currentStep: patch.currentStep } : {}),
        ...(patch.errorMessage !== undefined ? { errorMessage: patch.errorMessage } : {}),
        ...(patch.postId !== undefined ? { postId: patch.postId } : {}),
        ...(status === 'SUCCEEDED' || status === 'FAILED' ? { finishedAt: new Date() } : {}),
      },
      include: { steps: true },
    });
    return toDomain(row);
  }

  async startStep(
    executionId: string,
    stepName: PipelineStepName,
    attempt: number,
  ): Promise<ExecutionStepRecord> {
    const row = await this.prisma.executionStep.upsert({
      where: { executionId_stepName: { executionId, stepName } },
      create: { executionId, stepName, status: 'RUNNING', attempt },
      update: {
        status: 'RUNNING',
        attempt,
        startedAt: new Date(),
        finishedAt: null,
        errorMessage: null,
      },
    });
    return {
      id: row.id,
      executionId: row.executionId,
      stepName: row.stepName as PipelineStepName,
      status: row.status,
      attempt: row.attempt,
      output: row.output,
      errorMessage: row.errorMessage,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
    };
  }

  async finishStep(
    executionId: string,
    stepName: PipelineStepName,
    status: StepStatus,
    output?: unknown,
    errorMessage?: string,
  ): Promise<ExecutionStepRecord> {
    const row = await this.prisma.executionStep.update({
      where: { executionId_stepName: { executionId, stepName } },
      data: {
        status,
        finishedAt: new Date(),
        output: output as Prisma.InputJsonValue,
        errorMessage: errorMessage ?? null,
      },
    });
    return {
      id: row.id,
      executionId: row.executionId,
      stepName: row.stepName as PipelineStepName,
      status: row.status,
      attempt: row.attempt,
      output: row.output,
      errorMessage: row.errorMessage,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
    };
  }

  async getCompletedStepOutput<T>(
    executionId: string,
    stepName: PipelineStepName,
  ): Promise<T | null> {
    const row = await this.prisma.executionStep.findUnique({
      where: { executionId_stepName: { executionId, stepName } },
    });
    if (!row || row.status !== 'SUCCEEDED') return null;
    return row.output as unknown as T;
  }

  async reapStale(olderThanMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMs);
    const errorMessage = 'orphaned: process restarted mid-execution';

    const stale = await this.prisma.execution.findMany({
      where: { status: 'RUNNING', startedAt: { lt: cutoff } },
    });

    for (const execution of stale) {
      await this.prisma.executionStep.updateMany({
        where: { executionId: execution.id, status: 'RUNNING' },
        data: { status: 'FAILED', finishedAt: new Date(), errorMessage },
      });
      await this.prisma.execution.update({
        where: { id: execution.id },
        data: { status: 'FAILED', errorMessage, finishedAt: new Date() },
      });
      if (execution.postId) {
        await this.prisma.post.update({
          where: { id: execution.postId },
          data: { status: 'FAILED', lastPublishError: errorMessage },
        });
      }
    }

    return stale.length;
  }
}
