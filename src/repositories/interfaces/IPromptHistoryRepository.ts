export type PromptPurpose = 'TOPIC' | 'RESEARCH' | 'SCRIPT' | 'CAPTION' | 'HASHTAGS';

export interface PromptHistoryEntry {
  postId?: string;
  purpose: PromptPurpose;
  model: string;
  prompt: string;
  response: string;
  tokensUsed?: number;
}

export interface IPromptHistoryRepository {
  log(entry: PromptHistoryEntry): Promise<void>;
  recentHooksForPurpose(purpose: PromptPurpose, limit: number): Promise<string[]>;
}
