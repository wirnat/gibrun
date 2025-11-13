# Testing Guide - gibRun MCP Server

## Overview

This document provides comprehensive testing guidelines for gibRun MCP Server. The project uses **Vitest** as the primary testing framework, chosen for its excellent ES module support, TypeScript integration, and performance with complex async operations.

## Testing Framework: Vitest

### Why Vitest?

gibRun uses Vitest because:
- **Perfect ES Module Support**: Native support for `"type": "module"` projects
- **TypeScript Native**: Built-in TypeScript support without extra configuration
- **Superior Performance**: 3-5x faster than Jest for large test suites
- **Modern Features**: Concurrent testing, native ESM, excellent developer experience
- **Complex Testing Needs**: Excellent for async operations (DAP, HTTP, database)

### Installation

```bash
npm install --save-dev vitest @vitest/ui jsdom @types/node
```

### Configuration

#### vitest.config.ts
```typescript
/// <reference types="vitest" />
import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['node_modules', 'build', 'test-example'],
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
```

#### Package.json Scripts
```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:watch": "vitest --watch"
  }
}
```

## Test Structure

### Directory Organization

```
test/
├── setup.ts                    # Global test setup
├── integration/               # Integration tests
│   ├── dap-integration.test.ts
│   ├── database-integration.test.ts
│   └── end-to-end.test.ts
├── unit/                      # Unit tests
│   ├── dap-operations.test.ts
│   ├── database-operations.test.ts
│   ├── http-client.test.ts
│   └── logger.test.ts
└── __mocks__/                 # Mock implementations
    ├── axios.ts
    ├── pg.ts
    └── fs.ts
```

### Test File Naming Convention

- **Unit tests**: `component.test.ts`
- **Integration tests**: `component-integration.test.ts`
- **End-to-end tests**: `feature-e2e.test.ts`

## Writing Tests

### Unit Tests

#### DAP Operations Testing

```typescript
// test/unit/dap-operations.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendDAPRequest } from '../../src/index.js'

describe('DAP Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('sendDAPRequest', () => {
    it('should initialize DAP session successfully', async () => {
      // Mock successful response
      const mockResponse = {
        seq: 1,
        type: 'response',
        request_seq: 1,
        success: true,
        command: 'initialize',
        body: {
          capabilities: {
            supportsConfigurationDoneRequest: true,
            supportsRestartRequest: true
          }
        }
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      })

      const result = await sendDAPRequest('localhost', 49279, 'initialize', {
        clientID: 'gibrun-test',
        clientName: 'gibRun MCP Test',
        adapterID: 'delve'
      })

      expect(result.success).toBe(true)
      expect(result.command).toBe('initialize')
      expect(result.body.capabilities).toBeDefined()
    })

    it('should handle connection timeout', async () => {
      // Mock network timeout
      global.fetch = vi.fn().mockImplementation(
        () => new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Network timeout')), 100)
        )
      )

      await expect(sendDAPRequest('localhost', 49279, 'initialize', {}))
        .rejects
        .toThrow('Network timeout')
    })

    it('should handle DAP protocol errors', async () => {
      const mockErrorResponse = {
        seq: 1,
        type: 'response',
        request_seq: 1,
        success: false,
        command: 'initialize',
        message: 'Debugger not ready'
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockErrorResponse)
      })

      const result = await sendDAPRequest('localhost', 49279, 'initialize', {})

      expect(result.success).toBe(false)
      expect(result.message).toBe('Debugger not ready')
    })
  })

  describe('DAP restart functionality', () => {
    it('should restart debugger with rebuild', async () => {
      const mockDisconnectResponse = {
        seq: 1,
        type: 'response',
        success: true,
        command: 'disconnect'
      }

      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockDisconnectResponse)
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            seq: 2,
            type: 'response',
            success: true,
            command: 'restart'
          })
        })

      const result = await sendDAPRequest('localhost', 49279, 'disconnect', {
        restart: true
      })

      expect(result.success).toBe(true)
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })
  })
})
```

#### Database Operations Testing

