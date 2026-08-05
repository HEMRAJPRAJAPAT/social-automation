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
}

export interface SubtitleTrack {
  cues: SubtitleCue[];
  wordTimings: WordTiming[];
  srtFilePath: string;
}
