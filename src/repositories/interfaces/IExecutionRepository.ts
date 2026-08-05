import type {
  Execution,
  ExecutionStatus,
  ExecutionStepRecord,
  PipelineStepName,
  StepStatus,
} from '../../entities/Execution.js';

export interface IExecutionRepository {
  findOrCreateForToday(settingId: string, runDate: Date): Promise<Execution>;
  setStatus(
    executionId: string,
    status: ExecutionStatus,
    patch?: {
      currentStep?: PipelineStepName | null;
      errorMessage?: string | null;
      postId?: string;
    },
  ): Promise<Execution>;
  startStep(
    executionId: string,
    stepName: PipelineStepName,
    attempt: number,
  ): Promise<ExecutionStepRecord>;
  finishStep(
    executionId: string,
    stepName: PipelineStepName,
    status: StepStatus,
    output?: unknown,
    errorMessage?: string,
  ): Promise<ExecutionStepRecord>;
  getCompletedStepOutput<T>(executionId: string, stepName: PipelineStepName): Promise<T | null>;
}