```typescript
// test/unit/database-operations.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { execAsync } from '../../src/index.js'
import { Pool } from 'pg'

vi.mock('pg')

describe('Database Operations', () => {
  let mockPool: any

  beforeEach(() => {
    mockPool = {
      query: vi.fn(),
      connect: vi.fn(),
      end: vi.fn()
    }
    vi.mocked(Pool).mockImplementation(() => mockPool)
  })

  describe('execAsync', () => {
    it('should execute SELECT query successfully', async () => {
      const mockRows = [
        { id: 1, email: 'test@example.com', name: 'Test User' },
        { id: 2, email: 'user@example.com', name: 'Another User' }
      ]

      mockPool.query.mockResolvedValue({
        rows: mockRows,
        rowCount: 2,
        fields: []
      })

      const result = await execAsync(
        'SELECT id, email, name FROM users WHERE active = $1',
        [true]
      )

      expect(result.rows).toEqual(mockRows)
      expect(result.rowCount).toBe(2)
      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT id, email, name FROM users WHERE active = $1',
        [true]
      )
    })

    it('should handle database connection errors', async () => {
      mockPool.query.mockRejectedValue(new Error('Connection refused'))

      await expect(execAsync('SELECT 1'))
        .rejects
        .toThrow('Connection refused')
    })

    it('should execute INSERT/UPDATE/DELETE queries', async () => {
      mockPool.query.mockResolvedValue({
        rowCount: 1,
        rows: []
      })

      const result = await execAsync(
        'UPDATE users SET name = $1 WHERE id = $2',
        ['Updated Name', 1]
      )

      expect(result.rowCount).toBe(1)
      expect(result.rows).toEqual([])
    })
  })
})
```

#### HTTP Client Testing

```typescript
// test/unit/http-client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import axios from 'axios'
import { makeHttpRequest } from '../../src/index.js'

vi.mock('axios')
const mockedAxios = vi.mocked(axios)

describe('HTTP Client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('makeHttpRequest', () => {
    it('should make GET request successfully', async () => {
      const mockResponse = {
        data: { message: 'Hello World', status: 'success' },
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' }
      }

      mockedAxios.request.mockResolvedValue(mockResponse)

      const result = await makeHttpRequest({
        url: 'https://api.example.com/health',
        method: 'GET'
      })

      expect(result.success).toBe(true)
      expect(result.status).toBe(200)
      expect(result.data).toEqual(mockResponse.data)
      expect(mockedAxios.request).toHaveBeenCalledWith({
        url: 'https://api.example.com/health',
        method: 'GET',
        timeout: 30000
      })
    })

    it('should handle HTTP errors gracefully', async () => {
      const error = new Error('Request failed')
      ;(error as any).response = {
        status: 404,
        statusText: 'Not Found',
        data: { error: 'Resource not found' }
      }

      mockedAxios.request.mockRejectedValue(error)

      const result = await makeHttpRequest({
        url: 'https://api.example.com/missing',
        method: 'GET'
      })

      expect(result.success).toBe(false)
      expect(result.status).toBe(404)
      expect(result.error).toBe('Resource not found')
    })

    it('should handle network errors', async () => {
      mockedAxios.request.mockRejectedValue(new Error('Network Error'))

      const result = await makeHttpRequest({
        url: 'https://api.example.com/test',
        method: 'POST',
        body: { data: 'test' }
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Network Error')
    })

    it('should support custom headers and timeout', async () => {
      const mockResponse = {
        data: { result: 'success' },
        status: 201,
        statusText: 'Created'
      }

      mockedAxios.request.mockResolvedValue(mockResponse)

      const result = await makeHttpRequest({
        url: 'https://api.example.com/users',
        method: 'POST',
        headers: {
          'Authorization': 'Bearer token123',
          'Content-Type': 'application/json'
        },
        body: { name: 'John Doe', email: 'john@example.com' },
        timeout: 5000
      })

      expect(mockedAxios.request).toHaveBeenCalledWith({
        url: 'https://api.example.com/users',
        method: 'POST',
        headers: {
          'Authorization': 'Bearer token123',
          'Content-Type': 'application/json'
        },
        data: { name: 'John Doe', email: 'john@example.com' },
        timeout: 5000
      })
    })
  })
})
```

### Integration Tests

#### DAP Integration Testing

