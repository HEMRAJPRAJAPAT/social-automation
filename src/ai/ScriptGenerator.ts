import { z } from 'zod';

import type { ContentSettings } from '../entities/ContentSettings.js';
import type { ResearchResult } from '../entities/ResearchResult.js';
import type { Script } from '../entities/Script.js';
import type { Topic } from '../entities/Topic.js';
import type { ILlmProvider } from '../services/interfaces/ILlmProvider.js';
import { childLogger } from '../utils/logger.js';
import { countWords, isNearDuplicate } from '../utils/text.js';

const log = childLogger('script-generator');

/** Average natural speaking pace for narrated short-form video, in words/second. */
const WORDS_PER_SECOND = 2.5;
const MAX_HOOK_RETRY_ATTEMPTS = 3;
const HOOK_SIMILARITY_THRESHOLD = 0.7;

const scriptSchema = z.object({
  hook: z.string().min(5).max(200),
  lines: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        text: z.string().min(3),
        visualKeyword: z.string().min(2),
      }),
    )
    .min(2),
  callToAction: z.string().min(3).max(200),
});

export class ScriptGenerator {
  constructor(private readonly llm: ILlmProvider) {}

  async generate(
    topic: Topic,
    research: ResearchResult,
    settings: ContentSettings,
    postId: string,
    recentHooks: string[] = [],
  ): Promise<Script> {
    let rejectedHooks: string[] = [];

    for (let attempt = 1; attempt <= MAX_HOOK_RETRY_ATTEMPTS; attempt++) {
      const prompt = this.buildPrompt(topic, research, settings, [
        ...recentHooks,
        ...rejectedHooks,
      ]);
      const raw = await this.llm.generateJson<unknown>(prompt, { purpose: 'SCRIPT', postId });
      const parsed = scriptSchema.safeParse(raw);

      if (!parsed.success) {
        log.error({ issues: parsed.error.issues, raw }, 'script JSON failed validation');
        continue;
      }

      if (isNearDuplicate(parsed.data.hook, recentHooks, HOOK_SIMILARITY_THRESHOLD)) {
        log.warn(
          { attempt, hook: parsed.data.hook },
          'hook too similar to a recent post, retrying',
        );
        rejectedHooks = [...rejectedHooks, parsed.data.hook];
        continue;
      }

      return this.toEntity(parsed.data, settings.language);
    }

    throw new Error(`Could not generate a script with a fresh hook for topic "${topic.title}"`);
  }

  private toEntity(data: z.infer<typeof scriptSchema>, language: string): Script {
    const fullNarrationText = [
      data.hook,
      ...data.lines.map((line) => line.text),
      data.callToAction,
    ].join(' ');
    const estimatedDurationSeconds = Math.round(countWords(fullNarrationText) / WORDS_PER_SECOND);

    return {
      hook: data.hook,
      lines: data.lines,
      callToAction: data.callToAction,
      fullNarrationText,
      estimatedDurationSeconds,
      language,
    };
  }

  private buildPrompt(
    topic: Topic,
    research: ResearchResult,
    settings: ContentSettings,
    excludeHooks: string[],
  ): string {
    const exclusion =
      excludeHooks.length > 0
        ? `Avoid reusing the style or wording of these recent hooks:\n${excludeHooks
            .map((hook) => `- ${hook}`)
            .join('\n')}`
        : '';

    return `Write an original ${settings.videoDurationSeconds}-second Instagram Reel script in
${settings.language} about: "${topic.title}".

Writing style: ${settings.writingStyle}.
Target speaking pace: about ${WORDS_PER_SECOND} words/second, so aim for roughly
${Math.round(settings.videoDurationSeconds * WORDS_PER_SECOND)} total words across hook + lines + CTA.

Research to draw from (do not just read this list — synthesize it into a natural script):
- Key points: ${research.keyPoints.join(' | ')}
- Facts: ${research.facts.map((fact) => `${fact.point}: ${fact.detail}`).join(' | ')}
- Examples: ${research.examples.map((example) => `${example.title}: ${example.description}`).join(' | ')}
- Suggested angle: ${research.suggestedAngle}

Requirements:
- The hook must grab attention in the first 3 seconds — no throat-clearing, no "hey guys".
- The body must clearly explain the topic in natural, spoken, conversational ${settings.language}.
- End with a specific, natural call-to-action (e.g. follow for more, comment a question, save this).
- Be 100% original — do not copy phrasing from the research verbatim.
${exclusion}

Respond with ONLY a JSON object, no markdown fences, matching exactly this shape:
{
  "hook": "string, the opening line(s), max ~3 seconds of speech",
  "lines": [
    { "index": 0, "text": "string, one spoken sentence or beat", "visualKeyword": "string, 1-3 words describing what b-roll would match this line" }
  ],
  "callToAction": "string, the closing call-to-action line"
}`;
  }
}
