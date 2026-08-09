import fs from 'node:fs/promises';
import path from 'node:path';

import type { SourcedMediaAsset } from '../entities/MediaAsset.js';
import type { RenderedVideo } from '../entities/RenderedVideo.js';
import type { Script } from '../entities/Script.js';
import type { SubtitleTrack } from '../entities/Subtitle.js';
import type { VoiceOverResult } from '../entities/VoiceOver.js';
import { runFfmpeg } from '../utils/ffmpeg.js';
import { ensureDir } from '../utils/fs.js';
import { childLogger } from '../utils/logger.js';

import type { IVideoComposer } from './IVideoComposer.js';
import { alignMediaToSegments, computeSegmentTimings } from './segmentTiming.js';

const log = childLogger('video-composer');

const TARGET_WIDTH = 1080;
const TARGET_HEIGHT = 1920;
const TARGET_FPS = 30;
const FADE_SECONDS = 0.4;
const BACKGROUND_MUSIC_VOLUME = 0.12;

export interface ComposeVideoInput {
  script: Script;
  voiceOver: VoiceOverResult;
  sourcedMedia: SourcedMediaAsset[];
  subtitles: SubtitleTrack;
  outputPath: string;
  workDir: string;
  backgroundMusicPath?: string;
  variantLabel?: string;
}

