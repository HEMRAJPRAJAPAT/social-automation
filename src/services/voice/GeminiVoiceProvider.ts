import fs from 'node:fs/promises';
import path from 'node:path';

import axios, { isAxiosError } from 'axios';

import type { VoiceOverResult } from '../../entities/VoiceOver.js';
import type { IApiLogRepository } from '../../repositories/interfaces/IApiLogRepository.js';
import { childLogger } from '../../utils/logger.js';
import { withRetry } from '../../utils/retry.js';
import { pcmToWav } from '../../utils/wav.js';
import type { IVoiceProvider, VoiceSynthesisOptions } from '../interfaces/IVoiceProvider.js';

const log = childLogger('gemini-voice');

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_TTS_SAMPLE_RATE_HZ = 24000;
const GEMINI_TTS_CHANNELS = 1;
const GEMINI_TTS_BIT_DEPTH = 16;
// "Sulafat" is Google's voice explicitly documented as warm (vs. e.g. "Kore",
// which reads flatter/more neutral) — https://ai.google.dev/gemini-api/docs/speech-generation#voices
const VOICE_NAME = 'Sulafat';

// Gemini's native TTS models accept a natural-language delivery instruction
// ahead of the text and perform it rather than reading it aloud (verified:
// output duration matches the narration alone, not instruction+narration).
// This is what pushes the read from "correct" to "warm and engaging".
function buildStyledPrompt(text: string): string {
  return (
    'Say the following warmly, naturally, and with engaging conversational ' +
    'energy, like a friendly expert sharing something interesting with a ' +
    `friend — clear pronunciation, natural pacing, no monotone: ${text}`
  );
}

interface GeminiTtsResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
  }>;
}

/**
 * Voice provider backed by Gemini's audio-output-capable models — natural,
 * human-sounding narration vs. `EspeakVoiceProvider`'s robotic formant
 * synthesis. Not every Google account/region has TTS enabled on the free
 * tier, which is why espeak remains the fallback default (see
 * ARCHITECTURE.md §8); use this adapter when Gemini TTS access is confirmed
 * available.
 */
export class GeminiVoiceProvider implements IVoiceProvider {
  public readonly name = 'gemini-tts';

  constructor(
    private readonly apiKey: string,
    private readonly ttsModel: string,
    private readonly apiLogRepository: IApiLogRepository,
    private readonly retryAttempts: number,
    private readonly retryBaseDelayMs: number,
  ) {}

  async synthesize(text: string, options: VoiceSynthesisOptions): Promise<VoiceOverResult> {
    if (!this.ttsModel) {
      throw new Error('GEMINI_TTS_MODEL is not configured; cannot use GeminiVoiceProvider');
    }

    const endpoint = `${GEMINI_BASE_URL}/${this.ttsModel}:generateContent`;
    let attemptCounter = 0;

    const audioBase64 = await withRetry(
      async () => {
        attemptCounter += 1;
        const startedAt = Date.now();
        try {
          const result = await axios.post<GeminiTtsResponse>(
            `${endpoint}?key=${this.apiKey}`,
            {
              contents: [{ parts: [{ text: buildStyledPrompt(text) }] }],
              generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                  voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE_NAME } },
                },
              },
            },
            { timeout: 60_000 },
          );
          await this.apiLogRepository.log({
            provider: 'gemini-tts',
            endpoint: this.ttsModel,
            method: 'POST',
            statusCode: result.status,
            latencyMs: Date.now() - startedAt,
            attempt: attemptCounter,
            success: true,
          });
          const data = result.data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
          if (!data) throw new Error('Gemini TTS response contained no audio data');
          return data;
        } catch (error) {
          const statusCode = isAxiosError(error) ? error.response?.status : undefined;
          await this.apiLogRepository.log({
            provider: 'gemini-tts',
            endpoint: this.ttsModel,
            method: 'POST',
            statusCode,
            latencyMs: Date.now() - startedAt,
            attempt: attemptCounter,
            success: false,
            errorMessage: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      },
      {
        attempts: this.retryAttempts,
        baseDelayMs: this.retryBaseDelayMs,
        label: 'gemini-tts:synthesize',
      },
    );

    const pcmBuffer = Buffer.from(audioBase64, 'base64');
    const wavBuffer = pcmToWav(pcmBuffer, {
      sampleRateHz: GEMINI_TTS_SAMPLE_RATE_HZ,
      channels: GEMINI_TTS_CHANNELS,
      bitDepth: GEMINI_TTS_BIT_DEPTH,
    });

    await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
    await fs.writeFile(options.outputPath, wavBuffer);

    const bytesPerSecond =
      (GEMINI_TTS_SAMPLE_RATE_HZ * GEMINI_TTS_CHANNELS * GEMINI_TTS_BIT_DEPTH) / 8;
    const durationSeconds = pcmBuffer.length / bytesPerSecond;

    log.info(
      { outputPath: options.outputPath, durationSeconds },
      'synthesized narration with Gemini TTS',
    );

    return {
      audioFilePath: options.outputPath,
      durationSeconds,
      sampleRateHz: GEMINI_TTS_SAMPLE_RATE_HZ,
      provider: this.name,
      text,
    };
  }
}
