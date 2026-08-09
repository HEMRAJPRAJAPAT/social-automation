import { z } from 'zod';

import type { Script } from '../entities/Script.js';
import type { Topic } from '../entities/Topic.js';
import type { VisualPlan, VisualScene } from '../entities/VisualPlan.js';
import type { ILlmProvider } from '../services/interfaces/ILlmProvider.js';
import { childLogger } from '../utils/logger.js';

const log = childLogger('visual-planner');

const diagramBoxSchema = z.object({ label: z.string().min(1).max(40) });

const visualSceneSchema = z.discriminatedUnion('type', [
  z.object({
    lineIndex: z.number().int().nonnegative(),
    type: z.literal('stock'),
    stockKeywords: z.array(z.string().min(2)).min(1).max(3),
  }),
  z.object({
    lineIndex: z.number().int().nonnegative(),
    type: z.literal('diagram'),
    diagramSpec: z.object({
      title: z.string().min(1).max(60),
      boxes: z.array(diagramBoxSchema).min(2).max(3),
      layout: z.enum(['vertical-flow', 'horizontal-flow']),
    }),
  }),
]);

const visualPlanSchema = z.object({ scenes: z.array(visualSceneSchema).min(1) });

const MAX_ATTEMPTS = 2;

/** Every scene defaults to plain stock footage if the LLM call/validation fails — a broken
 * visual plan must never block the Reel, it just means a less interesting video. */
function fallbackPlan(script: Script): VisualPlan {
  return {
    scenes: script.lines.map((line): VisualScene => ({
      lineIndex: line.index,
      type: 'stock',
      stockKeywords: [line.visualKeyword || 'technology'],
    })),
  };
}

/**
 * Decides, per script line, whether to show a matched stock clip or a simple
 * animated text/diagram card (see VideoComposer.renderDiagramCard) — used
 * for lines whose visualIdea is a concept/analogy that's clearer as a
 * diagram than as generic b-roll.
 */
export class VisualPlanner {
  constructor(private readonly llm: ILlmProvider) {}

  async plan(script: Script, topic: Topic, postId: string): Promise<VisualPlan> {
    const prompt = this.buildPrompt(script, topic);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const raw = await this.llm.generateJson<unknown>(prompt, {
          purpose: 'VISUAL_PLAN',
          postId,
        });
        const parsed = visualPlanSchema.safeParse(raw);
        if (!parsed.success) {
          log.warn({ attempt, issues: parsed.error.issues, raw }, 'visual plan failed validation');
          continue;
        }

        const planned = new Set(parsed.data.scenes.map((s) => s.lineIndex));
        const missing = script.lines.filter((line) => !planned.has(line.index));
        if (missing.length > 0) {
          // Fill in any line the LLM skipped with a plain stock scene rather than retrying —
          // a partial plan is still useful, unlike a parse failure.
          for (const line of missing) {
            parsed.data.scenes.push({
              lineIndex: line.index,
              type: 'stock',
              stockKeywords: [line.visualKeyword || 'technology'],
            });
          }
        }
        return parsed.data;
      } catch (error) {
        log.warn({ attempt, error }, 'visual planner LLM call failed');
      }
    }

    log.warn(
      { postId },
      'visual planning failed after all attempts, falling back to plain stock footage',
    );
    return fallbackPlan(script);
  }

  private buildPrompt(script: Script, topic: Topic): string {
    const lines = script.lines
      .map(
        (line) => `${line.index}: "${line.text}" (suggested visual keyword: ${line.visualKeyword})`,
      )
      .join('\n');

    return `You are a visual director for a vertical (9:16) Instagram Reel. The core visual concept
for this video is: "${topic.visualIdea}"

Script lines:
${lines}

For EACH line index above, decide the visual treatment:
- "stock": normal stock footage/photo b-roll — good for anything concrete and filmable (people,
  devices, code on screen, everyday objects/actions).
- "diagram": a simple animated text/box card — use this ONLY for a line that explains a concept,
  comparison, or process that is much clearer as 2-3 labeled boxes than as generic b-roll (e.g. "a
  request going to a server and back", "before vs after", "A causes B"). Do not overuse this — most
  lines should be "stock". A diagram needs a short title and 2-3 short box labels (each under 4
  words), in a vertical-flow (stacked top-to-bottom) or horizontal-flow (left-to-right) layout.

Respond with ONLY a JSON object, no markdown fences, matching exactly this shape:
{
  "scenes": [
    { "lineIndex": 0, "type": "stock", "stockKeywords": ["1-3 words", "optional alt keyword"] },
    { "lineIndex": 1, "type": "diagram", "diagramSpec": { "title": "short title", "boxes": [{ "label": "short label" }, { "label": "short label" }], "layout": "vertical-flow" } }
  ]
}`;
  }
}
