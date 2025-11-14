import { beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { config } from 'dotenv'

// Load environment variables from .env file
config()

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
