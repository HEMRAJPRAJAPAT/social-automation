import { describe, expect, it } from 'vitest';

import { FfmpegError } from '../../../src/utils/ffmpeg.js';

describe('FfmpegError', () => {
  const args = [
    '-f',
    'concat',
    '-i',
    '/app/storage/temp/run/segments/concat.txt',
    '-i',
    '/app/storage/temp/run/voice.wav',
    '-filter_complex',
    "[0:v]subtitles='/app/storage/temp/run/subtitles.ass'[vout]",
    '/app/storage/temp/run/output.mp4',
  ];

  it('names the output file so the failing call can be told apart from the others in a render', () => {
    const error = new FfmpegError('ffmpeg', args, 'boom: No such file or directory\n', 1);

    expect(error.message).toContain('"/app/storage/temp/run/output.mp4"');
  });

  it('lists every input file', () => {
    const error = new FfmpegError('ffmpeg', args, 'boom\n', 1);

    expect(error.message).toContain('/app/storage/temp/run/segments/concat.txt');
    expect(error.message).toContain('/app/storage/temp/run/voice.wav');
  });

  it('includes the filter graph, truncated so a huge graph cannot flood the log', () => {
    const long = ['-vf', `scale=${'x'.repeat(5000)}`, 'out.mp4'];
    const error = new FfmpegError('ffmpeg', long, 'boom\n', 1);

    expect(error.message).toContain('-vf');
    expect(error.message.length).toBeLessThan(3500);
  });

  it('still reports the exit code and stderr', () => {
    const error = new FfmpegError('ffmpeg', args, 'Invalid data found\n', 1);

    expect(error.message).toContain('exited with code 1');
    expect(error.message).toContain('Invalid data found');
  });
});
