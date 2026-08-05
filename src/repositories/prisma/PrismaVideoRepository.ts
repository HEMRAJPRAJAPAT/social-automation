import type { PrismaClient, Video as PrismaVideo } from '@prisma/client';

import type { RenderedVideo } from '../../entities/RenderedVideo.js';
import type { IVideoRepository, VideoRecord } from '../interfaces/IVideoRepository.js';

function toDomain(row: PrismaVideo): VideoRecord {
  return {
    id: row.id,
    postId: row.postId,
    filePath: row.filePath,
    publicUrl: row.publicUrl,
    subtitlesPath: row.subtitlesPath ?? '',
    durationSeconds: row.durationSeconds,
    width: row.width,
    height: row.height,
    fileSizeBytes: row.fileSizeBytes ?? 0,
    variantLabel: row.variantLabel,
    renderStatus: row.renderStatus,
  };
}

export class PrismaVideoRepository implements IVideoRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(postId: string, video: RenderedVideo): Promise<VideoRecord> {
    const row = await this.prisma.video.create({
      data: {
        postId,
        variantLabel: video.variantLabel,
        filePath: video.filePath,
        publicUrl: video.publicUrl,
        subtitlesPath: video.subtitlesPath,
        durationSeconds: video.durationSeconds,
        width: video.width,
        height: video.height,
        fileSizeBytes: video.fileSizeBytes,
        renderStatus: video.renderStatus,
      },
    });
    return toDomain(row);
  }

  async markSelected(videoId: string, postId: string): Promise<VideoRecord> {
    await this.prisma.$transaction([
      this.prisma.video.updateMany({ where: { postId }, data: { isSelected: false } }),
      this.prisma.video.update({ where: { id: videoId }, data: { isSelected: true } }),
      this.prisma.post.update({ where: { id: postId }, data: { selectedVideoId: videoId } }),
    ]);
    const row = await this.prisma.video.findUniqueOrThrow({ where: { id: videoId } });
    return toDomain(row);
  }

  async findByPostId(postId: string): Promise<VideoRecord[]> {
    const rows = await this.prisma.video.findMany({ where: { postId } });
    return rows.map(toDomain);
  }
}
