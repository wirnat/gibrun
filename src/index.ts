// Entry point - re-export from core server
export * from './core/server.js';

// Force compilation of K6 tools for testing
export * from './tools/k6/index.js';