import { defineConfig } from 'vitest/config';

/** Юнит/сценарные тесты бэка. Чистый Node, тесты co-located рядом с кодом (*.test.ts). */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
