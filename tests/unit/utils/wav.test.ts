import { describe, expect, it } from 'vitest';

import { pcmToWav } from '../../../src/utils/wav.js';

describe('pcmToWav', () => {
  it('produces a valid RIFF/WAVE header followed by the PCM data', () => {
    const pcm = Buffer.from([1, 2, 3, 4]);
    const wav = pcmToWav(pcm, { sampleRateHz: 24000, channels: 1, bitDepth: 16 });

    expect(wav.length).toBe(44 + pcm.length);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.toString('ascii', 12, 16)).toBe('fmt ');
    expect(wav.toString('ascii', 36, 40)).toBe('data');
    expect(wav.readUInt32LE(24)).toBe(24000);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.subarray(44)).toEqual(pcm);
  });

  it('computes byte rate and block align correctly for stereo audio', () => {
    const pcm = Buffer.alloc(8);
    const wav = pcmToWav(pcm, { sampleRateHz: 44100, channels: 2, bitDepth: 16 });

    const expectedByteRate = (44100 * 2 * 16) / 8;
    const expectedBlockAlign = (2 * 16) / 8;
    expect(wav.readUInt32LE(28)).toBe(expectedByteRate);
    expect(wav.readUInt16LE(32)).toBe(expectedBlockAlign);
  });
});
