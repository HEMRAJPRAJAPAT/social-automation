import { z } from 'zod';

import type { EvaluationScores } from '../entities/ContentEvaluation.js';
import type { ContentSettings } from '../entities/ContentSettings.js';
import type { ResearchResult } from '../entities/ResearchResult.js';
import type { Script } from '../entities/Script.js';
import type { Topic } from '../entities/Topic.js';
import { formatPromptHint } from '../planner/contentFormats.js';
import { hookCategoryPromptHint } from '../planner/hookCategories.js';
import type { ILlmProvider } from '../services/interfaces/ILlmProvider.js';
import { childLogger } from '../utils/logger.js';
import { countWords, isNearDuplicate } from '../utils/text.js';

const log = childLogger('script-generator');

/** Average natural speaking pace for narrated short-form video, in words/second. */
const WORDS_PER_SECOND = 2.5;
const MAX_HOOK_RETRY_ATTEMPTS = 3;
const HOOK_SIMILARITY_THRESHOLD = 0.7;

/** Openers/fillers that read like documentation, not a person talking to camera. */
const BANNED_PHRASES = [
  'in this video',
  'today we are going to',
  'today we will',
  "let's dive in",
  'first of all',
  'in conclusion',
  'there are several',
  'without further ado',
  'hey guys',
];

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

/** Feedback from a low-scoring ContentEvaluator pass, fed back in to steer a regeneration. */
export interface ScriptFeedback {
  scores: EvaluationScores;
}

export class ScriptGenerator {
  constructor(private readonly llm: ILlmProvider) {}

  async generate(
    topic: Topic,
    research: ResearchResult,
    settings: ContentSettings,
    postId: string,
    recentHooks: string[] = [],
    feedback?: ScriptFeedback,
  ): Promise<Script> {
    let rejectedHooks: string[] = [];

    for (let attempt = 1; attempt <= MAX_HOOK_RETRY_ATTEMPTS; attempt++) {
      const prompt = this.buildPrompt(
        topic,
        research,
        settings,
        [...recentHooks, ...rejectedHooks],
        feedback,
      );
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
    feedback: ScriptFeedback | undefined,
  ): string {
    const exclusion =
      excludeHooks.length > 0
        ? `Avoid reusing the style or wording of these recent hooks:\n${excludeHooks
            .map((hook) => `- ${hook}`)
            .join('\n')}`
        : '';

    const feedbackBlock = feedback
      ? `\nYour previous attempt at this script scored ${feedback.scores.overall}/10 overall and was rejected. Feedback: "${feedback.scores.improvementNotes}"
Specifically fix that in this attempt — do not repeat the same hook, structure, or wording as before.\n`
      : '';

    return `Write an original ${settings.videoDurationSeconds}-second Instagram Reel script in
${settings.language} about: "${topic.title}".

Audience: ${settings.audienceLevel} level, in the niche "${settings.niche}". They have NO
background in this specific topic. The ONE thing they must walk away knowing is:
"${topic.coreLesson}"
Use this real-world analogy or comparison to make it concrete: "${topic.visualIdea}"

Reel structure/format: ${formatPromptHint(topic.format)}
Opening hook style: ${hookCategoryPromptHint(topic.hookCategory)}

Writing style: ${settings.writingStyle}.
Target speaking pace: about ${WORDS_PER_SECOND} words/second, so aim for roughly
${Math.round(settings.videoDurationSeconds * WORDS_PER_SECOND)} total words across hook + lines + CTA.

Research to draw from (do not just read this list — synthesize it into a natural script):
- Key points: ${research.keyPoints.join(' | ')}
- Facts: ${research.facts.map((fact) => `${fact.point}: ${fact.detail}`).join(' | ')}
- Examples: ${research.examples.map((example) => `${example.title}: ${example.description}`).join(' | ')}
- Suggested angle: ${research.suggestedAngle}

Write like a real person explaining something to a friend, not documentation. Concretely:
- Short sentences. One idea per sentence.
- If you use a technical term or acronym, explain it in plain words the moment you first say it —
  never assume the viewer already knows it.
- Vary sentence starts naturally — if you use a transition like "here's the interesting part",
  "but there's a catch", "here's a simple example", "think about it like this", or "the easiest
  way to remember this is...", use it at most once and only where it actually fits.
- NEVER use these phrases or their equivalents: ${BANNED_PHRASES.map((p) => `"${p}"`).join(', ')}.
- Acronyms or technical words the text-to-speech voice would mispronounce (e.g. "SQL", "API")
  should be written the way they're actually spoken (e.g. "sequel", "A P I") or worked around with
  plain language, since this script is read aloud by a TTS engine, not displayed as text.
- The hook must grab attention in the first 3 seconds — no throat-clearing.
- End with a specific, natural call-to-action (e.g. follow for more, comment a question, save this
  if it's useful) — only if it fits naturally, don't force one in.
- Be 100% original — do not copy phrasing from the research verbatim.
${exclusion}
${feedbackBlock}
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
