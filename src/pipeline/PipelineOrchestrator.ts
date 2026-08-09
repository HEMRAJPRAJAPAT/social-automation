import path from 'node:path';

import type { CaptionGenerator } from '../ai/CaptionGenerator.js';
import type { HashtagGenerator } from '../ai/HashtagGenerator.js';
import type { ResearchService } from '../ai/ResearchService.js';
import type { ScriptGenerator } from '../ai/ScriptGenerator.js';
import type { SubtitleGenerator } from '../ai/SubtitleGenerator.js';
import type { CaptionPackage } from '../entities/CaptionPackage.js';
import type { ContentSettings } from '../entities/ContentSettings.js';
import type { PipelineStepName } from '../entities/Execution.js';
import type { Topic } from '../entities/Topic.js';
import type { IPublisher } from '../instagram/IPublisher.js';
import type { TopicPlanner } from '../planner/TopicPlanner.js';
import type { IExecutionRepository } from '../repositories/interfaces/IExecutionRepository.js';
import type { IPostRepository } from '../repositories/interfaces/IPostRepository.js';
import type { ISchedulerLogRepository } from '../repositories/interfaces/ISchedulerLogRepository.js';
import type { ITopicRepository } from '../repositories/interfaces/ITopicRepository.js';
import type { IVideoRepository } from '../repositories/interfaces/IVideoRepository.js';
import type { IMediaSourcingService } from '../services/interfaces/IMediaSourcingService.js';
import type { IVoiceProvider } from '../services/interfaces/IVoiceProvider.js';
import type { IStorageProvider } from '../storage/IStorageProvider.js';
import { cleanupOldFiles, ensureDir, executionWorkDir, fileExists } from '../utils/fs.js';
import { childLogger } from '../utils/logger.js';
import type { IVideoComposer } from '../video/IVideoComposer.js';

const log = childLogger('pipeline-orchestrator');

const TEMP_FILE_MAX_AGE_MS = 48 * 60 * 60 * 1000; // 48h — spec bonus: automatic temp cleanup

// How long a RUNNING execution can go without any step activity before we
// assume the process that owned it crashed (e.g. killed mid-deploy) and it's
// safe to reclaim, rather than treating it as a live concurrent run.
const RUNNING_STALE_THRESHOLD_MS = 15 * 60 * 1000;

export interface PipelineRunSummary {
  executionId: string;
  status: 'SUCCEEDED' | 'FAILED' | 'SKIPPED_ALREADY_DONE';
  postId?: string;
  instagramMediaId?: string;
  errorMessage?: string;
}

/**
 * Application-layer use case (see ARCHITECTURE.md §5) that runs the 13-step
 * pipeline from the spec end to end: plan → research → script → voice →
 * media → subtitles → compose → caption → hashtags → publish → persist.
 *
 * Every step is wrapped by `runStep`, which persists its output to
 * `execution_steps` and skips re-running it if the same Execution already
 * completed it (spec §15 "resume next day, do not crash" + bonus "resume
 * interrupted executions").
 */
export class PipelineOrchestrator {
  constructor(
    private readonly executionRepository: IExecutionRepository,
    private readonly topicRepository: ITopicRepository,
    private readonly postRepository: IPostRepository,
    private readonly videoRepository: IVideoRepository,
    private readonly schedulerLogRepository: ISchedulerLogRepository,
    private readonly topicPlanner: TopicPlanner,
    private readonly researchService: ResearchService,
    private readonly scriptGenerator: ScriptGenerator,
    private readonly voiceProvider: IVoiceProvider,
    private readonly mediaSourcingService: IMediaSourcingService,
    private readonly subtitleGenerator: SubtitleGenerator,
    private readonly videoComposer: IVideoComposer,
    private readonly captionGenerator: CaptionGenerator,
    private readonly hashtagGenerator: HashtagGenerator,
    private readonly publisher: IPublisher,
    private readonly storageProvider: IStorageProvider,
    private readonly backgroundMusicPath: string | undefined,
  ) {}

