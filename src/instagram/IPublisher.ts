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

  /**
   * Cheap preflight run before any step that spends quota. Throws only when
   * the credentials are definitely unusable (expired, revoked, missing
   * permission); a transient failure that says nothing about them must not
   * block the run.
   */
  verifyCredentials?(): Promise<void>;
}
