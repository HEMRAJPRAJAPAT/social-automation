import axios, { isAxiosError } from 'axios';

import type { MediaSearchResult } from '../../entities/MediaAsset.js';
import type { IApiLogRepository } from '../../repositories/interfaces/IApiLogRepository.js';
import { childLogger } from '../../utils/logger.js';
import { withRetry } from '../../utils/retry.js';
import type { IMediaProvider, MediaSearchOptions } from '../interfaces/IMediaProvider.js';

const log = childLogger('pixabay-media');

interface PixabayVideoRendition {
  url: string;
  width: number;
  height: number;
}

interface PixabayVideoHit {
  id: number;
  duration: number;
  videos: {
    large: PixabayVideoRendition;
    medium: PixabayVideoRendition;
    small: PixabayVideoRendition;
    tiny: PixabayVideoRendition;
  };
}

interface PixabayVideoSearchResponse {
  hits: PixabayVideoHit[];
}

interface PixabayImageHit {
  id: number;
  imageWidth: number;
  imageHeight: number;
  largeImageURL: string;
  webformatURL: string;
}

interface PixabayImageSearchResponse {
  hits: PixabayImageHit[];
}

/**
 * Pixabay's video API does not support an orientation filter and most
 * footage is landscape — the VideoComposer's ffmpeg scale/crop step handles
 * fitting any source orientation into the 1080x1920 canvas, so this
 * provider does not attempt to pre-filter by aspect ratio.
 */
export class PixabayMediaProvider implements IMediaProvider {
  public readonly name = 'PIXABAY' as const;

  constructor(
    private readonly apiKey: string,
    private readonly apiLogRepository: IApiLogRepository,
    private readonly retryAttempts: number,
    private readonly retryBaseDelayMs: number,
  ) {}

  async searchVideos(
    query: string,
    options: MediaSearchOptions = {},
  ): Promise<MediaSearchResult[]> {
    const excluded = new Set(options.excludeProviderAssetIds ?? []);
    const response = await this.call<PixabayVideoSearchResponse>('/videos/', {
      q: query,
      per_page: options.perPage ?? 10,
    });

    return response.hits
      .filter((hit) => !excluded.has(String(hit.id)))
      .filter((hit) => !options.minDurationSeconds || hit.duration >= options.minDurationSeconds)
      .map((hit) => {
        const rendition =
          hit.videos.large ?? hit.videos.medium ?? hit.videos.small ?? hit.videos.tiny;
        return {
          provider: 'PIXABAY' as const,
          providerAssetId: String(hit.id),
          type: 'VIDEO' as const,
          query,
          sourceUrl: rendition.url,
          width: rendition.width,
          height: rendition.height,
          durationSeconds: hit.duration,
        };
      });
  }

  async searchImages(
    query: string,
    options: MediaSearchOptions = {},
  ): Promise<MediaSearchResult[]> {
    const excluded = new Set(options.excludeProviderAssetIds ?? []);
    const response = await this.call<PixabayImageSearchResponse>('/', {
      q: query,
      image_type: 'photo',
      orientation: 'vertical',
      per_page: options.perPage ?? 10,
    });

    return response.hits
      .filter((hit) => !excluded.has(String(hit.id)))
      .map((hit) => ({
        provider: 'PIXABAY' as const,
        providerAssetId: String(hit.id),
        type: 'IMAGE' as const,
        query,
        sourceUrl: hit.largeImageURL ?? hit.webformatURL,
        width: hit.imageWidth,
        height: hit.imageHeight,
        durationSeconds: null,
      }));
  }

  private async call<T>(path: string, params: Record<string, string | number>): Promise<T> {
    const url = `https://pixabay.com/api${path}`;
    let attemptCounter = 0;

    return withRetry(
      async () => {
        attemptCounter += 1;
        const startedAt = Date.now();
        try {
          const result = await axios.get<T>(url, {
            params: { ...params, key: this.apiKey },
            timeout: 20_000,
          });
          await this.apiLogRepository.log({
            provider: 'pixabay',
            endpoint: path,
            method: 'GET',
            statusCode: result.status,
            latencyMs: Date.now() - startedAt,
            attempt: attemptCounter,
            success: true,
            requestSummary: params,
          });
          return result.data;
        } catch (error) {
          const statusCode = isAxiosError(error) ? error.response?.status : undefined;
          await this.apiLogRepository.log({
            provider: 'pixabay',
            endpoint: path,
            method: 'GET',
            statusCode,
            latencyMs: Date.now() - startedAt,
            attempt: attemptCounter,
            success: false,
            errorMessage: error instanceof Error ? error.message : String(error),
            requestSummary: params,
          });
          throw error;
        }
      },
      {
        attempts: this.retryAttempts,
        baseDelayMs: this.retryBaseDelayMs,
        label: `pixabay:${path}`,
        isRetryable: (error) => !isAxiosError(error) || (error.response?.status ?? 500) >= 500,
      },
    ).catch((error) => {
      log.error({ path, error }, 'Pixabay request failed after retries');
      throw error;
    });
  }
}
