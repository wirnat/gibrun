import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    target: 'node18',
    outDir: 'build',
    emptyOutDir: true,
    ssr: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/index.ts'),
      external: [
        '@modelcontextprotocol/sdk',
        'pg',
        'axios',
        'duckdb',
        'sqlite3',
        'better-sqlite3'
      ],
      output: {
        format: 'es',
        entryFileNames: 'index.js'
      }
    },
    minify: process.env.NODE_ENV === 'production' ? 'esbuild' : false,
    sourcemap: process.env.NODE_ENV === 'development'
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@types': resolve(__dirname, './src/types'),
      '@project-analyzer': resolve(__dirname, './src/tools/project-analyzer'),
      '@analyzer-types': resolve(__dirname, './src/tools/project-analyzer/types'),
      '@core': resolve(__dirname, './src/core'),
      '@tools': resolve(__dirname, './src/tools'),
      '@utils': resolve(__dirname, './src/utils')
    }
  }
})