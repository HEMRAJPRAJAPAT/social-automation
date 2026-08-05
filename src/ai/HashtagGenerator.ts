import { z } from 'zod';

import type { ContentSettings } from '../entities/ContentSettings.js';
import type { Topic } from '../entities/Topic.js';
import type { ILlmProvider } from '../services/interfaces/ILlmProvider.js';
import { childLogger } from '../utils/logger.js';

const log = childLogger('hashtag-generator');

const MIN_HASHTAGS = 15;
const MAX_HASHTAGS = 20;

const hashtagSchema = z.object({
  small: z.array(z.string().min(2)).min(3),
  medium: z.array(z.string().min(2)).min(3),
  popular: z.array(z.string().min(2)).min(3),
});

function normalizeHashtag(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/^#/, '')
    .replace(/[^a-zA-Z0-9]/g, '');
  return cleaned ? `#${cleaned}` : '';
}

export class HashtagGenerator {
  constructor(private readonly llm: ILlmProvider) {}

  async generate(topic: Topic, settings: ContentSettings, postId: string): Promise<string[]> {
    const prompt = `Generate Instagram hashtags for a Reel about: "${topic.title}" in the niche
"${settings.niche}". Keywords: ${topic.keywords.join(', ')}.

Return three tiers of hashtags relevant to both the specific topic and the broader niche:
- "small": niche/low-competition tags (roughly under 50k posts) — highly specific to this exact topic.
- "medium": moderately competitive tags (roughly 50k-500k posts) — related to the niche.
- "popular": broad, high-volume tags (500k+ posts) — general category tags.

Provide at least 5 tags per tier. Do not include the "#" symbol, spaces, or punctuation in each tag.

Respond with ONLY a JSON object, no markdown fences, matching exactly this shape:
{
  "small": ["tag1", "tag2", "..."],
  "medium": ["tag1", "tag2", "..."],
  "popular": ["tag1", "tag2", "..."]
}`;

    const raw = await this.llm.generateJson<unknown>(prompt, { purpose: 'HASHTAGS', postId });
    const parsed = hashtagSchema.safeParse(raw);
    if (!parsed.success) {
      log.error({ issues: parsed.error.issues, raw }, 'hashtag JSON failed validation');
      throw new Error(`Hashtag generation for "${topic.title}" failed schema validation`);
    }

    return this.mergeAndDedupe(parsed.data);
  }

  private mergeAndDedupe(tiers: z.infer<typeof hashtagSchema>): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    // Interleave tiers (small, medium, popular) so the final list keeps a healthy mix
    // even after truncating to MAX_HASHTAGS.
    const maxTierLength = Math.max(tiers.small.length, tiers.medium.length, tiers.popular.length);
    for (let i = 0; i < maxTierLength && result.length < MAX_HASHTAGS; i++) {
      for (const tier of [tiers.small, tiers.medium, tiers.popular]) {
        const candidate = tier[i];
        if (!candidate) continue;
        const normalized = normalizeHashtag(candidate);
        const key = normalized.toLowerCase();
        if (normalized && !seen.has(key)) {
          seen.add(key);
          result.push(normalized);
        }
        if (result.length >= MAX_HASHTAGS) break;
      }
    }

    if (result.length < MIN_HASHTAGS) {
      log.warn(
        { count: result.length },
        'fewer than the minimum recommended hashtags were produced',
      );
    }

    return result;
  }
}
