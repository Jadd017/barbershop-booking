import { defineConfig } from 'vitest/config';

// Run through `npm run test:rules`, which starts the Firestore emulator first.
export default defineConfig({
  test: {
    include: ['rules-tests/**/*.test.ts'],
    environment: 'node',
    // Every test shares one emulator, so they can't run in parallel files.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
