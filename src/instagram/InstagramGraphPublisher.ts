import axios, { isAxiosError } from 'axios';

import type { PublishResult } from '../entities/PublishResult.js';
import type { IApiLogRepository } from '../repositories/interfaces/IApiLogRepository.js';
import { childLogger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';

import type { IPublisher, PublishReelInput } from './IPublisher.js';

const log = childLogger('instagram-publisher');

const CONTAINER_POLL_INTERVAL_MS = 10_000;
const CONTAINER_POLL_MAX_ATTEMPTS = 30; // ~5 minutes

type ContainerStatus = 'IN_PROGRESS' | 'FINISHED' | 'ERROR' | 'EXPIRED' | 'PUBLISHED';

interface CreateContainerResponse {
  id: string;
}

interface ContainerStatusResponse {
  status_code: ContainerStatus;
}

interface PublishResponse {
  id: string;
}

interface PermalinkResponse {
  permalink?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface GraphApiError {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

function graphError(error: unknown): GraphApiError | undefined {
  if (!isAxiosError(error)) return undefined;
  return (error.response?.data as { error?: GraphApiError } | undefined)?.error;
}

// Meta commonly signals throttling via HTTP 400 with one of these error
// codes rather than a 429 — codes 4/17/32/613 are transient app/user/page
// rate limits. Subcode 2207042 is the Reels *daily posting cap*, a separate,
// non-transient limit that retrying will never clear, so it's excluded.
const RATE_LIMIT_ERROR_CODES = new Set([4, 17, 32, 613]);

function isRateLimitError(error: unknown): boolean {
  const detail = graphError(error);
  if (!detail) return false;
  if (detail.error_subcode === 2207042) return false;
  return detail.code !== undefined && RATE_LIMIT_ERROR_CODES.has(detail.code);
}

/**
 * Publishes to Instagram via the official Meta Graph API's Content
 * Publishing endpoints (spec §11). Requires a Business or Creator account
 * connected to a Facebook Page, with a long-lived access token that has the
 * `instagram_content_publish` permission.
 */
export class InstagramGraphPublisher implements IPublisher {
  public readonly platform = 'instagram';

  constructor(
    private readonly accessToken: string,
    private readonly businessAccountId: string,
    private readonly apiVersion: string,
    private readonly apiLogRepository: IApiLogRepository,
    private readonly retryAttempts: number,
    private readonly retryBaseDelayMs: number,
  ) {}

  async publishReel(input: PublishReelInput): Promise<PublishResult> {
    const containerId = await this.createContainer(input.videoUrl, input.caption);
    await this.waitUntilFinished(containerId);
    const mediaId = await this.publishContainer(containerId);
    const permalink = await this.fetchPermalink(mediaId);

    return {
      instagramContainerId: containerId,
      instagramMediaId: mediaId,
      instagramPermalink: permalink,
      publishedAt: new Date(),
    };
  }

  private baseUrl(nodePath: string): string {
    return `https://graph.facebook.com/${this.apiVersion}/${nodePath}`;
  }

  private async createContainer(videoUrl: string, caption: string): Promise<string> {
    const response = await this.request<CreateContainerResponse>('media:create', () =>
      axios.post(this.baseUrl(`${this.businessAccountId}/media`), null, {
        params: {
          media_type: 'REELS',
          video_url: videoUrl,
          caption,
          access_token: this.accessToken,
        },
        timeout: 30_000,
      }),
    );
    log.info({ containerId: response.id }, 'created Instagram media container');
    return response.id;
  }

  private async waitUntilFinished(containerId: string): Promise<void> {
    for (let attempt = 1; attempt <= CONTAINER_POLL_MAX_ATTEMPTS; attempt++) {
      const status = await this.request<ContainerStatusResponse>('media:status', () =>
        axios.get(this.baseUrl(containerId), {
          params: { fields: 'status_code', access_token: this.accessToken },
          timeout: 15_000,
        }),
      );

      log.debug({ containerId, attempt, status: status.status_code }, 'polled container status');

      if (status.status_code === 'FINISHED' || status.status_code === 'PUBLISHED') return;
      if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
        throw new Error(
          `Instagram media container ${containerId} failed with status ${status.status_code}`,
        );
      }

      await sleep(CONTAINER_POLL_INTERVAL_MS);
    }

    throw new Error(`Instagram media container ${containerId} did not finish processing in time`);
  }

  private async publishContainer(containerId: string): Promise<string> {
    const response = await this.request<PublishResponse>('media_publish', () =>
      axios.post(this.baseUrl(`${this.businessAccountId}/media_publish`), null, {
        params: { creation_id: containerId, access_token: this.accessToken },
        timeout: 30_000,
      }),
    );
    log.info({ mediaId: response.id }, 'published Instagram Reel');
    return response.id;
  }

  private async fetchPermalink(mediaId: string): Promise<string | null> {
    try {
      const response = await this.request<PermalinkResponse>('permalink', () =>
        axios.get(this.baseUrl(mediaId), {
          params: { fields: 'permalink', access_token: this.accessToken },
          timeout: 15_000,
        }),
      );
      return response.permalink ?? null;
    } catch (error) {
      log.warn({ mediaId, error }, 'failed to fetch permalink; continuing without it');
      return null;
    }
  }

  private async request<T>(
    endpoint: string,
    fn: () => Promise<{ status: number; data: T }>,
  ): Promise<T> {
    let attemptCounter = 0;

    return withRetry(
      async () => {
        attemptCounter += 1;
        const startedAt = Date.now();
        try {
          const result = await fn();
          await this.apiLogRepository.log({
            provider: 'instagram',
            endpoint,
            method: 'POST',
            statusCode: result.status,
            latencyMs: Date.now() - startedAt,
            attempt: attemptCounter,
            success: true,
          });
          return result.data;
        } catch (error) {
          const statusCode = isAxiosError(error) ? error.response?.status : undefined;
          const detail = graphError(error);
          await this.apiLogRepository.log({
            provider: 'instagram',
            endpoint,
            method: 'POST',
            statusCode,
            latencyMs: Date.now() - startedAt,
            attempt: attemptCounter,
            success: false,
            errorMessage: detail
              ? JSON.stringify(detail)
              : error instanceof Error
                ? error.message
                : String(error),
          });
          throw error;
        }
      },
      {
        attempts: this.retryAttempts,
        baseDelayMs: this.retryBaseDelayMs,
        label: `instagram:${endpoint}`,
        isRetryable: (error) => {
          if (!isAxiosError(error)) return true;
          const status = error.response?.status;
          if (status === undefined || status >= 500 || status === 429) return true;
          return status === 400 && isRateLimitError(error);
        },
      },
    );
  }
}
