import { z } from 'zod';

import type { ResearchResult } from '../entities/ResearchResult.js';
import type { Topic } from '../entities/Topic.js';
import type { ILlmProvider } from '../services/interfaces/ILlmProvider.js';
import { childLogger } from '../utils/logger.js';

const log = childLogger('research-service');

const researchSchema = z.object({
  topicTitle: z.string(),
  keyPoints: z.array(z.string()).min(3).max(8),
  facts: z
    .array(
      z.object({
        point: z.string(),
        detail: z.string(),
        source: z.enum(['model-knowledge', 'provided-context']),
      }),
    )
    .min(2)
    .max(8),
  examples: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
      }),
    )
    .min(1)
    .max(5),
  latestDevelopments: z.array(z.string()).min(0).max(5),
  suggestedAngle: z.string(),
});

export class ResearchService {
  constructor(private readonly llm: ILlmProvider) {}

  async research(topic: Topic, postId: string): Promise<ResearchResult> {
    const prompt = this.buildPrompt(topic);
    const raw = await this.llm.generateJson<unknown>(prompt, { purpose: 'RESEARCH', postId });

    const parsed = researchSchema.safeParse(raw);
    if (!parsed.success) {
      log.error({ issues: parsed.error.issues, raw }, 'research JSON failed validation');
      throw new Error(`Research output for "${topic.title}" failed schema validation`);
    }

    return parsed.data;
  }

  private buildPrompt(topic: Topic): string {
    return `You are a meticulous researcher preparing background material for a short-form
Instagram Reel about: "${topic.title}".

Context already decided for this video:
- Hook: ${topic.hook}
- Summary: ${topic.summary}
- Keywords: ${topic.keywords.join(', ')}

Research this topic and extract everything a scriptwriter would need. Be specific and concrete
— avoid vague generalities. Where you are not certain about very recent/dated facts, phrase them
as general, evergreen knowledge rather than stating a specific date with false confidence.

Respond with ONLY a JSON object, no markdown fences, matching exactly this shape:
{
  "topicTitle": "${topic.title}",
  "keyPoints": ["3-8 short strings, the core points the video must communicate"],
  "facts": [
    { "point": "string", "detail": "string, a concrete supporting fact or statistic", "source": "model-knowledge" }
  ],
  "examples": [
    { "title": "string", "description": "string, a concrete example or analogy" }
  ],
  "latestDevelopments": ["0-5 short strings on recent/current developments, if relevant; [] if not applicable"],
  "suggestedAngle": "string, the single most compelling angle to lead the script with"
}`;
  }
}
