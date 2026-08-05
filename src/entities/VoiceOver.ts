export interface VoiceOverResult {
  audioFilePath: string;
  durationSeconds: number;
  sampleRateHz: number;
  provider: string;
  text: string;
}