function escapeFfmpegFilterPath(rawPath: string): string {
  return rawPath.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

function buildFadeFilter(
  durationSeconds: number,
  isFirst: boolean,
  isLast: boolean,
): string | null {
  const fade = Math.min(FADE_SECONDS, durationSeconds / 2 - 0.01);
  if (fade <= 0) return null;

  const parts: string[] = [];
  if (!isFirst) parts.push(`fade=t=in:st=0:d=${fade.toFixed(2)}`);
  if (!isLast)
    parts.push(`fade=t=out:st=${(durationSeconds - fade).toFixed(2)}:d=${fade.toFixed(2)}`);
  return parts.length > 0 ? parts.join(',') : null;
}

/**
 * Renders the final 1080x1920 MP4 for a Reel from stock media clips, voice
 * narration, burned-in subtitles, and optional background music (spec §8).
 * Every ffmpeg invocation is a single, well-documented filter chain rather
 * than a multi-input xfade graph, favoring robustness over fancier
 * cross-dissolve transitions — see the fade-to-black transition per segment
 * boundary instead.
 */
export class VideoComposer implements IVideoComposer {
  async compose(input: ComposeVideoInput): Promise<RenderedVideo> {
    const segmentsDir = path.join(input.workDir, 'segments');
    await ensureDir(segmentsDir);

    const segmentTimings = computeSegmentTimings(input.script, input.subtitles.wordTimings);
    const aligned = alignMediaToSegments(segmentTimings, input.sourcedMedia);
    if (aligned.length === 0) {
      throw new Error('No aligned media segments to compose a video from');
    }

    const segmentPaths: string[] = [];
    for (let i = 0; i < aligned.length; i++) {
      const segment = aligned[i];
      if (!segment) continue;
      const duration = Math.max(0.5, segment.endSeconds - segment.startSeconds);
      const segmentPath = path.join(segmentsDir, `segment-${String(i).padStart(2, '0')}.mp4`);
      await this.normalizeSegment(
        segment.asset.localPath,
        segment.asset.type,
        duration,
        segmentPath,
        {
          isFirst: i === 0,
          isLast: i === aligned.length - 1,
        },
      );
      segmentPaths.push(segmentPath);
    }

    const concatListPath = path.join(segmentsDir, 'concat.txt');
    await this.writeConcatList(segmentPaths, concatListPath);

    await ensureDir(path.dirname(input.outputPath));
    const totalDuration = input.voiceOver.durationSeconds;
    await this.renderFinal(
      concatListPath,
      input.voiceOver.audioFilePath,
      input.subtitles.srtFilePath,
      {
        outputPath: input.outputPath,
        totalDuration,
        backgroundMusicPath: input.backgroundMusicPath,
      },
    );

    const fileSizeBytes = (await fs.stat(input.outputPath)).size;
    log.info(
      { outputPath: input.outputPath, totalDuration, fileSizeBytes },
      'rendered final video',
    );

    return {
      filePath: input.outputPath,
      publicUrl: null,
      subtitlesPath: input.subtitles.srtFilePath,
      durationSeconds: totalDuration,
      width: TARGET_WIDTH,
      height: TARGET_HEIGHT,
      fileSizeBytes,
      variantLabel: input.variantLabel ?? 'default',
      renderStatus: 'DONE',
    };
  }

  private async normalizeSegment(
    sourcePath: string,
    type: 'VIDEO' | 'IMAGE',
    durationSeconds: number,
    outputPath: string,
    flags: { isFirst: boolean; isLast: boolean },
  ): Promise<void> {
    const scaleCrop = `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=increase,crop=${TARGET_WIDTH}:${TARGET_HEIGHT},setsar=1,fps=${TARGET_FPS}`;
    const fadeFilter = buildFadeFilter(durationSeconds, flags.isFirst, flags.isLast);
    const videoFilter = fadeFilter ? `${scaleCrop},${fadeFilter}` : scaleCrop;

    const inputArgs =
      type === 'IMAGE'
        ? ['-loop', '1', '-i', sourcePath]
        : ['-stream_loop', '-1', '-i', sourcePath];

    await runFfmpeg([
      ...inputArgs,
      '-t',
      durationSeconds.toFixed(2),
      '-vf',
      videoFilter,
      '-an',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      outputPath,
    ]);
  }

  private async writeConcatList(segmentPaths: string[], concatListPath: string): Promise<void> {
    const content = segmentPaths
      .map((segmentPath) => `file '${segmentPath.replace(/'/g, "'\\''")}'`)
      .join('\n');
    await fs.writeFile(concatListPath, content, 'utf-8');
  }

  private async renderFinal(
    concatListPath: string,
    voiceOverPath: string,
    srtPath: string,
    options: { outputPath: string; totalDuration: number; backgroundMusicPath?: string },
  ): Promise<void> {
    const escapedSrt = escapeFfmpegFilterPath(srtPath);
    const hasMusic = Boolean(options.backgroundMusicPath);

    // The filename must be quoted — ffmpeg's option-string parser can
    // misparse an unquoted path (observed as "No option name near ..." on
    // ffmpeg 8.x with longer absolute paths).
    const filterParts = [`[0:v]subtitles='${escapedSrt}'[vout]`];
    if (hasMusic) {
      filterParts.push('[1:a]volume=1.0[voice]');
      filterParts.push(`[2:a]volume=${BACKGROUND_MUSIC_VOLUME}[music]`);
      filterParts.push('[voice][music]amix=inputs=2:duration=first:dropout_transition=2[aout]');
    }

    const args = [
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      concatListPath,
      '-i',
      voiceOverPath,
      ...(hasMusic ? ['-stream_loop', '-1', '-i', options.backgroundMusicPath as string] : []),
      '-filter_complex',
      filterParts.join(';'),
      '-map',
      '[vout]',
      '-map',
      hasMusic ? '[aout]' : '1:a',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      // Force a standard delivery rate/channel count: TTS providers emit
      // non-standard rates (espeak: 22050Hz mono, Gemini: 24000Hz mono) that
      // some hardware AAC decoders (many Android devices, Instagram's own
      // pipeline) play back silently or corrupted even though it's a valid
      // stream — resampling here is the fix, not the source provider.
      '-ar',
      '48000',
      '-ac',
      '2',
      '-r',
      String(TARGET_FPS),
      '-movflags',
      '+faststart',
      '-t',
      options.totalDuration.toFixed(2),
      options.outputPath,
    ];

    await runFfmpeg(args);
  }
}
