import { vi } from 'vitest';

import type { ContentSettings } from '../../src/entities/ContentSettings.js';
import type { Execution, ExecutionStepRecord, PipelineStepName, StepStatus } from '../../src/entities/Execution.js';
import type { MediaSearchResult } from '../../src/entities/MediaAsset.js';
import type { Post } from '../../src/entities/Post.js';
import type { PublishResult } from '../../src/entities/PublishResult.js';
import type { RenderedVideo } from '../../src/entities/RenderedVideo.js';
import type { Topic } from '../../src/entities/Topic.js';
import type { VoiceOverResult } from '../../src/entities/VoiceOver.js';
import type { IPublisher, PublishReelInput } from '../../src/instagram/IPublisher.js';
import type { IApiLogRepository } from '../../src/repositories/interfaces/IApiLogRepository.js';
import type { IExecutionRepository } from '../../src/repositories/interfaces/IExecutionRepository.js';
import type { IMediaAssetRepository } from '../../src/repositories/interfaces/IMediaAssetRepository.js';
import type { IPostRepository } from '../../src/repositories/interfaces/IPostRepository.js';
import type { IPromptHistoryRepository } from '../../src/repositories/interfaces/IPromptHistoryRepository.js';
import type { ISchedulerLogRepository } from '../../src/repositories/interfaces/ISchedulerLogRepository.js';
import type { ITopicRepository } from '../../src/repositories/interfaces/ITopicRepository.js';
import type { IVideoRepository, VideoRecord } from '../../src/repositories/interfaces/IVideoRepository.js';
import type { ILlmProvider } from '../../src/services/interfaces/ILlmProvider.js';
import type { IMediaProvider } from '../../src/services/interfaces/IMediaProvider.js';
import type { IVoiceProvider, VoiceSynthesisOptions } from '../../src/services/interfaces/IVoiceProvider.js';
import type { IStorageProvider, StoredFile } from '../../src/storage/IStorageProvider.js';

export function makeContentSettings(overrides: Partial<ContentSettings> = {}): ContentSettings {
  return {
    id: 'setting-1',
    key: 'default',
    niche: 'AI for Developers',
    language: 'en',
    postingFrequency: 'daily',
    videoDurationSeconds: 45,
    writingStyle: 'friendly, concise',
    cronExpression: '0 9 * * *',
    timezone: 'UTC',
    isActive: true,
    envPrefix: null,
    ...overrides,
  };
}

