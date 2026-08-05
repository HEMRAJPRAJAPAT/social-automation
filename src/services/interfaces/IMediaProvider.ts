import type { MediaProviderName, MediaSearchResult } from '../../entities/MediaAsset.js';

export interface MediaSearchOptions {
  perPage?: number;
  orientation?: 'portrait' | 'landscape' | 'square';
  minDurationSeconds?: number;
  /** Provider asset ids already used, to skip re-selecting the same clip. */
  excludeProviderAssetIds?: string[];
}

/** Port for a stock media backend (Pexels, Pixabay, ...). */
export interface IMediaProvider {
  readonly name: MediaProviderName;

  searchVideos(query: string, options?: MediaSearchOptions): Promise<MediaSearchResult[]>;
  searchImages(query: string, options?: MediaSearchOptions): Promise<MediaSearchResult[]>;
}
