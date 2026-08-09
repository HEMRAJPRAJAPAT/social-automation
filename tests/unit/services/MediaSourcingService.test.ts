import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/utils/fs.js', () => ({
  ensureDir: vi.fn(async () => undefined),
  downloadToFile: vi.fn(async () => undefined),
  sha256OfFile: vi.fn(async (filePath: string) => `checksum-${filePath}`),
}));

const { MediaSourcingService } = await import('../../../src/services/media/MediaSourcingService.js');
const { makeFakeMediaAssetRepository, makeFakeMediaProvider } = await import('../../mocks/fakes.js');
import type { MediaSearchResult } from '../../../src/entities/MediaAsset.js';
import type { Script } from '../../../src/entities/Script.js';

const script: Script = {
  hook: 'hook',
  lines: [
    { index: 0, text: 'first line', visualKeyword: 'coding' },
    { index: 1, text: 'second line', visualKeyword: 'testing' },
  ],
  callToAction: 'cta',
  fullNarrationText: 'hook first line second line cta',
  estimatedDurationSeconds: 10,
  language: 'en',
};

function videoResult(providerAssetId: string, query: string): MediaSearchResult {
  return {
    provider: 'PEXELS',
    providerAssetId,
    type: 'VIDEO',
    query,
    sourceUrl: `https://example.com/${providerAssetId}.mp4`,
    width: 1080,
    height: 1920,
    durationSeconds: 10,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MediaSourcingService', () => {
  it('sources one media asset per script line', async () => {
    const pexels = makeFakeMediaProvider('PEXELS', [videoResult('1', 'coding'), videoResult('2', 'coding')]);
    const mediaAssetRepository = makeFakeMediaAssetRepository();
    const service = new MediaSourcingService([pexels], mediaAssetRepository);

    const sourced = await service.sourceForScript(script, 'post-1', '/tmp/work');

    expect(sourced).toHaveLength(2);
    expect(sourced[0]!.lineIndex).toBe(0);
    expect(sourced[1]!.lineIndex).toBe(1);
    expect(mediaAssetRepository.create).toHaveBeenCalledTimes(2);
  });

  it('falls back to the next provider when the first has no results', async () => {
    const pexels = makeFakeMediaProvider('PEXELS', []);
    const pixabay = makeFakeMediaProvider('PIXABAY', [videoResult('9', 'coding')]);
    const mediaAssetRepository = makeFakeMediaAssetRepository();
    const service = new MediaSourcingService([pexels, pixabay], mediaAssetRepository);

    const sourced = await service.sourceForScript(script, 'post-1', '/tmp/work');

    expect(sourced.length).toBeGreaterThan(0);
    expect(pixabay.searchVideos).toHaveBeenCalled();
  });

  it('falls back to a still image when no video is found on any provider', async () => {
    const imageOnlyProvider = {
      name: 'PEXELS' as const,
      searchVideos: vi.fn(async () => []),
      searchImages: vi.fn(async () => [
        {
          provider: 'PEXELS' as const,
          providerAssetId: 'img-1',
          type: 'IMAGE' as const,
          query: 'coding',
          sourceUrl: 'https://example.com/img-1.jpg',
          width: 1080,
          height: 1920,
          durationSeconds: null,
        },
      ]),
    };
    const singleLineScript: Script = { ...script, lines: [script.lines[0]!] };
    const service = new MediaSourcingService([imageOnlyProvider], makeFakeMediaAssetRepository());

    const sourced = await service.sourceForScript(singleLineScript, 'post-1', '/tmp/work');

    expect(sourced).toHaveLength(1);
    expect(sourced[0]!.asset.type).toBe('IMAGE');
  });

  it('throws when no media can be sourced for any line', async () => {
    const pexels = makeFakeMediaProvider('PEXELS', []);
    const service = new MediaSourcingService([pexels], makeFakeMediaAssetRepository());

    await expect(service.sourceForScript(script, 'post-1', '/tmp/work')).rejects.toThrow(
      /could not source any usable stock media/i,
    );
  });
});
