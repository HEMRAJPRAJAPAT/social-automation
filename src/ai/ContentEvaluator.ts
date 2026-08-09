import { z } from 'zod';

import type { EvaluationScores } from '../entities/ContentEvaluation.js';
import type { ContentSettings } from '../entities/ContentSettings.js';
import type { Script } from '../entities/Script.js';
import type { Topic } from '../entities/Topic.js';
import type { ILlmProvider } from '../services/interfaces/ILlmProvider.js';
import { childLogger } from '../utils/logger.js';

const log = childLogger('content-evaluator');

const evaluationSchema = z.object({
  hookStrength: z.number().min(0).max(10),
  clarity: z.number().min(0).max(10),
  beginnerFriendliness: z.number().min(0).max(10),
  originality: z.number().min(0).max(10),
  visualFeasibility: z.number().min(0).max(10),
  value: z.number().min(0).max(10),
  overall: z.number().min(0).max(10),
  improvementNotes: z.string().min(5).max(500),
});

/**
 * A neutral-but-passing score used whenever the evaluator's own LLM call or
 * JSON output fails — a broken evaluator must never block a Reel from
 * shipping (it's a quality *nudge*, not a hard gate on the whole pipeline).
 */
const FAIL_OPEN_SCORE: EvaluationScores = {
  hookStrength: 7,
  clarity: 7,
  beginnerFriendliness: 7,
  originality: 7,
  visualFeasibility: 7,
  value: 7,
  overall: 7,
  improvementNotes:
    'Evaluator response was unavailable or unparsable; defaulted to a passing score.',
};

/**
 * Scores a generated script against a beginner-friendliness/engagement
 * rubric so PipelineOrchestrator's SCRIPT step can regenerate weak content
 * before it ever reaches voice/video rendering (spec: content-quality gate).
 */
export class ContentEvaluator {
  constructor(private readonly llm: ILlmProvider) {}

  async evaluate(
    script: Script,
    topic: Topic,
    settings: ContentSettings,
    postId: string,
  ): Promise<EvaluationScores> {
    const prompt = this.buildPrompt(script, topic, settings);
    try {
      const raw = await this.llm.generateJson<unknown>(prompt, { purpose: 'CONTENT_EVAL', postId });
      const parsed = evaluationSchema.safeParse(raw);
      if (!parsed.success) {
        log.warn(
          { issues: parsed.error.issues, raw },
          'evaluation JSON failed validation, failing open',
        );
        return FAIL_OPEN_SCORE;
      }
      return parsed.data;
    } catch (error) {
      log.warn({ error }, 'evaluator LLM call failed, failing open');
      return FAIL_OPEN_SCORE;
    }
  }

  private buildPrompt(script: Script, topic: Topic, settings: ContentSettings): string {
    const fullScript = [script.hook, ...script.lines.map((l) => l.text), script.callToAction].join(
      '\n',
    );

    return `You are a strict but fair short-form video content critic. Score this Instagram Reel
script for a ${settings.audienceLevel}-level audience in the niche "${settings.niche}".

The ONE thing the viewer must walk away knowing: "${topic.coreLesson}"

Script:
"""
${fullScript}
"""

Score each dimension 0-10:
- hookStrength: does the first line earn 3 more seconds of attention? Generic/soft opens score low.
- clarity: is it explained simply, with short sentences and no unexplained jargon or acronyms?
- beginnerFriendliness: could someone with zero background in this specific topic follow it?
- originality: does it avoid generic textbook phrasing ("X is a Y that Zs")?
- visualFeasibility: can this be shown with normal stock footage or a simple text/diagram card —
  penalize scripts that need something impossible to visualize simply.
- value: is the core lesson genuinely useful and specific, not vague?
- overall: your holistic 0-10 score for whether this should ship as-is.

Respond with ONLY a JSON object, no markdown fences, matching exactly this shape:
{
  "hookStrength": 0-10,
  "clarity": 0-10,
  "beginnerFriendliness": 0-10,
  "originality": 0-10,
  "visualFeasibility": 0-10,
  "value": 0-10,
  "overall": 0-10,
  "improvementNotes": "string, 1-3 sentences on the single biggest thing to fix, or empty praise if it's already strong"
}`;
  }
}
