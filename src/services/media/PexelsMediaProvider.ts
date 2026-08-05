import axios, { isAxiosError } from 'axios';

import type { MediaSearchResult } from '../../entities/MediaAsset.js';
import type { IApiLogRepository } from '../../repositories/interfaces/IApiLogRepository.js';
import { childLogger } from '../../utils/logger.js';
import { withRetry } from '../../utils/retry.js';
import type { IMediaProvider, MediaSearchOptions } from '../interfaces/IMediaProvider.js';

const log = childLogger('pexels-media');

interface PexelsVideoFile {
  link: string;
  width: number;
  height: number;
  file_type: string;
  quality: string;
}

interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  duration: number;
  video_files: PexelsVideoFile[];
}

interface PexelsVideoSearchResponse {
  videos: PexelsVideo[];
}

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  src: { original: string; portrait: string; large2x: string };
}

interface PexelsPhotoSearchResponse {
  photos: PexelsPhoto[];
}

function pickBestVideoFile(files: PexelsVideoFile[]): PexelsVideoFile | undefined {
  const mp4Portrait = files
    .filter((file) => file.file_type === 'video/mp4' && file.height >= file.width)
    .sort((a, b) => a.height - b.height);
  return (
    mp4Portrait.find((file) => file.height >= 1080) ??
    mp4Portrait[mp4Portrait.length - 1] ??
    files[0]
  );
}

export class PexelsMediaProvider implements IMediaProvider {
  public readonly name = 'PEXELS' as const;

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
    const response = await this.call<PexelsVideoSearchResponse>('/videos/search', {
      query,
      orientation: options.orientation ?? 'portrait',
      per_page: options.perPage ?? 10,
    });

    return response.videos
      .filter((video) => String(video.id) && !excluded.has(String(video.id)))
      .filter(
        (video) => !options.minDurationSeconds || video.duration >= options.minDurationSeconds,
      )
      .map((video): MediaSearchResult | null => {
        const file = pickBestVideoFile(video.video_files);
        return file
          ? {
              provider: 'PEXELS',
              providerAssetId: String(video.id),
              type: 'VIDEO',
              query,
              sourceUrl: file.link,
              width: file.width,
              height: file.height,
              durationSeconds: video.duration,
            }
          : null;
      })
      .filter((asset): asset is MediaSearchResult => asset !== null);
  }

  async searchImages(
    query: string,
    options: MediaSearchOptions = {},
  ): Promise<MediaSearchResult[]> {
    const excluded = new Set(options.excludeProviderAssetIds ?? []);
    const response = await this.call<PexelsPhotoSearchResponse>('/v1/search', {
      query,
      orientation: options.orientation ?? 'portrait',
      per_page: options.perPage ?? 10,
    });

    return response.photos
      .filter((photo) => !excluded.has(String(photo.id)))
      .map((photo) => ({
        provider: 'PEXELS' as const,
        providerAssetId: String(photo.id),
        type: 'IMAGE' as const,
        query,
        sourceUrl: photo.src.portrait ?? photo.src.large2x ?? photo.src.original,
        width: photo.width,
        height: photo.height,
        durationSeconds: null,
      }));
  }

  private async call<T>(path: string, params: Record<string, string | number>): Promise<T> {
    const isVideoEndpoint = path.startsWith('/videos');
    const baseUrl = isVideoEndpoint ? 'https://api.pexels.com' : 'https://api.pexels.com';
    const url = `${baseUrl}${path}`;
    let attemptCounter = 0;

    return withRetry(
      async () => {
        attemptCounter += 1;
        const startedAt = Date.now();
        try {
          const result = await axios.get<T>(url, {
            params,
            headers: { Authorization: this.apiKey },
            timeout: 20_000,
          });
          await this.apiLogRepository.log({
            provider: 'pexels',
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
            provider: 'pexels',
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
        label: `pexels:${path}`,
        isRetryable: (error) => !isAxiosError(error) || (error.response?.status ?? 500) >= 500,
      },
    ).catch((error) => {
      log.error({ path, error }, 'Pexels request failed after retries');
      throw error;
    });
  }
}
