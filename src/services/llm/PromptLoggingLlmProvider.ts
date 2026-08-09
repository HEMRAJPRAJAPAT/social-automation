import type {
  IPromptHistoryRepository,
  PromptPurpose,
} from '../../repositories/interfaces/IPromptHistoryRepository.js';
import type { ILlmProvider, LlmGenerationOptions } from '../interfaces/ILlmProvider.js';

const KNOWN_PURPOSES: readonly PromptPurpose[] = [
  'TOPIC',
  'RESEARCH',
  'SCRIPT',
  'CAPTION',
  'HASHTAGS',
];

function toPromptPurpose(purpose: string | undefined): PromptPurpose | null {
  return KNOWN_PURPOSES.find((known) => known === purpose?.toUpperCase()) ?? null;
}

/**
 * Decorator around any ILlmProvider that transparently records every
 * prompt/response pair to `prompt_history` (spec table §12) without
 * requiring every AI service to know about the repository directly.
 */
export class PromptLoggingLlmProvider implements ILlmProvider {
  public readonly modelName: string;

  constructor(
    private readonly inner: ILlmProvider,
    private readonly promptHistoryRepository: IPromptHistoryRepository,
  ) {
    this.modelName = inner.modelName;
  }

  async generateText(prompt: string, options: LlmGenerationOptions = {}): Promise<string> {
    const response = await this.inner.generateText(prompt, options);
    await this.record(prompt, response, options);
    return response;
  }

  async generateJson<T>(prompt: string, options: LlmGenerationOptions = {}): Promise<T> {
    const response = await this.inner.generateJson<T>(prompt, options);
    await this.record(prompt, JSON.stringify(response), options);
    return response;
  }

  private async record(
    prompt: string,
    response: string,
    options: LlmGenerationOptions,
  ): Promise<void> {
    const purpose = toPromptPurpose(options.purpose);
    if (!purpose) return;

    await this.promptHistoryRepository.log({
      postId: options.postId,
      purpose,
      model: this.modelName,
      prompt,
      response,
    });
  }
}
