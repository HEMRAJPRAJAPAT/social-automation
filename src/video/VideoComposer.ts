import fs from 'node:fs/promises';
import path from 'node:path';

import type { SourcedMediaAsset } from '../entities/MediaAsset.js';
import type { RenderedVideo } from '../entities/RenderedVideo.js';
import type { Script } from '../entities/Script.js';
import type { SubtitleTrack } from '../entities/Subtitle.js';
import type { DiagramSpec, VisualPlan } from '../entities/VisualPlan.js';
import type { VoiceOverResult } from '../entities/VoiceOver.js';
import { runFfmpeg } from '../utils/ffmpeg.js';
import { ensureDir } from '../utils/fs.js';
import { childLogger } from '../utils/logger.js';
import { escapeFfmpegFilterValue, sanitizeDrawtextLabel } from '../utils/text.js';

import type { IVideoComposer } from './IVideoComposer.js';
import { alignMediaToSegments, computeSegmentTimings } from './segmentTiming.js';

const log = childLogger('video-composer');

const TARGET_WIDTH = 1080;
const TARGET_HEIGHT = 1920;
const TARGET_FPS = 30;
const FADE_SECONDS = 0.4;
const BACKGROUND_MUSIC_VOLUME = 0.12;
const DEFAULT_FONT_FAMILY = 'DejaVu Sans';

export interface ComposeVideoInput {
  script: Script;
  voiceOver: VoiceOverResult;
  sourcedMedia: SourcedMediaAsset[];
  subtitles: SubtitleTrack;
  visualPlan: VisualPlan;
  outputPath: string;
  workDir: string;
  backgroundMusicPath?: string;
  variantLabel?: string;
  /** Fontconfig family used for diagram-card text (captions carry their own font in the .ass file). */
  fontFamily?: string;
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
 * Renders the final 1080x1920 MP4 for a Reel from stock media clips (or
 * generated diagram cards), voice narration, burned-in animated captions,
 * and optional background music (spec §8). Every ffmpeg invocation is a
 * single, well-documented filter chain rather than a multi-input xfade
 * graph, favoring robustness over fancier cross-dissolve transitions — see
 * the fade-to-black transition per segment boundary instead.
 */
export class VideoComposer implements IVideoComposer {
  async compose(input: ComposeVideoInput): Promise<RenderedVideo> {
    const segmentsDir = path.join(input.workDir, 'segments');
    await ensureDir(segmentsDir);
    const fontFamily = input.fontFamily || DEFAULT_FONT_FAMILY;

    const segmentTimings = computeSegmentTimings(input.script, input.subtitles.wordTimings);
    const aligned = alignMediaToSegments(segmentTimings, input.sourcedMedia, input.visualPlan);
    if (aligned.length === 0) {
      throw new Error('No aligned media segments to compose a video from');
    }

    const segmentPaths: string[] = [];
    for (let i = 0; i < aligned.length; i++) {
      const segment = aligned[i];
      if (!segment) continue;
      const duration = Math.max(0.5, segment.endSeconds - segment.startSeconds);
      const segmentPath = path.join(segmentsDir, `segment-${String(i).padStart(2, '0')}.mp4`);
      const flags = { isFirst: i === 0, isLast: i === aligned.length - 1 };

      if (segment.kind === 'diagram') {
        await this.renderDiagramCard(segment.diagramSpec, duration, segmentPath, fontFamily);
      } else {
        await this.normalizeSegment(
          segment.asset.localPath,
          segment.asset.type,
          duration,
          segmentPath,
          flags,
        );
      }
      segmentPaths.push(segmentPath);
    }

    const concatListPath = path.join(segmentsDir, 'concat.txt');
    await this.writeConcatList(segmentPaths, concatListPath);

    await ensureDir(path.dirname(input.outputPath));
    const totalDuration = input.voiceOver.durationSeconds;
    await this.renderFinal(
      concatListPath,
      input.voiceOver.audioFilePath,
      input.subtitles.assFilePath,
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
      subtitlesPath: input.subtitles.assFilePath,
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
      '-preset',
      'veryfast',
      '-threads',
      '2',
      '-pix_fmt',
      'yuv420p',
      outputPath,
    ]);
  }

