# Memory Usage Troubleshooting Guide

## 🚨 Problem: Out-of-Memory Errors in Test Suite

### Symptoms
- `FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory`
- Tests fail with memory allocation errors
- Node.js process crashes during test execution

### Root Causes
1. **Large test suite** with many concurrent tests
2. **Memory leaks** in test setup/teardown
3. **Inefficient mocking** consuming excessive memory
4. **Node.js heap size** too small for test suite

## 🛠️ Solutions

### 1. Immediate Fix: Increase Node.js Heap Size

```bash
# Run tests with larger heap
NODE_OPTIONS="--max-old-space-size=4096" npm test

# Or set globally
export NODE_OPTIONS="--max-old-space-size=4096"
npm test
```

### 2. Optimized Test Configuration

Vitest config has been updated with memory optimizations:
- `maxConcurrency: 3` - Limit concurrent tests
- `maxWorkers: 2` - Limit worker processes
- `sequence.concurrent: false` - Run tests sequentially

### 3. Split Test Execution

Use specialized test scripts to avoid memory issues:

```bash
# Run DAP tests only (recommended for memory issues)
npm run test:dap

# Run services tests only
npm run test:unit:services

# Run tools tests only
npm run test:unit:tools

# Run integration tests only
npm run test:integration

# Run all tests in memory-safe mode
npm run test:memory-safe
```

### 4. Memory-Safe Test Runner

Use the custom memory-safe test runner:

```bash
npm run test:memory-safe
```

This script:
- Runs test suites sequentially
- Increases heap size to 4GB
- Limits concurrent workers
- Provides detailed progress reporting

### 5. Docker-Based Testing

For integration tests, use Docker which has better memory management:

```bash
# Start test services
docker compose --profile test up -d

# Wait for services to be ready
sleep 15

# Run integration tests
npm run test:integration
```

## 📊 Performance Comparison

| Method | Memory Usage | Speed | Reliability |
|--------|-------------|-------|-------------|
| `npm test` (full) | High (~4GB+) | Fast | Low (OOM) |
| `npm run test:memory-safe` | Medium (~2-3GB) | Medium | High |
| Split execution | Low (~1-2GB) | Slow | Very High |
| Docker tests | Isolated | Medium | High |

## 🔧 Advanced Configuration

### Custom Vitest Config for Memory Issues

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    // Memory optimizations
    pool: 'threads',
    maxConcurrency: 2, // Reduce further if needed
    maxWorkers: 1,     // Single worker for memory issues
    isolate: true,
    sequence: {
      concurrent: false, // Sequential execution
      shuffle: false
    },

    // Test timeouts
    testTimeout: 30000,
    hookTimeout: 30000,

    // Reduce parallelism in setup
    setupFiles: ['./test/setup.ts'],
    globalSetup: undefined,
    globalTeardown: undefined
  }
})
```

### Environment Variables

```bash
# Increase Node.js memory
export NODE_OPTIONS="--max-old-space-size=6144"

# Vitest specific
export VITEST_MAX_WORKERS=2
export VITEST_MAX_CONCURRENCY=3

# Run tests
npm test
```

## 🚨 Emergency Solutions

### If All Tests Fail with OOM

1. **Run tests individually:**
   ```bash
   npm run test:dap
   npm run test:unit:services
   npm run test:unit:tools
   npm run test:integration
   ```

2. **Use Docker for all tests:**
   ```bash
   docker run --rm -v $(pwd):/app -w /app node:18-alpine \
     sh -c "npm ci && NODE_OPTIONS='--max-old-space-size=4096' npm run test:memory-safe"
   ```

3. **Disable coverage for faster runs:**
   ```bash
   NODE_OPTIONS="--max-old-space-size=4096" vitest run --no-coverage
   ```

## 📈 Monitoring Memory Usage

### Check Memory Usage During Tests

```bash
# Monitor memory usage
NODE_OPTIONS="--max-old-space-size=4096 --expose-gc" npm test

# Or use clinic.js for detailed analysis
npm install -g clinic
clinic heapprofiler -- npm test
```

### Memory Leak Detection

```bash
# Use Node.js built-in memory monitoring
node --inspect --max-old-space-size=4096 node_modules/.bin/vitest run

# Then open chrome://inspect to monitor memory
```

## 🎯 Best Practices

### 1. Test Organization
- Keep test files small (< 100 tests per file)
- Use `describe` blocks to group related tests
- Avoid global test setup that accumulates memory

### 2. Mock Management
- Clean up mocks after each test: `vi.clearAllMocks()`
- Use `vi.resetAllMocks()` sparingly
- Avoid complex nested mocks

### 3. Resource Cleanup
- Close database connections in `afterEach`
- Clean up file handles and streams
- Use `beforeEach`/`afterEach` for setup/teardown

### 4. CI/CD Considerations
- Use larger runners with more memory
- Split test execution across multiple jobs
- Cache node_modules to reduce memory usage

## 📞 Support

If memory issues persist:

1. Check available system memory: `free -h` (Linux) or `vm_stat` (macOS)
2. Monitor process memory: `ps aux | grep node`
3. Use heap snapshots: `node --heap-prof test-file.js`
4. Consider upgrading to Node.js 20+ for better memory management

---

**Last Updated:** November 2025
**Test Suite Size:** 120+ tests
**Recommended Heap Size:** 4GB for full suite