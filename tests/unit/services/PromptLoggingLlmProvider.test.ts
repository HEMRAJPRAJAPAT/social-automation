import { describe, expect, it } from 'vitest';

import { PromptLoggingLlmProvider } from '../../../src/services/llm/PromptLoggingLlmProvider.js';
import { FakeLlmProvider, makeFakePromptHistoryRepository } from '../../mocks/fakes.js';

describe('PromptLoggingLlmProvider', () => {
  it('logs a prompt_history entry for a recognized purpose', async () => {
    const inner = new FakeLlmProvider();
    inner.enqueueText('a response');
    const promptHistoryRepository = makeFakePromptHistoryRepository();

    const decorated = new PromptLoggingLlmProvider(inner, promptHistoryRepository);
    await decorated.generateText('a prompt', { purpose: 'TOPIC', postId: 'post-1' });

    expect(promptHistoryRepository.log).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'TOPIC', postId: 'post-1', prompt: 'a prompt', response: 'a response' }),
    );
  });

  it('does not log when no purpose is provided', async () => {
    const inner = new FakeLlmProvider();
    inner.enqueueText('a response');
    const promptHistoryRepository = makeFakePromptHistoryRepository();

    const decorated = new PromptLoggingLlmProvider(inner, promptHistoryRepository);
    await decorated.generateText('a prompt');

    expect(promptHistoryRepository.log).not.toHaveBeenCalled();
  });

  it('serializes JSON responses before logging', async () => {
    const inner = new FakeLlmProvider();
    inner.enqueueJson({ hello: 'world' });
    const promptHistoryRepository = makeFakePromptHistoryRepository();

    const decorated = new PromptLoggingLlmProvider(inner, promptHistoryRepository);
    await decorated.generateJson('a prompt', { purpose: 'SCRIPT' });

    expect(promptHistoryRepository.log).toHaveBeenCalledWith(
      expect.objectContaining({ response: JSON.stringify({ hello: 'world' }) }),
    );
  });

  it('passes through the inner provider modelName', () => {
    const inner = new FakeLlmProvider();
    const decorated = new PromptLoggingLlmProvider(inner, makeFakePromptHistoryRepository());
    expect(decorated.modelName).toBe(inner.modelName);
  });

  it('is case-insensitive when matching known purposes', async () => {
    const inner = new FakeLlmProvider();
    inner.enqueueText('response');
    const promptHistoryRepository = makeFakePromptHistoryRepository();
    const decorated = new PromptLoggingLlmProvider(inner, promptHistoryRepository);

    await decorated.generateText('prompt', { purpose: 'topic' });

    expect(promptHistoryRepository.log).toHaveBeenCalledTimes(1);
  });
});
