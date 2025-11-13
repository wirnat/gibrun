/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['node_modules', 'build', 'test-example'],
    // Memory optimization settings from environment variables
    pool: 'threads',
    maxConcurrency: parseInt(process.env.VITEST_MAX_CONCURRENCY || '3'),
    maxWorkers: parseInt(process.env.VITEST_MAX_WORKERS || '2'),
    isolate: true, // Isolate test environments
    sequence: {
      concurrent: false, // Run test files sequentially
      shuffle: false
    },
    coverage: {
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'build/',
        'test/',
        '**/*.d.ts',
        '**/*.config.{js,ts}',
        'src/index.ts' // Entry point
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  }
})