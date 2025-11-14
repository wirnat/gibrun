import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  // Specify Node.js environment
  environments: {
    ssr: {
      resolve: {
        noExternal: true,
        externalConditions: ['node']
      }
    }
  },
  build: {
    target: 'node18',
    ssr: true, // Server-side rendering mode for Node.js
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index'
    },
    rollupOptions: {
      external: [
        // External dependencies that should not be bundled
        '@modelcontextprotocol/sdk',
        'pg',
        'axios'
      ],
      output: {
        dir: 'build',
        entryFileNames: 'index.js',
        format: 'es'
      }
    },
    minify: false, // Keep readable for debugging
    sourcemap: true
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
    },
    // Ensure Node.js built-ins are resolved correctly
    conditions: ['node']
  },
  // Node.js specific settings
  define: {
    global: 'globalThis'
  },
  optimizeDeps: {
    exclude: ['@modelcontextprotocol/sdk']
  }
})