export type MediaProviderName = 'PEXELS' | 'PIXABAY';
export type MediaAssetType = 'VIDEO' | 'IMAGE';

/** A search hit from a stock media provider, before it has been downloaded. */
export interface MediaSearchResult {
  provider: MediaProviderName;
  providerAssetId: string;
  type: MediaAssetType;
  query: string;
  sourceUrl: string;
  width: number;
  height: number;
  durationSeconds: number | null;
}

/** A search result after it has been downloaded to local disk. */
export interface StockMediaAsset extends MediaSearchResult {
  localPath: string;
  checksum: string;
}

/** A downloaded asset tagged with which script line it illustrates. */
export interface SourcedMediaAsset {
  lineIndex: number;
  asset: StockMediaAsset;
}
