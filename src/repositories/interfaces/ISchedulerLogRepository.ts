export type SchedulerJobStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED';

export interface SchedulerLogEntry {
  jobName: string;
  status: SchedulerJobStatus;
  message?: string;
  executionId?: string;
  startedAt: Date;
  finishedAt?: Date;
}

export interface ISchedulerLogRepository {
  log(entry: SchedulerLogEntry): Promise<void>;
}
