import type { SourcedMediaAsset } from '../../entities/MediaAsset.js';
import type { Script } from '../../entities/Script.js';

/** Port for the "Stock Media Downloader" module (spec §6). */
export interface IMediaSourcingService {
  sourceForScript(script: Script, postId: string, workDir: string): Promise<SourcedMediaAsset[]>;
}
