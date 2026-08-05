export interface LlmGenerationOptions {
  temperature?: number;
  maxOutputTokens?: number;
  /** Free-form label used for api_logs / prompt_history bookkeeping. */
  purpose?: string;
  /** Post this generation is for, if any — attached to the prompt_history row. */
  postId?: string;
}

/**
 * Port for any large-language-model backend. The pipeline depends only on
 * this interface (never on `GeminiLlmProvider` directly) so a different
 * provider can be swapped in later by changing one line in `container.ts`.
 */
export interface ILlmProvider {
  readonly modelName: string;

  generateText(prompt: string, options?: LlmGenerationOptions): Promise<string>;

  /**
   * Generates text and parses it as JSON. The prompt is expected to instruct
   * the model to return JSON only; this method strips code fences defensively
   * and throws a descriptive error if parsing fails so callers can retry.
   */
  generateJson<T>(prompt: string, options?: LlmGenerationOptions): Promise<T>;
}
