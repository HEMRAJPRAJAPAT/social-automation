export interface ScriptLine {
  /** Sequential index, used to align narration with subtitles and b-roll cuts. */
  index: number;
  text: string;
  /** Rough intent tag, used to pick matching stock footage search queries. */
  visualKeyword: string;
}

export interface Script {
  hook: string;
  lines: ScriptLine[];
  callToAction: string;
  fullNarrationText: string;
  estimatedDurationSeconds: number;
  language: string;
}
