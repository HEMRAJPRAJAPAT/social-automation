import { CaptionGenerator } from './ai/CaptionGenerator.js';
import { HashtagGenerator } from './ai/HashtagGenerator.js';
import { HeuristicSubtitleTimingStrategy } from './ai/HeuristicSubtitleTimingStrategy.js';
import { ResearchService } from './ai/ResearchService.js';
import { ScriptGenerator } from './ai/ScriptGenerator.js';
import { SubtitleGenerator } from './ai/SubtitleGenerator.js';
import { env, contentDefaults } from './config/env.js';
import { prisma } from './db/prisma.js';
import type { ContentSettings } from './entities/ContentSettings.js';
import { InstagramGraphPublisher } from './instagram/InstagramGraphPublisher.js';
import type { IPublisher } from './instagram/IPublisher.js';
import { NullPublisher } from './instagram/NullPublisher.js';
import { PipelineOrchestrator } from './pipeline/PipelineOrchestrator.js';
import { TopicPlanner } from './planner/TopicPlanner.js';
import { PrismaApiLogRepository } from './repositories/prisma/PrismaApiLogRepository.js';
import { PrismaExecutionRepository } from './repositories/prisma/PrismaExecutionRepository.js';
import { PrismaMediaAssetRepository } from './repositories/prisma/PrismaMediaAssetRepository.js';
import { PrismaPostRepository } from './repositories/prisma/PrismaPostRepository.js';
import { PrismaPromptHistoryRepository } from './repositories/prisma/PrismaPromptHistoryRepository.js';
import { PrismaSchedulerLogRepository } from './repositories/prisma/PrismaSchedulerLogRepository.js';
import { PrismaSettingsRepository } from './repositories/prisma/PrismaSettingsRepository.js';
import { PrismaTopicRepository } from './repositories/prisma/PrismaTopicRepository.js';
import { PrismaVideoRepository } from './repositories/prisma/PrismaVideoRepository.js';
import type { IMediaProvider } from './services/interfaces/IMediaProvider.js';
import type { IVoiceProvider } from './services/interfaces/IVoiceProvider.js';
import { GeminiLlmProvider } from './services/llm/GeminiLlmProvider.js';
import { PromptLoggingLlmProvider } from './services/llm/PromptLoggingLlmProvider.js';
import { MediaSourcingService } from './services/media/MediaSourcingService.js';
import { PexelsMediaProvider } from './services/media/PexelsMediaProvider.js';
import { PixabayMediaProvider } from './services/media/PixabayMediaProvider.js';
import { EspeakVoiceProvider } from './services/voice/EspeakVoiceProvider.js';
import { GeminiVoiceProvider } from './services/voice/GeminiVoiceProvider.js';
import type { IStorageProvider } from './storage/IStorageProvider.js';
import { LocalStorageProvider } from './storage/LocalStorageProvider.js';
import { ensureStorageDirs, OUTPUT_DIR } from './utils/fs.js';
import { VideoComposer } from './video/VideoComposer.js';

/**
 * Composition root (see ARCHITECTURE.md §3): the ONLY file that imports
 * concrete adapters. Every other module depends on interfaces. To swap a
 * provider, change its construction here — nothing else needs to change.
 */
export class AppContainer {
  public readonly settingsRepository = new PrismaSettingsRepository(prisma);
  public readonly topicRepository = new PrismaTopicRepository(prisma);
  public readonly postRepository = new PrismaPostRepository(prisma);
  public readonly videoRepository = new PrismaVideoRepository(prisma);
  public readonly mediaAssetRepository = new PrismaMediaAssetRepository(prisma);
  public readonly schedulerLogRepository = new PrismaSchedulerLogRepository(prisma);
  public readonly apiLogRepository = new PrismaApiLogRepository(prisma);
  public readonly promptHistoryRepository = new PrismaPromptHistoryRepository(prisma);
  public readonly executionRepository = new PrismaExecutionRepository(prisma);

