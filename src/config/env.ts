import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv();

const booleanFromString = z
  .string()
  .optional()
  .transform((value) => value?.toLowerCase() === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  CRON: z.string().default('0 9 * * *'),
  TIMEZONE: z.string().default('UTC'),
  RUN_ON_STARTUP: booleanFromString,

  CONTENT_NICHE: z.string().min(1, 'CONTENT_NICHE is required'),
  CONTENT_LANGUAGE: z.string().default('en'),
  CONTENT_POSTING_FREQUENCY: z.string().default('daily'),
  CONTENT_VIDEO_DURATION_SECONDS: z.coerce.number().int().min(15).max(90).default(45),
  CONTENT_WRITING_STYLE: z.string().default('friendly, concise, expert but approachable'),

  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required'),
  GEMINI_TEXT_MODEL: z.string().default('gemini-flash-latest'),
  GEMINI_TTS_MODEL: z.string().optional().default(''),

  PEXELS_API_KEY: z.string().optional().default(''),
  PIXABAY_API_KEY: z.string().optional().default(''),

  INSTAGRAM_ACCESS_TOKEN: z.string().optional().default(''),
  PAGE_ID: z.string().optional().default(''),
  BUSINESS_ACCOUNT_ID: z.string().optional().default(''),
  INSTAGRAM_GRAPH_API_VERSION: z.string().default('v20.0'),

  STORAGE_PROVIDER: z.enum(['local']).default('local'),
  STORAGE_ROOT: z.string().default('./storage'),
  PUBLIC_BASE_URL: z.string().default('http://localhost:3000/media'),

  RETRY_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  RETRY_BASE_DELAY_MS: z.coerce.number().int().min(100).default(1000),

  VOICE_PROVIDER: z.enum(['espeak', 'gemini']).default('espeak'),
  /** Optional path to a royalty-free background music track (mp3/wav), mixed in at low volume. */
  BACKGROUND_MUSIC_PATH: z.string().optional().default(''),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

export const env = parseEnv();

export const contentDefaults = {
  niche: env.CONTENT_NICHE,
  language: env.CONTENT_LANGUAGE,
  postingFrequency: env.CONTENT_POSTING_FREQUENCY,
  videoDurationSeconds: env.CONTENT_VIDEO_DURATION_SECONDS,
  writingStyle: env.CONTENT_WRITING_STYLE,
  cronExpression: env.CRON,
  timezone: env.TIMEZONE,
} as const;
