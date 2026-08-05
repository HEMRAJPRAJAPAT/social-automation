export type RenderStatus = 'PENDING' | 'RENDERING' | 'DONE' | 'FAILED';

export interface RenderedVideo {
  filePath: string;
  publicUrl: string | null;
  subtitlesPath: string;
  durationSeconds: number;
  width: number;
  height: number;
  fileSizeBytes: number;
  variantLabel: string;
  renderStatus: RenderStatus;
}
