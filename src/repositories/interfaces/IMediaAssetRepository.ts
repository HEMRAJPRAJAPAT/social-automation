import type { StockMediaAsset } from '../../entities/MediaAsset.js';

export interface IMediaAssetRepository {
  create(postId: string, asset: StockMediaAsset): Promise<StockMediaAsset & { id: string }>;
  findExistingChecksums(): Promise<string[]>;
}
