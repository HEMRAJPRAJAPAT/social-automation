import { z } from 'zod';

import type { ContentSettings } from '../entities/ContentSettings.js';
import type { TOPIC_CATEGORIES, Topic } from '../entities/Topic.js';
import type { ITopicRepository } from '../repositories/interfaces/ITopicRepository.js';
import type { ILlmProvider } from '../services/interfaces/ILlmProvider.js';
import { childLogger } from '../utils/logger.js';
import { isNearDuplicate, normalizeTitle, slugify } from '../utils/text.js';

import { categoryPromptHint, pickNextCategory } from './topicCategories.js';

const log = childLogger('topic-planner');

const topicIdeaSchema = z.object({
  title: z.string().min(8).max(120),
  hook: z.string().min(8).max(200),
  summary: z.string().min(20).max(600),
  keywords: z.array(z.string().min(2)).min(3).max(10),
});

type TopicIdea = z.infer<typeof topicIdeaSchema>;

const MAX_GENERATION_ATTEMPTS = 4;
const HISTORY_WINDOW = 60;
const SIMILARITY_THRESHOLD = 0.6;

export class TopicPlanner {
  constructor(
    private readonly llm: ILlmProvider,
    private readonly topicRepository: ITopicRepository,
  ) {}

  /**
   * Returns today's topic for the given setting. Idempotent: if a topic was
   * already planned for today (e.g. a previous run crashed after planning
   * but before publishing), returns that same topic instead of creating a
   * new one — this is what makes the pipeline resumable per spec §15.
   */
  async planForToday(settings: ContentSettings, today: Date): Promise<Topic> {
    const existing = await this.topicRepository.findPlannedForDate(settings.id, today);
    if (existing) {
      log.info(
        { topicId: existing.id, title: existing.title },
        'reusing topic already planned for today',
      );
      return existing;
    }

    const [existingTitles, lastCategory] = await Promise.all([
      this.topicRepository.findAllTitles(settings.id),
      this.topicRepository.findLastCategory(settings.id),
    ]);

    const category = pickNextCategory(lastCategory);
    const recentTitles = existingTitles.slice(-HISTORY_WINDOW);

    const idea = await this.generateUniqueIdea(settings, category, recentTitles, existingTitles);

    const topic = await this.topicRepository.create({
      settingId: settings.id,
      title: idea.title,
      normalizedTitle: normalizeTitle(idea.title),
      slug: `${slugify(idea.title)}-${today.toISOString().slice(0, 10)}`,
      category,
      hook: idea.hook,
      summary: idea.summary,
      keywords: idea.keywords,
      status: 'PLANNED',
      plannedFor: today,
      usedAt: null,
    });

    log.info({ topicId: topic.id, title: topic.title, category }, 'planned new topic');
    return topic;
  }

  private async generateUniqueIdea(
    settings: ContentSettings,
    category: (typeof TOPIC_CATEGORIES)[number],
    recentTitles: string[],
    allTitles: string[],
  ): Promise<TopicIdea> {
    let lastRejected: string[] = [];

    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
      const prompt = this.buildPrompt(settings, category, [...recentTitles, ...lastRejected]);
      const idea = await this.llm.generateJson<TopicIdea>(prompt, { purpose: 'TOPIC' });
      const parsed = topicIdeaSchema.parse(idea);

      if (!isNearDuplicate(parsed.title, allTitles, SIMILARITY_THRESHOLD)) {
        return parsed;
      }

      log.warn({ attempt, title: parsed.title }, 'topic idea rejected as near-duplicate, retrying');
      lastRejected = [...lastRejected, parsed.title];
    }

    throw new Error(
      `Could not generate a unique topic for niche "${settings.niche}" after ${MAX_GENERATION_ATTEMPTS} attempts`,
    );
  }

  private buildPrompt(
    settings: ContentSettings,
    category: (typeof TOPIC_CATEGORIES)[number],
    excludeTitles: string[],
  ): string {
    const exclusionList =
      excludeTitles.length > 0
        ? `Do NOT reuse or closely rephrase any of these already-published topics:\n${excludeTitles
            .map((title) => `- ${title}`)
            .join('\n')}`
        : 'No topics have been published yet.';

    return `You are a content strategist for a daily Instagram Reels account in the niche "${settings.niche}".
Today's content type must be: ${categoryPromptHint(category)}.

${exclusionList}

Come up with ONE brand-new, specific, non-generic topic idea for today's Reel. It must be
narrow enough to explain in ${settings.videoDurationSeconds} seconds, genuinely useful to the
audience, and clearly different in substance (not just wording) from the excluded list above.

Respond with ONLY a JSON object, no markdown fences, matching exactly this shape:
{
  "title": "string, a specific working title for the topic",
  "hook": "string, a punchy one-sentence hook that could open the video",
  "summary": "string, 2-3 sentences summarizing what the video will cover",
  "keywords": ["array of 3-10 short search keywords related to the topic"]
}`;
  }
}
