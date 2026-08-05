import type { PublishResult } from '../entities/PublishResult.js';

export interface PublishReelInput {
  /** Publicly reachable URL to the rendered MP4 (Instagram Graph API fetches by URL). */
  videoUrl: string;
  caption: string;
}

/** Port for publishing a Reel to a social platform. */
export interface IPublisher {
  readonly platform: string;

  publishReel(input: PublishReelInput): Promise<PublishResult>;
}