  async runForSetting(
    settings: ContentSettings,
    options: { force?: boolean } = {},
  ): Promise<PipelineRunSummary> {
    const runDate = new Date();
    if (options.force) {
      // Manual/API trigger: always render a brand-new Reel instead of
      // reusing/skipping today's slot (the daily cron keeps the dedup path).
      await this.executionRepository.deleteForToday(settings.id, runDate);
    }
    const execution = await this.executionRepository.findOrCreateForToday(settings.id, runDate);

    if (execution.status === 'SUCCEEDED') {
      log.info(
        { executionId: execution.id, settingId: settings.id },
        "today's Reel already published, skipping",
      );
      return {
        executionId: execution.id,
        status: 'SKIPPED_ALREADY_DONE',
        postId: execution.postId ?? undefined,
      };
    }

    if (execution.status === 'RUNNING') {
      const lastActivity = execution.steps.reduce(
        (latest, step) => (step.startedAt > latest ? step.startedAt : latest),
        execution.startedAt,
      );
      const staleMs = Date.now() - lastActivity.getTime();
      if (staleMs < RUNNING_STALE_THRESHOLD_MS) {
        log.warn(
          { executionId: execution.id, settingId: settings.id, staleMs },
          'execution is already RUNNING elsewhere (likely an overlapping process, e.g. a deploy in progress); skipping to avoid a concurrent run',
        );
        return {
          executionId: execution.id,
          status: 'SKIPPED_ALREADY_DONE',
          postId: execution.postId ?? undefined,
        };
      }
      log.warn(
        { executionId: execution.id, settingId: settings.id, staleMs },
        'execution has been stuck RUNNING with no activity past the staleness threshold; assuming the previous run crashed and reclaiming it',
      );
    }

    const startedAt = new Date();
    await this.executionRepository.setStatus(execution.id, 'RUNNING');

    const workDir = executionWorkDir(execution.id);
    await ensureDir(workDir);

    try {
      const summary = await this.runPipeline(execution.id, settings, workDir);
      await this.executionRepository.setStatus(execution.id, 'SUCCEEDED', {
        currentStep: null,
        postId: summary.postId,
      });
      await this.schedulerLogRepository.log({
        jobName: 'daily-reel-pipeline',
        status: 'SUCCEEDED',
        executionId: execution.id,
        startedAt,
        finishedAt: new Date(),
      });
      await cleanupOldFiles(path.dirname(workDir), TEMP_FILE_MAX_AGE_MS).catch((error) =>
        log.warn({ error }, 'temp cleanup failed, continuing'),
      );
      return { executionId: execution.id, status: 'SUCCEEDED', ...summary };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(
        { executionId: execution.id, error: message },
        'pipeline run failed; will resume next scheduled run',
      );
      await this.executionRepository.setStatus(execution.id, 'FAILED', { errorMessage: message });
      await this.schedulerLogRepository.log({
        jobName: 'daily-reel-pipeline',
        status: 'FAILED',
        message,
        executionId: execution.id,
        startedAt,
        finishedAt: new Date(),
      });
      // Spec §15: never crash the process — the scheduler/API caller gets a
      // structured failure result instead of a thrown exception.
      return { executionId: execution.id, status: 'FAILED', errorMessage: message };
    }
  }