```typescript
// test/integration/dap-integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn } from 'child_process'
import { sendDAPRequest } from '../../src/index.js'

describe('DAP Integration', () => {
  let dapServer: any
  let serverPort: number

  beforeAll(async () => {
    // Start mock DAP server for testing
    serverPort = 49280
    dapServer = await startMockDapServer(serverPort)
  }, 10000)

  afterAll(async () => {
    if (dapServer) {
      await stopMockDapServer(dapServer)
    }
  })

  describe('Full DAP Workflow', () => {
    it('should complete initialize → launch → breakpoint → continue cycle', async () => {
      // Initialize
      const initResult = await sendDAPRequest('localhost', serverPort, 'initialize', {
        clientID: 'gibrun-integration-test',
        adapterID: 'mock-debugger'
      })
      expect(initResult.success).toBe(true)

      // Configuration Done
      const configResult = await sendDAPRequest('localhost', serverPort, 'configurationDone', {})
      expect(configResult.success).toBe(true)

      // Launch
      const launchResult = await sendDAPRequest('localhost', serverPort, 'launch', {
        program: '/path/to/test/program',
        args: ['--test']
      })
      expect(launchResult.success).toBe(true)

      // Set breakpoint
      const breakpointResult = await sendDAPRequest('localhost', serverPort, 'setBreakpoints', {
        source: { path: '/path/to/test/file.go' },
        breakpoints: [{ line: 10 }]
      })
      expect(breakpointResult.success).toBe(true)

      // Continue execution
      const continueResult = await sendDAPRequest('localhost', serverPort, 'continue', {
        threadId: 1
      })
      expect(continueResult.success).toBe(true)
    }, 30000)

    it('should handle debugger restart', async () => {
      const restartResult = await sendDAPRequest('localhost', serverPort, 'disconnect', {
        restart: true
      })
      expect(restartResult.success).toBe(true)
    })
  })
})
```

#### Database Integration Testing

```typescript
// test/integration/database-integration.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { execAsync } from '../../src/index.js'
import { setupTestDatabase, teardownTestDatabase } from '../helpers/database.js'

describe('Database Integration', () => {
  let testDb: any

  beforeAll(async () => {
    testDb = await setupTestDatabase()
  }, 30000)

  afterAll(async () => {
    if (testDb) {
      await teardownTestDatabase(testDb)
    }
  })

  beforeEach(async () => {
    // Clean up and reset test data
    await execAsync('DELETE FROM test_users')
    await execAsync('DELETE FROM test_orders')
  })

  describe('CRUD Operations', () => {
    it('should create, read, update, and delete user', async () => {
      // Create
      const createResult = await execAsync(
        'INSERT INTO test_users (email, name) VALUES ($1, $2) RETURNING id',
        ['john@example.com', 'John Doe']
      )
      expect(createResult.rows).toHaveLength(1)
      const userId = createResult.rows[0].id

      // Read
      const readResult = await execAsync(
        'SELECT * FROM test_users WHERE id = $1',
        [userId]
      )
      expect(readResult.rows[0]).toMatchObject({
        email: 'john@example.com',
        name: 'John Doe'
      })

      // Update
      await execAsync(
        'UPDATE test_users SET name = $1 WHERE id = $2',
        ['John Smith', userId]
      )

      const updatedResult = await execAsync(
        'SELECT name FROM test_users WHERE id = $1',
        [userId]
      )
      expect(updatedResult.rows[0].name).toBe('John Smith')

      // Delete
      await execAsync('DELETE FROM test_users WHERE id = $1', [userId])

      const deletedResult = await execAsync(
        'SELECT * FROM test_users WHERE id = $1',
        [userId]
      )
      expect(deletedResult.rows).toHaveLength(0)
    })

    it('should handle transactions', async () => {
      // Start transaction
      await execAsync('BEGIN')

      try {
        // Insert multiple related records
        const userResult = await execAsync(
          'INSERT INTO test_users (email, name) VALUES ($1, $2) RETURNING id',
          ['transaction@example.com', 'Transaction User']
        )
        const userId = userResult.rows[0].id

        await execAsync(
          'INSERT INTO test_orders (user_id, amount) VALUES ($1, $2)',
          [userId, 99.99]
        )

        // Commit transaction
        await execAsync('COMMIT')

        // Verify both records exist
        const userCheck = await execAsync('SELECT * FROM test_users WHERE id = $1', [userId])
        const orderCheck = await execAsync('SELECT * FROM test_orders WHERE user_id = $1', [userId])

        expect(userCheck.rows).toHaveLength(1)
        expect(orderCheck.rows).toHaveLength(1)
      } catch (error) {
        await execAsync('ROLLBACK')
        throw error
      }
    })
  })

  describe('Complex Queries', () => {
    beforeEach(async () => {
      // Setup test data
      await execAsync(`
        INSERT INTO test_users (email, name) VALUES
        ('alice@example.com', 'Alice'),
        ('bob@example.com', 'Bob'),
        ('charlie@example.com', 'Charlie')
      `)

      await execAsync(`
        INSERT INTO test_orders (user_id, amount, status) VALUES
        (1, 100.00, 'completed'),
        (1, 50.00, 'pending'),
        (2, 75.00, 'completed'),
        (3, 25.00, 'cancelled')
      `)
    })

    it('should perform complex JOIN queries', async () => {
      const result = await execAsync(`
        SELECT u.name, o.amount, o.status
        FROM test_users u
        JOIN test_orders o ON u.id = o.user_id
        WHERE o.status = $1
        ORDER BY o.amount DESC
      `, ['completed'])

      expect(result.rows).toHaveLength(2)
      expect(result.rows[0]).toMatchObject({
        name: 'Alice',
        amount: 100.00,
        status: 'completed'
      })
    })

    it('should handle aggregate queries', async () => {
      const result = await execAsync(`
        SELECT
          COUNT(*) as total_orders,
          SUM(amount) as total_amount,
          AVG(amount) as avg_amount,
          MIN(amount) as min_amount,
          MAX(amount) as max_amount
        FROM test_orders
        WHERE status = $1
      `, ['completed'])

      expect(result.rows[0]).toMatchObject({
        total_orders: 2,
        total_amount: 175.00,
        avg_amount: 87.50,
        min_amount: 75.00,
        max_amount: 100.00
      })
    })
  })
})
```

