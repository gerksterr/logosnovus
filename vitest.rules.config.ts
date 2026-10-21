import { defineConfig } from 'vitest/config';

// Security-rule and sync tests against the Firestore emulator: `npm run test:rules`.
export default defineConfig({
  test: { include: ['tests/rules/**/*.test.ts'], testTimeout: 30000, hookTimeout: 60000, fileParallelism: false },
});
