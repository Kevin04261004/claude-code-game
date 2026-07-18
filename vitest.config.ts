import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // sim/은 DOM 의존이 없으므로 브라우저 목킹 없이 Node에서 실행 (ARCHITECTURE.md §7)
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