## Mocking Strategies

### Global Test Setup

```typescript
// test/setup.ts
import { beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'

// Global test environment
beforeAll(async () => {
  process.env.NODE_ENV = 'test'

  // Setup test database if needed
  // Setup test servers if needed
})

afterAll(async () => {
  // Global cleanup
  vi.restoreAllMocks()
})

// Per-test cleanup
beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  // Individual test cleanup
})
```

### HTTP Mocking

```typescript
// test/__mocks__/axios.ts
import { vi } from 'vitest'

const mockAxios = {
  request: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  create: vi.fn(() => mockAxios),
  defaults: {
    timeout: 5000
  }
}

export default mockAxios
```

### Database Mocking

```typescript
// test/__mocks__/pg.ts
import { vi } from 'vitest'

const mockPool = {
  query: vi.fn(),
  connect: vi.fn(),
  end: vi.fn()
}

const mockClient = {
  query: vi.fn(),
  release: vi.fn()
}

export const Pool = vi.fn(() => mockPool)
export const Client = vi.fn(() => mockClient)
```

### File System Mocking

```typescript
// test/__mocks__/fs.ts
import { vi } from 'vitest'

export const promises = {
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  stat: vi.fn(),
  readdir: vi.fn(),
  unlink: vi.fn(),
  access: vi.fn()
}
```

## Running Tests

### Basic Commands

```bash
# Run all tests
npm test

# Run tests once (CI mode)
npm run test:run

# Run with UI
npm run test:ui

# Run in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Test Filtering

```bash
# Run specific test file
npm test dap-operations.test.ts

# Run tests matching pattern
npm test -t "DAP initialize"

# Run specific test suite
npm test -- --reporter=verbose unit/
```

### Coverage Reports

```bash
# Generate coverage report
npm run test:coverage

# View HTML coverage report
open coverage/index.html
```

## CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: testpass
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build project
        run: npm run build

      - name: Run tests
        run: npm run test:run
        env:
          DATABASE_URL: postgresql://postgres:testpass@localhost:5432/postgres

      - name: Generate coverage
        run: npm run test:coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          file: ./coverage/lcov.info
```

## Best Practices

### Test Organization

1. **One concept per test**: Each test should verify one specific behavior
2. **Descriptive test names**: Use clear, descriptive names that explain what is being tested
3. **Arrange-Act-Assert pattern**: Structure tests clearly
4. **Independent tests**: Tests should not depend on each other

### Mocking Guidelines

1. **Mock external dependencies**: Database, HTTP calls, file system
2. **Don't mock business logic**: Only external dependencies
3. **Reset mocks between tests**: Ensure test isolation
4. **Use realistic mock data**: Make mocks representative of real data

### Async Testing

