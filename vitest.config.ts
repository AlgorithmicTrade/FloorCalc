import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    include: ['tests/domain/**/*.test.ts', 'tests/lib/**/*.test.ts'],
    environment: 'node',
    globals: false
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@': resolve(__dirname, 'src')
    }
  }
});
