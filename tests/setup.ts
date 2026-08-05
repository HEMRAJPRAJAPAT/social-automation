process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test?schema=public';
process.env.CONTENT_NICHE ??= 'Test Niche';
process.env.GEMINI_API_KEY ??= 'test-gemini-key';
process.env.LOG_LEVEL ??= 'silent';
