import os from 'node:os';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CaptionGenerator } from '../../../src/ai/CaptionGenerator.js';
import { ContentEvaluator } from '../../../src/ai/ContentEvaluator.js';
import { HashtagGenerator } from '../../../src/ai/HashtagGenerator.js';
import { HeuristicSubtitleTimingStrategy } from '../../../src/ai/HeuristicSubtitleTimingStrategy.js';
import { ResearchService } from '../../../src/ai/ResearchService.js';
import { ScriptGenerator } from '../../../src/ai/ScriptGenerator.js';
import { SubtitleGenerator } from '../../../src/ai/SubtitleGenerator.js';
import { VisualPlanner } from '../../../src/ai/VisualPlanner.js';
import { PipelineOrchestrator } from '../../../src/pipeline/PipelineOrchestrator.js';
import { TopicPlanner } from '../../../src/planner/TopicPlanner.js';
import type * as FsUtils from '../../../src/utils/fs.js';
import {
  FakeExecutionRepository,
  FakeLlmProvider,
  makeContentSettings,
  makeFakePostRepository,
  makeFakePublisher,
  makeFakeRenderedVideo,
  makeFakeSchedulerLogRepository,
  makeFakeStorageProvider,
  makeFakeTopicRepository,
  makeFakeVideoRepository,
  makeFakeVoiceProvider,
} from '../../mocks/fakes.js';

// Force the temp/output work directory under os.tmpdir() instead of the
// project's real ./storage, so the pipeline test never touches repo files.
vi.mock('../../../src/utils/fs.js', async () => {
  const actual = await vi.importActual<typeof FsUtils>('../../../src/utils/fs.js');
  return {
    ...actual,
    executionWorkDir: (executionId: string) => path.join(os.tmpdir(), 'reel-automation-test', executionId),
  };
});

const topicIdea = {
  title: 'A Brand New Topic',
  hook: 'A fresh hook nobody has used',
  summary: 'A summary long enough to pass the validation checks required by the schema.',
  keywords: ['one', 'two', 'three'],
  coreLesson: 'The one thing viewers should remember.',
  visualIdea: 'A simple real-world analogy for this topic.',
};

const evaluationResult = {
  hookStrength: 9,
  clarity: 9,
  beginnerFriendliness: 9,
  originality: 9,
  visualFeasibility: 9,
  value: 9,
  overall: 9,
  improvementNotes: 'Strong as-is.',
};

const visualPlanResult = {
  scenes: [
    { lineIndex: 0, type: 'stock', stockKeywords: ['coding'] },
    { lineIndex: 1, type: 'stock', stockKeywords: ['testing'] },
  ],
};

const researchResult = {
  topicTitle: topicIdea.title,
  keyPoints: ['a', 'b', 'c'],
  facts: [
    { point: 'p1', detail: 'd1', source: 'model-knowledge' },
    { point: 'p2', detail: 'd2', source: 'model-knowledge' },
  ],
  examples: [{ title: 't', description: 'd' }],
  latestDevelopments: [],
  suggestedAngle: 'angle',
};

const scriptResult = {
  hook: 'A fresh hook nobody has used before today',
  lines: [
    { index: 0, text: 'This explains the first beat clearly.', visualKeyword: 'coding' },
    { index: 1, text: 'This explains the second beat clearly.', visualKeyword: 'testing' },
  ],
  callToAction: 'Follow for more tips like this.',
};

const captionResult = {
  igTitle: 'A punchy title',
  captionText: 'A caption long enough to satisfy the minimum length requirement for validation.',
};

const hashtagResult = {
  small: ['tinytag1', 'tinytag2', 'tinytag3'],
  medium: ['midtag1', 'midtag2', 'midtag3'],
  popular: ['bigtag1', 'bigtag2', 'bigtag3'],
};

