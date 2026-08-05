import type { PrismaClient } from '@prisma/client';

import type { StockMediaAsset } from '../../entities/MediaAsset.js';
import type { IMediaAssetRepository } from '../interfaces/IMediaAssetRepository.js';

export class PrismaMediaAssetRepository implements IMediaAssetRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(postId: string, asset: StockMediaAsset): Promise<StockMediaAsset & { id: string }> {
    const row = await this.prisma.mediaAsset.create({
      data: {
        postId,
        provider: asset.provider,
        providerAssetId: asset.providerAssetId,
        type: asset.type,
        query: asset.query,
        sourceUrl: asset.sourceUrl,
        localPath: asset.localPath,
        checksum: asset.checksum,
        width: asset.width,
        height: asset.height,
        durationSeconds: asset.durationSeconds,
      },
    });
    return { ...asset, id: row.id };
  }

  async findExistingChecksums(): Promise<string[]> {
    const rows = await this.prisma.mediaAsset.findMany({ select: { checksum: true } });
    return rows.map((row) => row.checksum);
  }
}