1. **Always await async operations**: Never forget to await
2. **Use appropriate timeouts**: Set reasonable timeouts for async operations
3. **Handle promise rejections**: Test both success and failure paths
4. **Mock timers when needed**: For time-dependent code

### Coverage Goals

- **Statements**: 80% minimum
- **Branches**: 80% minimum
- **Functions**: 80% minimum
- **Lines**: 80% minimum

### Performance Testing

```typescript
// test/performance/dap-performance.test.ts
describe('DAP Performance', () => {
  it('should handle multiple concurrent DAP requests', async () => {
    const requests = Array(10).fill(null).map((_, i) =>
      sendDAPRequest('localhost', 49279, 'evaluate', {
        expression: `x + ${i}`,
        context: 'repl'
      })
    )

    const startTime = Date.now()
    const results = await Promise.all(requests)
    const endTime = Date.now()

    expect(results).toHaveLength(10)
    expect(endTime - startTime).toBeLessThan(1000) // Should complete within 1 second
  })
})
```

## Debugging Tests

### Common Issues

1. **ES Module imports**: Ensure proper file extensions in imports
2. **Mock clearing**: Use `vi.clearAllMocks()` between tests
3. **Async timing**: Use appropriate timeouts and await all promises
4. **Environment variables**: Set test-specific environment variables

### Debugging Tools

```typescript
// Add debugging to tests
it('should debug DAP request', async () => {
  console.log('Starting DAP test...')

  // Enable verbose logging
  process.env.DEBUG = 'dap:*'

  const result = await sendDAPRequest('localhost', 49279, 'initialize', {
    clientID: 'debug-test'
  })

  console.log('DAP result:', result)
  expect(result.success).toBe(true)
})
```

## Test Helpers

### Database Test Helpers

```typescript
// test/helpers/database.ts
import { execAsync } from '../../src/index.js'

export async function setupTestDatabase() {
  // Create test database and tables
  await execAsync('CREATE DATABASE IF NOT EXISTS test_gibrun')
  await execAsync('CREATE TABLE IF NOT EXISTS test_users (...)')

  return { database: 'test_gibrun' }
}

export async function teardownTestDatabase(config: any) {
  await execAsync(`DROP DATABASE IF EXISTS ${config.database}`)
}

export async function resetTestData() {
  await execAsync('TRUNCATE TABLE test_users, test_orders')
}
```

### DAP Test Helpers

```typescript
// test/helpers/dap.ts
import { spawn } from 'child_process'

export async function startMockDapServer(port: number) {
  // Start mock DAP server for testing
  const server = spawn('node', ['test/mock-dap-server.js', port.toString()])

  // Wait for server to be ready
  await new Promise((resolve) => {
    server.stdout.on('data', (data) => {
      if (data.toString().includes('DAP server listening')) {
        resolve(void 0)
      }
    })
  })

  return server
}

export async function stopMockDapServer(server: any) {
  server.kill()
  await new Promise((resolve) => {
    server.on('close', resolve)
  })
}
```

## Migration from Other Frameworks

### From Jest to Vitest

1. **Update imports**: Change `jest` to `vitest`
2. **Update mocks**: `jest.mock` → `vi.mock`
3. **Update spies**: `jest.spyOn` → `vi.spyOn`
4. **Update globals**: `jest.fn` → `vi.fn`
5. **Update config**: `jest.config.js` → `vitest.config.ts`

### From Mocha to Vitest

1. **Update describe/it**: Already compatible
2. **Add imports**: Import from `vitest`
3. **Update assertions**: `chai` → native `expect`
4. **Update config**: `mocha.opts` → `vitest.config.ts`

## Troubleshooting

### Common Test Issues

1. **Module resolution errors**: Check import paths and file extensions
2. **Mock not working**: Ensure mocks are cleared between tests
3. **Async test timeouts**: Increase timeout or fix async code
4. **Coverage not generating**: Check exclude patterns in config

### Performance Issues

1. **Slow tests**: Mock external dependencies, avoid real network calls
2. **Memory leaks**: Properly clean up resources in `afterEach`
3. **Flaky tests**: Avoid timing-dependent code, use proper async handling

---

**Happy Testing! 🧪**

This testing guide ensures gibRun maintains high code quality and reliability through comprehensive automated testing.</content>
<parameter name="filePath">/Users/rusli/Project/ai/mcp/gibrun/doc/testing.md