function buildOrchestrator(options: { seedTopicStep?: boolean } = {}) {
  const executionRepository = new FakeExecutionRepository('setting-1');
  const topicRepository = makeFakeTopicRepository({
    findPlannedForDate: async () => null,
    findAllTitles: async () => [],
    findLastCategory: async () => null,
  });
  const postRepository = makeFakePostRepository();
  const videoRepository = makeFakeVideoRepository();
  const schedulerLogRepository = makeFakeSchedulerLogRepository();

  const llm = new FakeLlmProvider();
  // When PLAN_TOPIC's output is pre-seeded as already completed, the
  // orchestrator must never dequeue a response for it — queueing one here
  // would shift every subsequent response out of alignment.
  if (!options.seedTopicStep) llm.enqueueJson(topicIdea);
  llm.enqueueJson(researchResult);
  llm.enqueueJson(scriptResult);
  llm.enqueueJson(evaluationResult);
  llm.enqueueJson(visualPlanResult);
  llm.enqueueJson(captionResult);
  llm.enqueueJson(hashtagResult);

  const topicPlanner = new TopicPlanner(llm, topicRepository);
  const researchService = new ResearchService(llm);
  const scriptGenerator = new ScriptGenerator(llm);
  const contentEvaluator = new ContentEvaluator(llm);
  const visualPlanner = new VisualPlanner(llm);
  const captionGenerator = new CaptionGenerator(llm);
  const hashtagGenerator = new HashtagGenerator(llm);
  const subtitleGenerator = new SubtitleGenerator(new HeuristicSubtitleTimingStrategy());

  const voiceProvider = makeFakeVoiceProvider(20);
  const mediaSourcingService = {
    sourceForScript: vi.fn(async (script) =>
      script.lines.map((line: { index: number }) => ({
        lineIndex: line.index,
        asset: {
          provider: 'PEXELS',
          providerAssetId: `asset-${line.index}`,
          type: 'VIDEO',
          query: 'coding',
          sourceUrl: 'https://example.com/video.mp4',
          localPath: '/tmp/video.mp4',
          checksum: `checksum-${line.index}`,
          width: 1080,
          height: 1920,
          durationSeconds: 10,
        },
      })),
    ),
  };
  const videoComposer = { compose: vi.fn(async () => makeFakeRenderedVideo()) };
  const publisher = makeFakePublisher();
  const storageProvider = makeFakeStorageProvider();

  const orchestrator = new PipelineOrchestrator(
    executionRepository,
    topicRepository,
    postRepository,
    videoRepository,
    schedulerLogRepository,
    topicPlanner,
    researchService,
    scriptGenerator,
    contentEvaluator,
    voiceProvider,
    visualPlanner,
    mediaSourcingService,
    subtitleGenerator,
    videoComposer,
    captionGenerator,
    hashtagGenerator,
    publisher,
    storageProvider,
    undefined,
    'DejaVu Sans',
  );

  return {
    orchestrator,
    executionRepository,
    postRepository,
    videoRepository,
    publisher,
    mediaSourcingService,
    videoComposer,
    llm,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PipelineOrchestrator', () => {
  it('runs every step and publishes successfully end to end', async () => {
    const { orchestrator, publisher } = buildOrchestrator();
    const settings = makeContentSettings();

    const summary = await orchestrator.runForSetting(settings);

    expect(summary.status).toBe('SUCCEEDED');
    expect(summary.postId).toBeDefined();
    expect(summary.instagramMediaId).toBe('media-1');
    expect(publisher.publishReel).toHaveBeenCalledTimes(1);
  });

  it('skips a second run for the same day once already succeeded', async () => {
    const { orchestrator } = buildOrchestrator();
    const settings = makeContentSettings();

    const first = await orchestrator.runForSetting(settings);
    expect(first.status).toBe('SUCCEEDED');

    const second = await orchestrator.runForSetting(settings);
    expect(second.status).toBe('SKIPPED_ALREADY_DONE');
  });

  it('never throws when a step fails — it returns a FAILED summary instead', async () => {
    const { orchestrator, publisher } = buildOrchestrator();
    publisher.publishReel = vi.fn(async () => {
      throw new Error('Instagram is down');
    });
    const settings = makeContentSettings();

    const summary = await orchestrator.runForSetting(settings);

    expect(summary.status).toBe('FAILED');
    expect(summary.errorMessage).toMatch(/Instagram is down/);
  });

  it('does not re-run a step whose output was already cached on a resumed execution', async () => {
    const { orchestrator, executionRepository, mediaSourcingService } = buildOrchestrator({
      seedTopicStep: true,
    });
    const settings = makeContentSettings();

    // Simulate a prior crash right after MEDIA succeeded: seed PLAN_TOPIC,
    // RESEARCH, SCRIPT, VOICE, and MEDIA as already completed.
    executionRepository.seedCompletedStep('PLAN_TOPIC', {
      id: 'topic-1',
      settingId: settings.id,
      title: topicIdea.title,
      normalizedTitle: 'a brand new topic',
      slug: 'a-brand-new-topic',
      category: 'TUTORIAL',
      hook: topicIdea.hook,
      summary: topicIdea.summary,
      keywords: topicIdea.keywords,
      status: 'PLANNED',
      plannedFor: new Date(),
      usedAt: null,
      createdAt: new Date(),
    });

    const summary = await orchestrator.runForSetting(settings);

    expect(summary.status).toBe('SUCCEEDED');
    // MEDIA step still runs fresh in this scenario since only PLAN_TOPIC was
    // seeded, but PLAN_TOPIC itself must NOT trigger another LLM call.
    expect(mediaSourcingService.sourceForScript).toHaveBeenCalledTimes(1);
  });
});
