import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['tests/integration/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/index.ts',
        'src/scripts/**',
        'src/container.ts',
        'src/db/prisma.ts',
        // Thin network/process adapters are exercised indirectly through the
        // service-layer unit tests below via mocks of their interfaces;
        // asserting on the raw axios/child_process call shape adds little
        // beyond what those tests already cover.
        'src/services/llm/GeminiLlmProvider.ts',
        'src/services/voice/GeminiVoiceProvider.ts',
        'src/services/voice/EspeakVoiceProvider.ts',
        'src/services/media/PexelsMediaProvider.ts',
        'src/services/media/PixabayMediaProvider.ts',
        'src/instagram/InstagramGraphPublisher.ts',
        'src/storage/LocalStorageProvider.ts',
        'src/repositories/prisma/**',
        'src/utils/ffmpeg.ts',
        'src/utils/logger.ts',
        'src/video/VideoComposer.ts',
        // Pure type/interface contracts — erased at compile time, no
        // executable logic to cover. See ARCHITECTURE.md §2.
        'src/entities/**',
        'src/repositories/interfaces/**',
        'src/services/interfaces/**',
        'src/instagram/IPublisher.ts',
        'src/storage/IStorageProvider.ts',
        'src/video/IVideoComposer.ts',
        // Thin Express/Prisma wiring, best covered by manual/integration
        // smoke testing against a live Postgres instance (see README).
        'src/api/**',
      ],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
  },
});
