import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { VoiceOverResult } from '../../entities/VoiceOver.js';
import { getMediaDuration } from '../../utils/ffmpeg.js';
import { childLogger } from '../../utils/logger.js';
import type { IVoiceProvider, VoiceSynthesisOptions } from '../interfaces/IVoiceProvider.js';

const log = childLogger('espeak-voice');

/** espeak-ng voice codes for the languages this project is most likely to target. */
const LANGUAGE_TO_VOICE: Record<string, string> = {
  en: 'en-us',
  es: 'es',
  fr: 'fr',
  de: 'de',
  pt: 'pt',
  hi: 'hi',
  it: 'it',
};

const SAMPLE_RATE_HZ = 22050;

function resolveVoice(language: string): string {
  return LANGUAGE_TO_VOICE[language.toLowerCase()] ?? language;
}

function runEspeak(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('espeak-ng', args);
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`espeak-ng exited with code ${code}: ${stderr}`));
    });
  });
}

/**
 * Free, fully offline TTS using the espeak-ng binary — no API key, works in
 * CI/Docker, and is the default voice provider (see ARCHITECTURE.md §8).
 */
export class EspeakVoiceProvider implements IVoiceProvider {
  public readonly name = 'espeak-ng';

  async synthesize(text: string, options: VoiceSynthesisOptions): Promise<VoiceOverResult> {
    await fs.mkdir(path.dirname(options.outputPath), { recursive: true });

    const textFilePath = `${options.outputPath}.input.txt`;
    await fs.writeFile(textFilePath, text, 'utf-8');

    try {
      await runEspeak([
        '-v',
        resolveVoice(options.language),
        '-s',
        '165', // words per minute, natural conversational pace
        '-p',
        '45', // pitch
        '-a',
        '190', // amplitude
        '-f',
        textFilePath,
        '-w',
        options.outputPath,
      ]);
    } finally {
      await fs.unlink(textFilePath).catch(() => undefined);
    }

    const durationSeconds = await getMediaDuration(options.outputPath);
    log.info(
      { outputPath: options.outputPath, durationSeconds },
      'synthesized narration with espeak-ng',
    );

    return {
      audioFilePath: options.outputPath,
      durationSeconds,
      sampleRateHz: SAMPLE_RATE_HZ,
      provider: this.name,
      text,
    };
  }
}
