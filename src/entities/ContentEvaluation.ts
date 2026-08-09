/** Content-quality rubric scores (each 0-10) produced by ContentEvaluator. */
export interface EvaluationScores {
  hookStrength: number;
  clarity: number;
  beginnerFriendliness: number;
  originality: number;
  visualFeasibility: number;
  value: number;
  overall: number;
  improvementNotes: string;
}
