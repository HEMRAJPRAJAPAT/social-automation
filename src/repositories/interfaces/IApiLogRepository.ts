export interface ApiLogEntry {
  provider: string;
  endpoint: string;
  method: string;
  statusCode?: number;
  latencyMs: number;
  attempt: number;
  success: boolean;
  errorMessage?: string;
  requestSummary?: Record<string, unknown>;
}

export interface IApiLogRepository {
  log(entry: ApiLogEntry): Promise<void>;
  recentFailureRate(provider: string, sinceMinutes: number): Promise<number>;
}
