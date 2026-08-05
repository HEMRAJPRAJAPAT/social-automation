import type { RenderedVideo } from '../entities/RenderedVideo.js';

import type { ComposeVideoInput } from './VideoComposer.js';

/** Port for the "Video Composer" module (spec §8). */
export interface IVideoComposer {
  compose(input: ComposeVideoInput): Promise<RenderedVideo>;
}
