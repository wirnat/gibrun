import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DatabaseService } from '../../../src/services/database-service.js'

// Mock pg module
vi.mock('pg', () => ({
    Pool: vi.fn()
}))

import { Pool } from 'pg'

describe('DatabaseService', () => {
    let service: DatabaseService
    let mockPool: any

    beforeEach(() => {
        vi.clearAllMocks()

        // Create mock pool
        mockPool = {
            query: vi.fn(),
            connect: vi.fn(),
            end: vi.fn()
        }

        // Spy on Pool constructor and make it return mockPool
        vi.mocked(Pool).mockImplementation(() => mockPool as any)

        service = new DatabaseService()
    })

    afterEach(async () => {
        await service.closeAllPools()
    })

    describe('executeQuery', () => {
        it('should execute SELECT query successfully', async () => {
            const mockRows = [
                { id: 1, email: 'test@example.com', name: 'Test User' },
                { id: 2, email: 'user@example.com', name: 'Another User' }
            ]

            const mockFields = [
                { name: 'id', dataTypeID: 23 },
                { name: 'email', dataTypeID: 25 },
                { name: 'name', dataTypeID: 25 }
            ]

            mockPool.query.mockResolvedValue({
                rows: mockRows,
                rowCount: 2,
                fields: mockFields
            })

            const result = await service.executeQuery(
                'postgresql://user:pass@localhost:5432/test',
                'SELECT id, email, name FROM users WHERE active = $1',
                [true]
            )

            expect(result.success).toBe(true)
            expect(result.rowCount).toBe(2)
            expect(result.rows).toEqual(mockRows)
            expect(result.fields).toEqual([
                { name: 'id', dataTypeID: 23 },
                { name: 'email', dataTypeID: 25 },
                { name: 'name', dataTypeID: 25 }
            ])
            expect(mockPool.query).toHaveBeenCalledWith(
                'SELECT id, email, name FROM users WHERE active = $1',
                [true]
            )
        })

        it('should handle database connection errors', async () => {
            mockPool.query.mockRejectedValue(new Error('Connection refused'))

            const result = await service.executeQuery(
                'postgresql://user:pass@localhost:5432/test',
                'SELECT 1'
            )

            expect(result.success).toBe(false)
            expect(result.error).toBe('Connection refused')
        })

        it('should execute INSERT/UPDATE/DELETE queries', async () => {
            mockPool.query.mockResolvedValue({
                rowCount: 1,
                rows: []
            })

            const result = await service.executeQuery(
                undefined,
                'UPDATE users SET name = $1 WHERE id = $2',
                ['John Doe', 1]
            )

            expect(result.success).toBe(true)
            expect(result.rowCount).toBe(1)
            expect(result.rows).toEqual([])
        })

        it('should build connection string from environment variables', async () => {
            process.env.POSTGRES_HOST = 'localhost'
            process.env.POSTGRES_PORT = '5432'
            process.env.POSTGRES_DB = 'testdb'
            process.env.POSTGRES_USER = 'testuser'
            process.env.POSTGRES_PASSWORD = 'testpass'

            mockPool.query.mockResolvedValue({
                rows: [{ result: 'success' }],
                rowCount: 1,
                fields: []
            })

            const result = await service.executeQuery(
                undefined,
                'SELECT * FROM test_table'
            )

            expect(result.success).toBe(true)
            expect(vi.mocked(Pool)).toHaveBeenCalledWith({
                connectionString: 'postgresql://testuser:testpass@localhost:5432/testdb',
                max: 10,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 2000,
            })

            // Cleanup
            delete process.env.POSTGRES_HOST
            delete process.env.POSTGRES_PORT
            delete process.env.POSTGRES_DB
            delete process.env.POSTGRES_USER
            delete process.env.POSTGRES_PASSWORD
        })

        it('should use POSTGRES_CONNECTION_STRING environment variable', async () => {
            process.env.POSTGRES_CONNECTION_STRING = 'postgresql://envuser:envpass@envhost:5433/envdb'

            mockPool.query.mockResolvedValue({
                rows: [{ result: 'env_success' }],
                rowCount: 1,
                fields: []
            })

            const result = await service.executeQuery(
                undefined,
                'SELECT * FROM env_table'
            )

            expect(result.success).toBe(true)
            expect(vi.mocked(Pool)).toHaveBeenCalledWith({
                connectionString: 'postgresql://envuser:envpass@envhost:5433/envdb',
                max: 10,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 2000,
            })

            // Cleanup
            delete process.env.POSTGRES_CONNECTION_STRING
        })

        it('should throw error when password is missing', async () => {
            process.env.POSTGRES_HOST = 'localhost'
            process.env.POSTGRES_USER = 'testuser'
            // No password set

            const result = await service.executeQuery(
                undefined,
                'SELECT 1'
            )

            expect(result.success).toBe(false)
            expect(result.error).toContain('PostgreSQL password not provided')

            // Cleanup
            delete process.env.POSTGRES_HOST
            delete process.env.POSTGRES_USER
        })
    })

    describe('Connection Pooling', () => {
        it('should reuse existing pool for same connection string', async () => {
            const connectionString = 'postgresql://user:pass@localhost:5432/test'

            mockPool.query.mockResolvedValue({ rows: [], rowCount: 0, fields: [] })

            // First call
            await service.executeQuery(connectionString, 'SELECT 1')
            // Second call with same connection string
            await service.executeQuery(connectionString, 'SELECT 2')

            // Pool should only be created once
            expect(vi.mocked(Pool)).toHaveBeenCalledTimes(1)
            expect(mockPool.query).toHaveBeenCalledTimes(2)
        })

        it('should create separate pools for different connection strings', async () => {
            const conn1 = 'postgresql://user1:pass1@localhost:5432/db1'
            const conn2 = 'postgresql://user2:pass2@localhost:5432/db2'

            mockPool.query.mockResolvedValue({ rows: [], rowCount: 0, fields: [] })

            await service.executeQuery(conn1, 'SELECT 1')
            await service.executeQuery(conn2, 'SELECT 2')

            expect(vi.mocked(Pool)).toHaveBeenCalledTimes(2)
        })
    })
})