export function makeTopic(overrides: Partial<Topic> = {}): Topic {
  return {
    id: 'topic-1',
    settingId: 'setting-1',
    title: 'Test Topic',
    normalizedTitle: 'test topic',
    slug: 'test-topic',
    category: 'TUTORIAL',
    hook: 'Did you know this?',
    summary: 'A summary of the topic.',
    keywords: ['test', 'topic'],
    status: 'PLANNED',
    plannedFor: new Date('2026-01-01T00:00:00Z'),
    usedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/** In-memory fake ILlmProvider — queue responses with `enqueueJson`/`enqueueText`. */
export class FakeLlmProvider implements ILlmProvider {
  public readonly modelName = 'fake-model';
  private jsonQueue: unknown[] = [];
  private textQueue: string[] = [];
  public readonly calls: Array<{ prompt: string; purpose?: string }> = [];

  enqueueJson(value: unknown): void {
    this.jsonQueue.push(value);
  }

  enqueueText(value: string): void {
    this.textQueue.push(value);
  }

  async generateText(prompt: string, options: { purpose?: string } = {}): Promise<string> {
    this.calls.push({ prompt, purpose: options.purpose });
    const next = this.textQueue.shift();
    if (next === undefined) throw new Error('FakeLlmProvider: no queued text response');
    return next;
  }

  async generateJson<T>(prompt: string, options: { purpose?: string } = {}): Promise<T> {
    this.calls.push({ prompt, purpose: options.purpose });
    if (this.jsonQueue.length === 0) throw new Error('FakeLlmProvider: no queued JSON response');
    return this.jsonQueue.shift() as T;
  }
}

export function makeFakeApiLogRepository(): IApiLogRepository {
  return {
    log: vi.fn(async () => undefined),
    recentFailureRate: vi.fn(async () => 0),
  };
}

export function makeFakeTopicRepository(overrides: Partial<ITopicRepository> = {}): ITopicRepository {
  return {
    create: vi.fn(async (topic) => ({ ...topic, id: 'topic-1', createdAt: new Date() }) as Topic),
    findRecentBySetting: vi.fn(async () => []),
    findAllTitles: vi.fn(async () => []),
    findLastCategory: vi.fn(async () => null),
    markUsed: vi.fn(async (id) => makeTopic({ id, status: 'USED', usedAt: new Date() })),
    findPlannedForDate: vi.fn(async () => null),
    ...overrides,
  };
}

export function makeFakePostRepository(overrides: Partial<IPostRepository> = {}): IPostRepository {
  const posts = new Map<string, Post>();
  return {
    create: vi.fn(async (post) => {
      const id = `post-${posts.size + 1}`;
      const created: Post = {
        id,
        createdAt: new Date(),
        updatedAt: new Date(),
        publishAttempts: 0,
        hashtags: post.hashtags ?? [],
        ...post,
      };
      posts.set(id, created);
      return created;
    }),
    findById: vi.fn(async (id) => posts.get(id) ?? null),
    update: vi.fn(async (id, patch) => {
      const existing = posts.get(id);
      if (!existing) throw new Error(`no fake post ${id}`);
      const updated = { ...existing, ...patch, updatedAt: new Date() };
      posts.set(id, updated);
      return updated;
    }),
    setStatus: vi.fn(async (id, status, error) => {
      const existing = posts.get(id);
      if (!existing) throw new Error(`no fake post ${id}`);
      const updated = { ...existing, status, lastPublishError: error ?? null };
      posts.set(id, updated);
      return updated;
    }),
    recentCaptionHooks: vi.fn(async () => []),
    ...overrides,
  };
}

export function makeFakeVideoRepository(overrides: Partial<IVideoRepository> = {}): IVideoRepository {
  return {
    create: vi.fn(
      async (postId, video): Promise<VideoRecord> => ({ ...video, id: 'video-1', postId }),
    ),
    markSelected: vi.fn(
      async (videoId, postId): Promise<VideoRecord> => ({
        id: videoId,
        postId,
        filePath: '/tmp/out.mp4',
        publicUrl: null,
        subtitlesPath: '/tmp/out.srt',
        durationSeconds: 30,
        width: 1080,
        height: 1920,
        fileSizeBytes: 1000,
        variantLabel: 'default',
        renderStatus: 'DONE',
      }),
    ),
    findByPostId: vi.fn(async () => []),
    ...overrides,
  };
}

export function makeFakeSchedulerLogRepository(): ISchedulerLogRepository {
  return { log: vi.fn(async () => undefined) };
}

export function makeFakePromptHistoryRepository(): IPromptHistoryRepository {
  return {
    log: vi.fn(async () => undefined),
    recentHooksForPurpose: vi.fn(async () => []),
  };
}

export function makeFakeMediaAssetRepository(): IMediaAssetRepository {
  return {
    create: vi.fn(async (_postId, asset) => ({ ...asset, id: 'asset-1' })),
    findExistingChecksums: vi.fn(async () => []),
  };
}

export function makeFakeMediaProvider(name: 'PEXELS' | 'PIXABAY', results: MediaSearchResult[]): IMediaProvider {
  return {
    name,
    searchVideos: vi.fn(async () => results),
    searchImages: vi.fn(async () => []),
  };
}

export function makeFakeVoiceProvider(fixedDurationSeconds = 20): IVoiceProvider {
  return {
    name: 'fake-voice',
    synthesize: vi.fn(async (text: string, options: VoiceSynthesisOptions): Promise<VoiceOverResult> => ({
      audioFilePath: options.outputPath,
      durationSeconds: fixedDurationSeconds,
      sampleRateHz: 22050,
      provider: 'fake-voice',
      text,
    })),
  };
}

export function makeFakePublisher(overrides: Partial<IPublisher> = {}): IPublisher {
  return {
    platform: 'instagram',
    publishReel: vi.fn(
      async (_input: PublishReelInput): Promise<PublishResult> => ({
        instagramContainerId: 'container-1',
        instagramMediaId: 'media-1',
        instagramPermalink: 'https://instagram.com/reel/media-1',
        publishedAt: new Date('2026-01-01T12:00:00Z'),
      }),
    ),
    ...overrides,
  };
}

export function makeFakeStorageProvider(): IStorageProvider {
  return {
    name: 'fake-storage',
    save: vi.fn(async (_localPath: string, key: string): Promise<StoredFile> => ({
      key,
      url: `https://cdn.example.com/${key}`,
      path: `/storage/${key}`,
    })),
    getPublicUrl: vi.fn((key: string) => `https://cdn.example.com/${key}`),
  };
}

export function makeFakeRenderedVideo(overrides: Partial<RenderedVideo> = {}): RenderedVideo {
  return {
    filePath: '/tmp/output.mp4',
    publicUrl: null,
    subtitlesPath: '/tmp/subtitles.srt',
    durationSeconds: 30,
    width: 1080,
    height: 1920,
    fileSizeBytes: 12345,
    variantLabel: 'default',
    renderStatus: 'DONE',
    ...overrides,
  };
}

/** In-memory fake IExecutionRepository with real skip-on-resume semantics. */
export class FakeExecutionRepository implements IExecutionRepository {
  private execution: Execution;
  private steps = new Map<PipelineStepName, ExecutionStepRecord>();

  constructor(settingId = 'setting-1') {
    this.execution = {
      id: 'execution-1',
      settingId,
      postId: null,
      runDate: new Date('2026-01-01T00:00:00Z'),
      status: 'PENDING',
      currentStep: null,
      errorMessage: null,
      startedAt: new Date(),
      finishedAt: null,
      steps: [],
    };
  }

  async findOrCreateForToday(): Promise<Execution> {
    return { ...this.execution, steps: [...this.steps.values()] };
  }

  async setStatus(
    _executionId: string,
    status: Execution['status'],
    patch: { currentStep?: PipelineStepName | null; errorMessage?: string | null; postId?: string } = {},
  ): Promise<Execution> {
    this.execution = {
      ...this.execution,
      status,
      currentStep: patch.currentStep ?? this.execution.currentStep,
      errorMessage: patch.errorMessage ?? this.execution.errorMessage,
      postId: patch.postId ?? this.execution.postId,
    };
    return { ...this.execution, steps: [...this.steps.values()] };
  }

  async startStep(executionId: string, stepName: PipelineStepName, attempt: number): Promise<ExecutionStepRecord> {
    const record: ExecutionStepRecord = {
      id: `step-${stepName}`,
      executionId,
      stepName,
      status: 'RUNNING',
      attempt,
      output: null,
      errorMessage: null,
      startedAt: new Date(),
      finishedAt: null,
    };
    this.steps.set(stepName, record);
    return record;
  }

  async finishStep(
    executionId: string,
    stepName: PipelineStepName,
    status: StepStatus,
    output?: unknown,
    errorMessage?: string,
  ): Promise<ExecutionStepRecord> {
    const record: ExecutionStepRecord = {
      id: `step-${stepName}`,
      executionId,
      stepName,
      status,
      attempt: 1,
      output: output ?? null,
      errorMessage: errorMessage ?? null,
      startedAt: new Date(),
      finishedAt: new Date(),
    };
    this.steps.set(stepName, record);
    return record;
  }

  async getCompletedStepOutput<T>(_executionId: string, stepName: PipelineStepName): Promise<T | null> {
    const record = this.steps.get(stepName);
    if (!record || record.status !== 'SUCCEEDED') return null;
    return record.output as T;
  }

  /** Test helper: seed a step as already-completed, to exercise resume behavior. */
  seedCompletedStep(stepName: PipelineStepName, output: unknown): void {
    this.steps.set(stepName, {
      id: `step-${stepName}`,
      executionId: this.execution.id,
      stepName,
      status: 'SUCCEEDED',
      attempt: 1,
      output,
      errorMessage: null,
      startedAt: new Date(),
      finishedAt: new Date(),
    });
  }
}
