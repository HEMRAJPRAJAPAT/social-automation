import type {
  Execution,
  ExecutionStatus,
  ExecutionStepRecord,
  PipelineStepName,
  StepStatus,
} from '../../entities/Execution.js';

export interface IExecutionRepository {
  findOrCreateForToday(settingId: string, runDate: Date): Promise<Execution>;
  /** Wipes today's Execution (if any) so a subsequent findOrCreateForToday starts fresh. */
  deleteForToday(settingId: string, runDate: Date): Promise<void>;
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
  /**
   * Marks any Execution still RUNNING with a startedAt older than
   * `olderThanMs` as FAILED (recovers state left behind by a process that
   * died mid-run, e.g. an OOM kill), along with its in-flight step and post.
   * Returns how many executions were reaped.
   */
  reapStale(olderThanMs: number): Promise<number>;
}
