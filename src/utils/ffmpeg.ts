import { spawn } from 'node:child_process';

import { childLogger } from './logger.js';

const log = childLogger('ffmpeg');

const DEFAULT_COMMAND_TIMEOUT_MS = 60_000;
// A hung ffmpeg on constrained hardware never recovers on its own; this caps
// how long a single invocation may run before it's killed and reported as a
// clean failure instead of leaving the calling step stuck RUNNING forever.
const DEFAULT_FFMPEG_TIMEOUT_MS = 5 * 60 * 1000;

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

function runCommand(
  command: string,
  args: string[],
  timeoutMs: number = DEFAULT_COMMAND_TIMEOUT_MS,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`${command} timed out after ${timeoutMs}ms and was killed: ${stderr.slice(-2000)}`));
        return;
      }
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new FfmpegError(command, args, stderr, code));
      }
    });
  });
}

/** Runs `ffmpeg` with the given args, throwing on non-zero exit or timeout. */
export async function runFfmpeg(
  args: string[],
  timeoutMs: number = DEFAULT_FFMPEG_TIMEOUT_MS,
): Promise<void> {
  log.debug({ args }, 'running ffmpeg');
  await runCommand('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], timeoutMs);
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
