export const PIPELINE_STEPS = [
  'PLAN_TOPIC',
  'RESEARCH',
  'SCRIPT',
  'VOICE',
  'VISUAL_PLAN',
  'MEDIA',
  'SUBTITLES',
  'COMPOSE_VIDEO',
  'CAPTION',
  'HASHTAGS',
  'PUBLISH',
  'PERSIST_METADATA',
] as const;

export type PipelineStepName = (typeof PIPELINE_STEPS)[number];

export type ExecutionStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'PARTIAL';
export type StepStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED';

export interface ExecutionStepRecord {
  id: string;
  executionId: string;
  stepName: PipelineStepName;
  status: StepStatus;
  attempt: number;
  output: unknown;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

export interface Execution {
  id: string;
  settingId: string;
  postId: string | null;
  runDate: Date;
  status: ExecutionStatus;
  currentStep: PipelineStepName | null;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  steps: ExecutionStepRecord[];
}

/** In-memory context threaded through the pipeline, accumulating each step's output. */
export interface ExecutionContext {
  executionId: string;
  settingId: string;
  runDate: Date;
  workDir: string;
}