  public readonly llmProvider = new PromptLoggingLlmProvider(
    new GeminiLlmProvider(
      env.GEMINI_API_KEY,
      env.GEMINI_TEXT_MODEL,
      this.apiLogRepository,
      env.RETRY_MAX_ATTEMPTS,
      env.RETRY_BASE_DELAY_MS,
    ),
    this.promptHistoryRepository,
  );

  public readonly voiceProvider: IVoiceProvider =
    env.VOICE_PROVIDER === 'gemini'
      ? new GeminiVoiceProvider(
          env.GEMINI_API_KEY,
          env.GEMINI_TTS_MODEL,
          this.apiLogRepository,
          env.RETRY_MAX_ATTEMPTS,
          env.RETRY_BASE_DELAY_MS,
        )
      : new EspeakVoiceProvider();

  private readonly pexelsProvider: IMediaProvider = new PexelsMediaProvider(
    env.PEXELS_API_KEY,
    this.apiLogRepository,
    env.RETRY_MAX_ATTEMPTS,
    env.RETRY_BASE_DELAY_MS,
  );

  private readonly pixabayProvider: IMediaProvider = new PixabayMediaProvider(
    env.PIXABAY_API_KEY,
    this.apiLogRepository,
    env.RETRY_MAX_ATTEMPTS,
    env.RETRY_BASE_DELAY_MS,
  );

  public readonly mediaSourcingService = new MediaSourcingService(
    [this.pexelsProvider, this.pixabayProvider],
    this.mediaAssetRepository,
  );

  public readonly storageProvider: IStorageProvider = new LocalStorageProvider(
    OUTPUT_DIR,
    env.PUBLIC_BASE_URL,
  );

  public readonly publisher: IPublisher = env.PUBLISH_ENABLED
    ? new InstagramGraphPublisher(
        env.INSTAGRAM_ACCESS_TOKEN,
        env.BUSINESS_ACCOUNT_ID,
        env.INSTAGRAM_GRAPH_API_VERSION,
        this.apiLogRepository,
        env.RETRY_MAX_ATTEMPTS,
        env.RETRY_BASE_DELAY_MS,
      )
    : new NullPublisher();

  public readonly topicPlanner = new TopicPlanner(this.llmProvider, this.topicRepository);
  public readonly researchService = new ResearchService(this.llmProvider);
  public readonly scriptGenerator = new ScriptGenerator(this.llmProvider);
  public readonly captionGenerator = new CaptionGenerator(this.llmProvider);
  public readonly hashtagGenerator = new HashtagGenerator(this.llmProvider);
  public readonly subtitleGenerator = new SubtitleGenerator(new HeuristicSubtitleTimingStrategy());
  public readonly videoComposer = new VideoComposer();

  public readonly pipelineOrchestrator = new PipelineOrchestrator(
    this.executionRepository,
    this.topicRepository,
    this.postRepository,
    this.videoRepository,
    this.schedulerLogRepository,
    this.topicPlanner,
    this.researchService,
    this.scriptGenerator,
    this.voiceProvider,
    this.mediaSourcingService,
    this.subtitleGenerator,
    this.videoComposer,
    this.captionGenerator,
    this.hashtagGenerator,
    this.publisher,
    this.storageProvider,
    env.BACKGROUND_MUSIC_PATH || undefined,
  );

  async bootstrap(): Promise<ContentSettings> {
    await ensureStorageDirs();
    return this.settingsRepository.upsertFromEnvDefaults({
      key: 'default',
      niche: contentDefaults.niche,
      language: contentDefaults.language,
      postingFrequency: contentDefaults.postingFrequency,
      videoDurationSeconds: contentDefaults.videoDurationSeconds,
      writingStyle: contentDefaults.writingStyle,
      cronExpression: contentDefaults.cronExpression,
      timezone: contentDefaults.timezone,
      isActive: true,
      envPrefix: null,
    });
  }

  async getActiveSettings(): Promise<ContentSettings[]> {
    return this.settingsRepository.findActive();
  }
}

export const container = new AppContainer();
