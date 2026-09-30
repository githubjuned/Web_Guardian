import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 120_000,
    hookTimeout: 120_000,
    pool: 'forks',
    fileParallelism: false,
    env: { WEBGUARDIAN_DATA_DIR: './data-test', LIGHTHOUSE_ENABLED: 'false', GEMINI_API_KEY: '' },
  },
});