  /**
   * Renders a short animated text/box "diagram card" using only ffmpeg's
   * drawtext/drawbox source filters — no images, no external rendering lib.
   * Connectors between boxes are thin filled rectangles (not arrow glyphs):
   * Unicode arrow characters (e.g. "→") silently render as a missing-glyph
   * box on fonts that lack them, verified empirically, so a drawn rectangle
   * is used instead since it can never fail to render on any font/platform.
   *
   * Text values come from LLM output, so they land on disk as textfile=
   * inputs rather than inlined `text='...'` values — verified empirically
   * that a label containing an apostrophe (e.g. "User's Cache") silently
   * renders as BLANK when inlined, regardless of which of ffmpeg's quoting
   * schemes is used to escape the apostrophe. A path has no such ambiguity.
   */
  private async renderDiagramCard(
    spec: DiagramSpec,
    durationSeconds: number,
    outputPath: string,
    fontFamily: string,
  ): Promise<void> {
    const font = `font='${escapeFfmpegFilterValue(fontFamily)}'`;
    const titleFile = await this.writeLabelFile(
      outputPath,
      'title',
      sanitizeDrawtextLabel(spec.title, 60),
    );
    const boxLabelFiles = await Promise.all(
      spec.boxes.map((box, i) =>
        this.writeLabelFile(outputPath, `box${i}`, sanitizeDrawtextLabel(box.label, 40)),
      ),
    );
    const boxCount = boxLabelFiles.length;

    const BG_COLOR = '0x1E1E2E';
    const BOX_COLOR = '0x3A3A5C';
    const CONNECTOR_COLOR = '0xFFD54A';
    const TITLE_FONTSIZE = 68;
    const BOX_FONTSIZE = 46;

    // Scale reveal timing to the segment's actual duration so a short line
    // never gets its animation cut off mid-reveal by the `-t` trim below.
    const titleRevealEnd = Math.min(0.6, Math.max(0.3, durationSeconds * 0.15));
    const revealWindow = Math.max(0.3, durationSeconds - titleRevealEnd - 0.3);
    const boxRevealAt = boxLabelFiles.map(
      (_, i) => titleRevealEnd + ((i + 1) * revealWindow) / (boxCount + 0.5),
    );

    const filters: string[] = [];
    let last = '0:v';
    const chain = (filter: string): void => {
      const label = `s${filters.length}`;
      filters.push(`[${last}]${filter}[${label}]`);
      last = label;
    };

    const textfileArg = (filePath: string): string =>
      `textfile='${escapeFfmpegFilterValue(filePath)}'`;

    chain(
      `drawtext=${textfileArg(titleFile)}:${font}:fontsize=${TITLE_FONTSIZE}:fontcolor=white:` +
        `x=(w-text_w)/2:y=180:alpha='if(lt(t\\,${titleRevealEnd.toFixed(2)})\\,t/${titleRevealEnd.toFixed(2)}\\,1)'`,
    );

    if (spec.layout === 'horizontal-flow') {
      const gap = 40;
      const boxWidth = Math.floor((960 - gap * (boxCount - 1)) / boxCount);
      const boxHeight = 280;
      const y = 900;
      for (let i = 0; i < boxCount; i++) {
        const x = 60 + i * (boxWidth + gap);
        const t = boxRevealAt[i]!.toFixed(2);
        chain(
          `drawbox=x=${x}:y=${y}:w=${boxWidth}:h=${boxHeight}:color=${BOX_COLOR}@1.0:t=fill:enable='gte(t\\,${t})'`,
        );
        chain(
          `drawtext=${textfileArg(boxLabelFiles[i]!)}:${font}:fontsize=${BOX_FONTSIZE}:fontcolor=white:` +
            `x=${x + boxWidth / 2}-text_w/2:y=${y + boxHeight / 2}-text_h/2:enable='gte(t\\,${t})'`,
        );
        if (i < boxCount - 1) {
          const connectorT = ((boxRevealAt[i]! + boxRevealAt[i + 1]!) / 2).toFixed(2);
          chain(
            `drawbox=x=${x + boxWidth}:y=${y + boxHeight / 2 - 4}:w=${gap}:h=8:color=${CONNECTOR_COLOR}@1.0:t=fill:enable='gte(t\\,${connectorT})'`,
          );
        }
      }
    } else {
      const gap = 100;
      const boxWidth = 800;
      const boxHeight = 220;
      const x = (TARGET_WIDTH - boxWidth) / 2;
      let y = 650;
      for (let i = 0; i < boxCount; i++) {
        const t = boxRevealAt[i]!.toFixed(2);
        chain(
          `drawbox=x=${x}:y=${y}:w=${boxWidth}:h=${boxHeight}:color=${BOX_COLOR}@1.0:t=fill:enable='gte(t\\,${t})'`,
        );
        chain(
          `drawtext=${textfileArg(boxLabelFiles[i]!)}:${font}:fontsize=${BOX_FONTSIZE}:fontcolor=white:` +
            `x=(w-text_w)/2:y=${y + boxHeight / 2}-text_h/2:enable='gte(t\\,${t})'`,
        );
        if (i < boxCount - 1) {
          const connectorT = ((boxRevealAt[i]! + boxRevealAt[i + 1]!) / 2).toFixed(2);
          chain(
            `drawbox=x=${x + boxWidth / 2 - 4}:y=${y + boxHeight}:w=8:h=${gap}:color=${CONNECTOR_COLOR}@1.0:t=fill:enable='gte(t\\,${connectorT})'`,
          );
        }
        y += boxHeight + gap;
      }
    }

    await runFfmpeg([
      '-f',
      'lavfi',
      '-i',
      `color=c=${BG_COLOR}:s=${TARGET_WIDTH}x${TARGET_HEIGHT}:d=${durationSeconds.toFixed(2)}:r=${TARGET_FPS}`,
      '-filter_complex',
      filters.join(';'),
      '-map',
      `[${last}]`,
      '-t',
      durationSeconds.toFixed(2),
      '-an',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-threads',
      '2',
      '-pix_fmt',
      'yuv420p',
      outputPath,
    ]);
  }

  private async writeLabelFile(
    segmentOutputPath: string,
    suffix: string,
    text: string,
  ): Promise<string> {
    const filePath = `${segmentOutputPath}.${suffix}.txt`;
    await fs.writeFile(filePath, text, 'utf-8');
    return filePath;
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
    assPath: string,
    options: { outputPath: string; totalDuration: number; backgroundMusicPath?: string },
  ): Promise<void> {
    const escapedAss = escapeFfmpegFilterValue(assPath);
    const hasMusic = Boolean(options.backgroundMusicPath);

    // The filename must be quoted — ffmpeg's option-string parser can
    // misparse an unquoted path (observed as "No option name near ..." on
    // ffmpeg 8.x with longer absolute paths).
    const filterParts = [`[0:v]subtitles='${escapedAss}'[vout]`];
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
      '-preset',
      'veryfast',
      '-threads',
      '2',
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
