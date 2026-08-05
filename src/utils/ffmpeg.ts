import { spawn } from 'node:child_process';

import { childLogger } from './logger.js';

const log = childLogger('ffmpeg');

export class FfmpegError extends Error {
  constructor(
    public readonly command: string,
    public readonly args: string[],
    public readonly stderr: string,
    public readonly exitCode: number | null,
  ) {
    super(`${command} exited with code ${exitCode}: ${stderr.slice(-2000)}`);
    this.name = 'FfmpegError';
  }
}

function runCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new FfmpegError(command, args, stderr, code));
      }
    });
  });
}

/** Runs `ffmpeg` with the given args, throwing FfmpegError on non-zero exit. */
export async function runFfmpeg(args: string[]): Promise<void> {
  log.debug({ args }, 'running ffmpeg');
  await runCommand('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
}

interface FfprobeFormat {
  format?: { duration?: string };
  streams?: Array<{ width?: number; height?: number; codec_type?: string }>;
}

export async function getMediaDuration(filePath: string): Promise<number> {
  const output = await runCommand('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'json',
    filePath,
  ]);
  const parsed = JSON.parse(output) as FfprobeFormat;
  const duration = Number(parsed.format?.duration);
  if (!Number.isFinite(duration)) {
    throw new Error(`Could not determine duration of ${filePath}`);
  }
  return duration;
}

export async function getVideoDimensions(
  filePath: string,
): Promise<{ width: number; height: number }> {
  const output = await runCommand('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height',
    '-of',
    'json',
    filePath,
  ]);
  const parsed = JSON.parse(output) as FfprobeFormat;
  const stream = parsed.streams?.[0];
  if (!stream?.width || !stream.height) {
    throw new Error(`Could not determine dimensions of ${filePath}`);
  }
  return { width: stream.width, height: stream.height };
}
