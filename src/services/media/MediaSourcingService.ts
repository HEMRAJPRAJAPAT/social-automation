import path from 'node:path';

import type {
  MediaSearchResult,
  SourcedMediaAsset,
  StockMediaAsset,
} from '../../entities/MediaAsset.js';
import type { Script } from '../../entities/Script.js';
import type { IMediaAssetRepository } from '../../repositories/interfaces/IMediaAssetRepository.js';
import { downloadToFile, ensureDir, sha256OfFile } from '../../utils/fs.js';
import { childLogger } from '../../utils/logger.js';
import type { IMediaProvider } from '../interfaces/IMediaProvider.js';
import type { IMediaSourcingService } from '../interfaces/IMediaSourcingService.js';

const log = childLogger('media-sourcing');

const CANDIDATES_PER_QUERY = 5;
const MIN_CLIP_DURATION_SECONDS = 3;

function extensionFor(asset: MediaSearchResult): string {
  if (asset.type === 'IMAGE') return '.jpg';
  const match = /\.(mp4|mov|webm)(?:\?|$)/i.exec(asset.sourceUrl);
  return match ? `.${match[1]?.toLowerCase()}` : '.mp4';
}

/**
 * Orchestrates the "Stock Media Downloader" module (spec §6): searches
 * Pexels first, falls back to Pixabay, and falls back to still images if no
 * matching video exists — deduplicating by file checksum so the same clip
 * is never used twice.
 */
export class MediaSourcingService implements IMediaSourcingService {
  constructor(
    private readonly providers: IMediaProvider[],
    private readonly mediaAssetRepository: IMediaAssetRepository,
  ) {}

  async sourceForScript(
    script: Script,
    postId: string,
    workDir: string,
  ): Promise<SourcedMediaAsset[]> {
    const mediaDir = path.join(workDir, 'media');
    await ensureDir(mediaDir);

    const usedChecksums = new Set(await this.mediaAssetRepository.findExistingChecksums());
    const usedProviderAssetIds = new Set<string>();
    const assets: SourcedMediaAsset[] = [];

    for (const line of script.lines) {
      const keyword = line.visualKeyword || script.hook;
      const asset = await this.sourceOne(
        keyword,
        line.index,
        mediaDir,
        usedChecksums,
        usedProviderAssetIds,
      );
      if (!asset) {
        log.warn(
          { keyword, lineIndex: line.index },
          'no stock media found for keyword; skipping this beat',
        );
        continue;
      }
      usedChecksums.add(asset.checksum);
      usedProviderAssetIds.add(`${asset.provider}:${asset.providerAssetId}`);
      await this.mediaAssetRepository.create(postId, asset);
      assets.push({ lineIndex: line.index, asset });
    }

    if (assets.length === 0) {
      throw new Error(
        'MediaSourcingService could not source any usable stock media for this script',
      );
    }

    return assets;
  }

  private async sourceOne(
    keyword: string,
    index: number,
    mediaDir: string,
    usedChecksums: Set<string>,
    usedProviderAssetIds: Set<string>,
  ): Promise<StockMediaAsset | null> {
    for (const provider of this.providers) {
      const candidate = await this.tryDownloadFirstFresh(
        provider,
        'video',
        keyword,
        index,
        mediaDir,
        usedChecksums,
        usedProviderAssetIds,
      );
      if (candidate) return candidate;
    }

    // No video matched anywhere — fall back to a still image (spec §6: "Fallback to images").
    for (const provider of this.providers) {
      const candidate = await this.tryDownloadFirstFresh(
        provider,
        'image',
        keyword,
        index,
        mediaDir,
        usedChecksums,
        usedProviderAssetIds,
      );
      if (candidate) return candidate;
    }

    return null;
  }

  private async tryDownloadFirstFresh(
    provider: IMediaProvider,
    kind: 'video' | 'image',
    keyword: string,
    index: number,
    mediaDir: string,
    usedChecksums: Set<string>,
    usedProviderAssetIds: Set<string>,
  ): Promise<StockMediaAsset | null> {
    const excludeProviderAssetIds = [...usedProviderAssetIds]
      .filter((id) => id.startsWith(`${provider.name}:`))
      .map((id) => id.split(':')[1] ?? '');

    const results =
      kind === 'video'
        ? await provider.searchVideos(keyword, {
            perPage: CANDIDATES_PER_QUERY,
            orientation: 'portrait',
            minDurationSeconds: MIN_CLIP_DURATION_SECONDS,
            excludeProviderAssetIds,
          })
        : await provider.searchImages(keyword, {
            perPage: CANDIDATES_PER_QUERY,
            orientation: 'portrait',
            excludeProviderAssetIds,
          });

    for (const result of results) {
      const key = `${result.provider}:${result.providerAssetId}`;
      if (usedProviderAssetIds.has(key)) continue;

      const fileName = `${String(index).padStart(2, '0')}-${result.provider.toLowerCase()}-${result.providerAssetId}${extensionFor(result)}`;
      const localPath = path.join(mediaDir, fileName);

      try {
        await downloadToFile(result.sourceUrl, localPath);
        const checksum = await sha256OfFile(localPath);
        if (usedChecksums.has(checksum)) {
          log.debug(
            { checksum, key },
            'downloaded asset is a duplicate of one already used, trying next candidate',
          );
          continue;
        }
        return { ...result, localPath, checksum };
      } catch (error) {
        log.warn({ key, error }, 'failed to download candidate, trying next');
      }
    }

    return null;
  }
}