  private async runPipeline(
    executionId: string,
    settings: ContentSettings,
    workDir: string,
  ): Promise<{ postId: string; instagramMediaId?: string }> {
    const topic = await this.runStep(executionId, 'PLAN_TOPIC', () =>
      this.topicPlanner.planForToday(settings, new Date()),
    );

    const post = await this.findOrCreatePost(executionId, topic, settings);

    const research = await this.runStep(executionId, 'RESEARCH', () =>
      this.researchService.research(topic, post.id),
    );
    await this.postRepository.update(post.id, { status: 'SCRIPTING', researchJson: research });

    const recentHooks = await this.postRepository.recentCaptionHooks(20);
    const script = await this.runStep(executionId, 'SCRIPT', () =>
      this.scriptGenerator.generate(topic, research, settings, post.id, recentHooks),
    );
    await this.postRepository.update(post.id, { status: 'VOICING', script });

    const voiceOver = await this.runStep(
      executionId,
      'VOICE',
      () =>
        this.voiceProvider.synthesize(script.fullNarrationText, {
          outputPath: path.join(workDir, 'voice.wav'),
          language: settings.language,
        }),
      (cached) => fileExists(cached.audioFilePath),
    );
    await this.postRepository.update(post.id, { status: 'SOURCING_MEDIA' });

    const sourcedMedia = await this.runStep(
      executionId,
      'MEDIA',
      () => this.mediaSourcingService.sourceForScript(script, post.id, workDir),
      async (cached) => {
        const checks = await Promise.all(cached.map((m) => fileExists(m.asset.localPath)));
        return checks.every(Boolean);
      },
    );
    await this.postRepository.update(post.id, { status: 'RENDERING' });

    const subtitles = await this.runStep(
      executionId,
      'SUBTITLES',
      () =>
        this.subtitleGenerator.generate(
          script.fullNarrationText,
          voiceOver.durationSeconds,
          path.join(workDir, 'subtitles.srt'),
        ),
      (cached) => fileExists(cached.srtFilePath),
    );

    const renderedVideo = await this.runStep(
      executionId,
      'COMPOSE_VIDEO',
      () =>
        this.videoComposer.compose({
          script,
          voiceOver,
          sourcedMedia,
          subtitles,
          outputPath: path.join(workDir, 'output.mp4'),
          workDir,
          backgroundMusicPath: this.backgroundMusicPath || undefined,
        }),
      (cached) => fileExists(cached.filePath),
    );

    const video = await this.videoRepository.create(post.id, renderedVideo);
    await this.videoRepository.markSelected(video.id, post.id);

    const caption = await this.runStep(executionId, 'CAPTION', () =>
      this.captionGenerator.generate(topic, script, settings, post.id),
    );

    const hashtags = await this.runStep(executionId, 'HASHTAGS', () =>
      this.hashtagGenerator.generate(topic, settings, post.id),
    );

    await this.postRepository.update(post.id, {
      status: 'READY',
      captionText: caption.captionText,
      igTitle: caption.igTitle,
      hashtags,
      selectedVideoId: video.id,
    });

    const publishResult = await this.runStep(executionId, 'PUBLISH', () =>
      this.publishVideo(video.filePath, caption, hashtags, post.id),
    );

    await this.runStep(executionId, 'PERSIST_METADATA', async () => {
      await this.postRepository.update(post.id, {
        status: 'PUBLISHED',
        instagramContainerId: publishResult.instagramContainerId,
        instagramMediaId: publishResult.instagramMediaId,
        instagramPermalink: publishResult.instagramPermalink,
        publishedAt: publishResult.publishedAt,
      });
      // publishResult.publishedAt may be a string if this step's output was
      // read back from a cached JSON blob during a resumed execution.
      await this.topicRepository.markUsed(topic.id, new Date(publishResult.publishedAt));
      return { done: true };
    });

    return { postId: post.id, instagramMediaId: publishResult.instagramMediaId };
  }

  private async publishVideo(
    localVideoPath: string,
    caption: CaptionPackage | { igTitle: string; captionText: string },
    hashtags: string[],
    postId: string,
  ) {
    const key = `reels/${postId}.mp4`;
    const stored = await this.storageProvider.save(localVideoPath, key);
    const fullCaption = `${caption.captionText}\n\n${hashtags.join(' ')}`.trim();

    await this.postRepository.setStatus(postId, 'PUBLISHING');
    try {
      return await this.publisher.publishReel({ videoUrl: stored.url, caption: fullCaption });
    } catch (error) {
      await this.postRepository.setStatus(
        postId,
        'FAILED',
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  private async findOrCreatePost(executionId: string, topic: Topic, settings: ContentSettings) {
    const execution = await this.executionRepository.findOrCreateForToday(
      settings.id,
      topic.plannedFor,
    );
    if (execution.postId) {
      const existing = await this.postRepository.findById(execution.postId);
      if (existing) return existing;
    }

    const created = await this.postRepository.create({
      topicId: topic.id,
      language: settings.language,
      status: 'RESEARCHING',
      researchJson: null,
      script: null,
      captionText: null,
      igTitle: null,
      selectedVideoId: null,
      instagramMediaId: null,
      instagramContainerId: null,
      instagramPermalink: null,
      lastPublishError: null,
      publishedAt: null,
    });
    await this.executionRepository.setStatus(executionId, 'RUNNING', { postId: created.id });
    return created;
  }

  private async runStep<T>(
    executionId: string,
    stepName: PipelineStepName,
    fn: () => Promise<T>,
    isCacheStillValid?: (cached: T) => Promise<boolean>,
  ): Promise<T> {
    const cached = await this.executionRepository.getCompletedStepOutput<T>(executionId, stepName);
    if (cached !== null) {
      if (!isCacheStillValid || (await isCacheStillValid(cached))) {
        log.info(
          { executionId, stepName },
          'step already completed for this execution, reusing cached output',
        );
        return cached;
      }
      log.warn(
        { executionId, stepName },
        'cached step output references files that no longer exist on disk (temp storage is ephemeral); re-running step',
      );
    }

    await this.executionRepository.startStep(executionId, stepName, 1);
    await this.executionRepository.setStatus(executionId, 'RUNNING', { currentStep: stepName });

    try {
      const result = await fn();
      await this.executionRepository.finishStep(executionId, stepName, 'SUCCEEDED', result);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.executionRepository.finishStep(
        executionId,
        stepName,
        'FAILED',
        undefined,
        message,
      );
      throw error;
    }
  }
}
