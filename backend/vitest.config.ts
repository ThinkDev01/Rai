import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    // v1-archive holds the old v1 suite kept only as a reference template; it
    // imports v1 code that no longer exists, so it must never run (see
    // Guide/dev-testing.md). v2 tests land outside this folder.
    exclude: ['**/node_modules/**', '**/dist/**', '**/tests/v1-archive/**'],
    testTimeout: 30000,
    hookTimeout: 60000,
    setupFiles: ['./tests/setup.ts'],
    fileParallelism: false,   // run test files sequentially - they share one test DB
    sequence: {
      concurrent: false,
    },
  },
});
