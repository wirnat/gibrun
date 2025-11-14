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
        'axios',
        'duckdb', // Large native module
        'sqlite3', // Native database modules
        'better-sqlite3',
        // Node.js built-ins (should be external)
        'fs',
        'path',
        'crypto',
        'util',
        'events',
        'child_process',
        'os',
        'url'
      ],
      output: {
        dir: 'build',
        entryFileNames: 'index.js',
        format: 'es',
        // Optimize for MCP server (single entry point)
        manualChunks: undefined,
        // Clean asset naming
        assetFileNames: 'assets/[name].[ext]',
        // Optimize for tree-shaking
        preserveModules: false,
        // Minimize exports for better tree-shaking
        exports: 'named'
      },
      // Tree-shaking optimizations
      treeshake: {
        moduleSideEffects: false,
        propertyReadSideEffects: false,
        tryCatchDeoptimization: false
      }
    },
    // Conditional minification based on environment
    minify: process.env.NODE_ENV === 'production' ? 'esbuild' : false,
    // Conditional sourcemaps
    sourcemap: process.env.NODE_ENV === 'development' ? true : false,
    // Bundle size reporting
    reportCompressedSize: false, // Disabled for MCP server (external deps)
    // Chunk size warning limit (not applicable for lib mode)
    chunkSizeWarningLimit: 1000,
    // Optimize CSS (minimal CSS in MCP server)
    cssMinify: false,
    // Optimize build performance
    write: true,
    // Empty outDir before build
    emptyOutDir: true,
    // Watch mode optimizations
    watch: process.env.NODE_ENV === 'development' ? {
      include: ['src/**/*'],
      exclude: ['node_modules/**', 'build/**', 'test/**']
    } : undefined
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
    global: 'globalThis',
    // Environment variables for build optimization
    __DEV__: process.env.NODE_ENV === 'development',
    __PROD__: process.env.NODE_ENV === 'production'
  },
  optimizeDeps: {
    // Exclude large native modules and MCP SDK
    exclude: [
      '@modelcontextprotocol/sdk',
      'duckdb',
      'pg',
      'sqlite3',
      'better-sqlite3'
    ],
    // Pre-bundle frequently used utilities
    include: [
      'path',
      'fs/promises',
      'crypto',
      'util',
      'events'
    ],
    // Force include for better tree-shaking
    force: process.env.NODE_ENV === 'production'
  },
  // Development server optimizations
  server: process.env.NODE_ENV === 'development' ? {
    // Optimize HMR for development
    hmr: {
      overlay: true,
      port: 24678
    },
    // Watch options for better performance
    watch: {
      ignored: [
        '**/node_modules/**',
        '**/build/**',
        '**/coverage/**',
        '**/.git/**',
        '**/test-results/**'
      ],
      // Faster file watching
      usePolling: false,
      interval: 100
    },
    // Development optimizations
    fs: {
      strict: false
    }
  } : undefined,
  // Additional performance optimizations
  clearScreen: false, // Keep build output visible
  logLevel: process.env.NODE_ENV === 'production' ? 'warn' : 'info'
})