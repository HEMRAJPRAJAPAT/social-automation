import type { PublishResult } from '../entities/PublishResult.js';
import { childLogger } from '../utils/logger.js';

import type { IPublisher, PublishReelInput } from './IPublisher.js';

const log = childLogger('null-publisher');

/**
 * Stands in for InstagramGraphPublisher when PUBLISH_ENABLED=false. Lets the
 * full pipeline run and render a Reel without ever calling the Graph API, so
 * it can be inspected locally (via the storage URL) before wiring up real
 * Instagram publishing.
 */
export class NullPublisher implements IPublisher {
  public readonly platform = 'instagram-dry-run';

  async publishReel(input: PublishReelInput): Promise<PublishResult> {
    log.info(
      { videoUrl: input.videoUrl },
      'PUBLISH_ENABLED=false — skipping Instagram upload; Reel is available locally at videoUrl',
    );
    return {
      instagramContainerId: 'dry-run',
      instagramMediaId: 'dry-run',
      instagramPermalink: input.videoUrl,
      publishedAt: new Date(),
    };
  }
}
