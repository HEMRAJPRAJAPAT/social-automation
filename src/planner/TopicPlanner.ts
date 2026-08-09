import { z } from 'zod';

import type { ContentSettings } from '../entities/ContentSettings.js';
import type { TOPIC_CATEGORIES, Topic } from '../entities/Topic.js';
import type { ITopicRepository } from '../repositories/interfaces/ITopicRepository.js';
import type { ILlmProvider } from '../services/interfaces/ILlmProvider.js';
import { childLogger } from '../utils/logger.js';
import { isNearDuplicate, normalizeTitle, slugify } from '../utils/text.js';

import { formatPromptHint, pickNextFormat } from './contentFormats.js';
import { hookCategoryPromptHint, pickNextHookCategory } from './hookCategories.js';
import { categoryPromptHint, pickNextCategory } from './topicCategories.js';

const log = childLogger('topic-planner');

const topicIdeaSchema = z.object({
  title: z.string().min(8).max(120),
  hook: z.string().min(8).max(200),
  summary: z.string().min(20).max(600),
  keywords: z.array(z.string().min(2)).min(3).max(10),
  /** The ONE concrete thing a viewer should be able to repeat back after watching. */
  coreLesson: z.string().min(10).max(300),
  /** A short, concrete visual concept — a real-world analogy or comparison the video can show. */
  visualIdea: z.string().min(5).max(300),
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

    const [existingTitles, lastCategory, recentTopics] = await Promise.all([
      this.topicRepository.findAllTitles(settings.id),
      this.topicRepository.findLastCategory(settings.id),
      this.topicRepository.findRecentBySetting(settings.id, 1),
    ]);

    const category = pickNextCategory(lastCategory);
    const format = pickNextFormat(recentTopics[0]?.format ?? null);
    const hookCategory = pickNextHookCategory(recentTopics[0]?.hookCategory ?? null);
    const recentTitles = existingTitles.slice(-HISTORY_WINDOW);

    const idea = await this.generateUniqueIdea(
      settings,
      category,
      format,
      hookCategory,
      recentTitles,
      existingTitles,
    );

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
      coreLesson: idea.coreLesson,
      visualIdea: idea.visualIdea,
      format,
      difficulty: settings.audienceLevel,
      audienceLevel: settings.audienceLevel,
      hookCategory,
    });

    log.info(
      { topicId: topic.id, title: topic.title, category, format, hookCategory },
      'planned new topic',
    );
    return topic;
  }

  private async generateUniqueIdea(
    settings: ContentSettings,
    category: (typeof TOPIC_CATEGORIES)[number],
    format: Topic['format'],
    hookCategory: Topic['hookCategory'],
    recentTitles: string[],
    allTitles: string[],
  ): Promise<TopicIdea> {
    let lastRejected: string[] = [];

    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
      const prompt = this.buildPrompt(settings, category, format, hookCategory, [
        ...recentTitles,
        ...lastRejected,
      ]);
      const raw = await this.llm.generateJson<unknown>(prompt, { purpose: 'TOPIC' });
      const parsed = topicIdeaSchema.safeParse(raw);

      if (!parsed.success) {
        log.error({ attempt, issues: parsed.error.issues, raw }, 'topic idea failed validation');
        continue;
      }

      if (!isNearDuplicate(parsed.data.title, allTitles, SIMILARITY_THRESHOLD)) {
        return parsed.data;
      }

      log.warn(
        { attempt, title: parsed.data.title },
        'topic idea rejected as near-duplicate, retrying',
      );
      lastRejected = [...lastRejected, parsed.data.title];
    }

    throw new Error(
      `Could not generate a unique topic for niche "${settings.niche}" after ${MAX_GENERATION_ATTEMPTS} attempts`,
    );
  }

  private buildPrompt(
    settings: ContentSettings,
    category: (typeof TOPIC_CATEGORIES)[number],
    format: Topic['format'],
    hookCategory: Topic['hookCategory'],
    excludeTitles: string[],
  ): string {
    const exclusionList =
      excludeTitles.length > 0
        ? `Do NOT reuse or closely rephrase any of these already-published topics:\n${excludeTitles
            .map((title) => `- ${title}`)
            .join('\n')}`
        : 'No topics have been published yet.';

    return `You are a content strategist for a daily Instagram Reels account in the niche "${settings.niche}".
The audience skill level is: ${settings.audienceLevel}. Assume they are smart but have NO prior
background in this specific topic unless it is truly common knowledge — never assume familiarity
with jargon, acronyms, or advanced concepts.

Today's content type must be: ${categoryPromptHint(category)}.
Today's Reel structure/format is: ${formatPromptHint(format)}
Today's opening hook style is: ${hookCategoryPromptHint(hookCategory)}

What makes a topic land right now: pick something that feels current and relevant to developers
following AI and programming trends — a tool, technique, or "wait, that's a thing?" moment people
are actually talking about — not a generic, textbook-style topic. Do not fabricate specific recent
news, dates, or version numbers you are not certain of; lean on genuinely useful, evergreen
substance framed in a way that feels timely and worth stopping to watch.

${exclusionList}

Come up with ONE brand-new, specific, non-generic topic idea for today's Reel. It must be:
- Narrow enough to explain in ${settings.videoDurationSeconds} seconds
- Reducible to exactly ONE core lesson — do not try to teach three things in one Reel
- Genuinely useful and specific (not "learn about APIs" but "why your app re-fetches data it
  already has, and the one-line fix")
- Explainable with a concrete real-world analogy or comparison a total beginner would instantly get
- Clearly different in substance (not just wording) from the excluded list above

Respond with ONLY a JSON object, no markdown fences, matching exactly this shape:
{
  "title": "string, a specific working title for the topic",
  "hook": "string, a punchy one-sentence hook that could open the video, matching the hook style above",
  "summary": "string, 2-3 sentences summarizing what the video will cover",
  "keywords": ["array of 3-10 short search keywords related to the topic"],
  "coreLesson": "string, the ONE specific thing a viewer should be able to repeat back after watching",
  "visualIdea": "string, a concrete real-world analogy or comparison this Reel can visually show (e.g. 'a customer ordering from a waiter who relays the order to the kitchen')"
}`;
  }
}
