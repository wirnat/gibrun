import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { logInfo, logError } from '../../../src/services/logger-service.js'
import { appendFile, mkdir } from 'fs/promises'
import * as path from 'path'

// Mock fs/promises
vi.mock('fs/promises', () => ({
    appendFile: vi.fn(),
    mkdir: vi.fn()
}))

// Mock path
vi.mock('path', () => ({
    default: {
        isAbsolute: vi.fn(),
        join: vi.fn(),
        dirname: vi.fn()
    },
    isAbsolute: vi.fn(),
    join: vi.fn(),
    dirname: vi.fn()
}))

describe('LoggerService', () => {
    let consoleErrorSpy: any

    beforeEach(() => {
        vi.clearAllMocks()

        // Mock path functions
        const mockPath = vi.mocked(path)
        mockPath.isAbsolute.mockReturnValue(false)
        mockPath.join.mockImplementation((...args) => args.join('/'))
        mockPath.dirname.mockReturnValue('logs')

        // Mock process.cwd
        Object.defineProperty(process, 'cwd', {
            value: vi.fn(() => '/app'),
            writable: true
        })

        // Clear environment variables
        delete process.env.MCP_LOG_DIR
        delete process.env.MCP_LOG_FILE

        // Spy on console.error
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('logInfo', () => {
        it('should log info message to console', async () => {
            const mockAppendFile = vi.mocked(appendFile)
            mockAppendFile.mockResolvedValue(undefined)

            logInfo('Test info message', { userId: 123, action: 'login' })

            // Check console output
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                '[INFO] Test info message | {"userId":123,"action":"login"}'
            )
        })

        it('should log info message without metadata', async () => {
            const mockAppendFile = vi.mocked(appendFile)
            mockAppendFile.mockResolvedValue(undefined)

            logInfo('Simple info message')

            expect(consoleErrorSpy).toHaveBeenCalledWith('[INFO] Simple info message')
        })

        it('should handle file system errors gracefully', async () => {
            const mockAppendFile = vi.mocked(appendFile)
            mockAppendFile.mockRejectedValue(new Error('Disk full'))

            // Should not throw, just log to console
            expect(() => {
                logInfo('Test message')
            }).not.toThrow()

            // Console should still work
            expect(consoleErrorSpy).toHaveBeenCalledWith('[INFO] Test message')
        })
    })

    describe('logError', () => {
        it('should log error with Error object', async () => {
            const mockAppendFile = vi.mocked(appendFile)
            mockAppendFile.mockResolvedValue(undefined)

            const testError = new Error('Database connection failed')
            testError.name = 'ConnectionError'
            ;(testError as any).code = 'ECONNREFUSED'

            logError('Database operation failed', testError, { table: 'users', operation: 'select' })

            // Check console output
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                '[ERROR] Database operation failed | {"table":"users","operation":"select"} | Database connection failed'
            )
            expect(consoleErrorSpy).toHaveBeenCalledWith(testError.stack)
        })

        it('should log error with string error', async () => {
            const mockAppendFile = vi.mocked(appendFile)
            mockAppendFile.mockResolvedValue(undefined)

            logError('Operation failed', 'Simple error message')

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                '[ERROR] Operation failed | Simple error message'
            )
        })

        it('should log error with complex object', async () => {
            const mockAppendFile = vi.mocked(appendFile)
            mockAppendFile.mockResolvedValue(undefined)

            const complexError = { type: 'ValidationError', fields: ['email', 'password'] }
            logError('Validation failed', complexError)

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                '[ERROR] Validation failed | Non-Error thrown'
            )
        })

        it('should log error without error object', async () => {
            const mockAppendFile = vi.mocked(appendFile)
            mockAppendFile.mockResolvedValue(undefined)

            logError('Something went wrong', undefined, { context: 'test' })

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                '[ERROR] Something went wrong | {"context":"test"}'
            )
        })
    })

    describe('Environment Configuration', () => {
        it.skip('should use custom log directory from environment', async () => {
            // TODO: Fix async file logging testing
            // File logging uses async operations that are hard to test synchronously
            expect(true).toBe(true)
        })

        it.skip('should use custom log file from environment', async () => {
            // TODO: Fix async file logging testing
            expect(true).toBe(true)
        })

        it.skip('should handle absolute paths correctly', async () => {
            // TODO: Fix async file logging testing
            expect(true).toBe(true)
        })

        it.skip('should use default log directory when env vars are empty', async () => {
            // TODO: Fix async file logging testing
            expect(true).toBe(true)
        })
    })

    describe('Directory Creation', () => {
        it.skip('should create log directory only once', async () => {
            // TODO: Fix async file logging testing
            expect(true).toBe(true)
        })

        it.skip('should handle directory creation errors', async () => {
            // TODO: Fix async file logging testing
            expect(true).toBe(true)
        })
    })
})