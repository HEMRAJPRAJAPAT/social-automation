export interface WordTiming {
  word: string;
  startSeconds: number;
  endSeconds: number;
}

export interface SubtitleCue {
  index: number;
  startSeconds: number;
  endSeconds: number;
  text: string;
  /** Per-word timings within this cue, used to render progressive karaoke-style highlighting. */
  words: WordTiming[];
}

export interface SubtitleTrack {
  cues: SubtitleCue[];
  wordTimings: WordTiming[];
  assFilePath: string;
}
