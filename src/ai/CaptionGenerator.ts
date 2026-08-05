import { z } from 'zod';

import type { ContentSettings } from '../entities/ContentSettings.js';
import type { Script } from '../entities/Script.js';
import type { Topic } from '../entities/Topic.js';
import type { ILlmProvider } from '../services/interfaces/ILlmProvider.js';
import { childLogger } from '../utils/logger.js';

const log = childLogger('caption-generator');

const captionSchema = z.object({
  igTitle: z.string().min(5).max(100),
  captionText: z.string().min(20).max(2200),
});

export interface CaptionResult {
  igTitle: string;
  captionText: string;
}

export class CaptionGenerator {
  constructor(private readonly llm: ILlmProvider) {}

  async generate(
    topic: Topic,
    script: Script,
    settings: ContentSettings,
    postId: string,
  ): Promise<CaptionResult> {
    const prompt = `Write an Instagram Reel title and caption for a video about: "${topic.title}".

The video's hook is: "${script.hook}"
The video's call-to-action is: "${script.callToAction}"
Niche: ${settings.niche}. Language: ${settings.language}. Tone: ${settings.writingStyle}.

Requirements for the caption:
- Friendly and conversational, written like a real creator, not a corporate brand.
- SEO-optimized: naturally include the topic's core keywords a viewer might search for.
- Engaging: open with a strong first line (Instagram truncates after ~125 characters), use
  short paragraphs/line breaks, and end with a question or prompt that invites comments.
- Do NOT include hashtags in captionText — those are generated separately.

Requirements for igTitle:
- A short, punchy title (under 100 characters) suitable as the Reel's on-platform title field.

Respond with ONLY a JSON object, no markdown fences, matching exactly this shape:
{
  "igTitle": "string",
  "captionText": "string"
}`;

    const raw = await this.llm.generateJson<unknown>(prompt, { purpose: 'CAPTION', postId });
    const parsed = captionSchema.safeParse(raw);
    if (!parsed.success) {
      log.error({ issues: parsed.error.issues, raw }, 'caption JSON failed validation');
      throw new Error(`Caption generation for "${topic.title}" failed schema validation`);
    }
    return parsed.data;
  }
}
