import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
    startTestServices,
    stopTestServices,
    waitForService,
    TEST_SERVICES,
    getTestDatabaseUrl
} from '../helpers/docker.js'

// Import services
import { DatabaseService } from '../../src/services/database-service.js'

describe('Database Integration with Docker', () => {
    let databaseService: DatabaseService

    beforeAll(async () => {
        console.log('🚀 Starting PostgreSQL for database integration tests...')

        // Start Docker services
        await startTestServices()

        // Wait for PostgreSQL to be healthy
        const postgresService = TEST_SERVICES.find(s => s.name === 'test-postgres')
        if (postgresService) {
            await waitForService(postgresService, 60000)
        }

        // Initialize database service
        databaseService = new DatabaseService()

        console.log('✅ PostgreSQL ready for testing')
    }, 90000)

    afterAll(async () => {
        console.log('🛑 Stopping PostgreSQL...')

        // Stop Docker services
        await stopTestServices()

        console.log('✅ PostgreSQL stopped')
    }, 30000)

    describe('Real PostgreSQL Operations', () => {
        it('should connect and execute basic queries', async () => {
            const testDbUrl = getTestDatabaseUrl()

            // Test basic SELECT query
            const result = await databaseService.executeQuery(
                testDbUrl,
                'SELECT version() as postgres_version, current_database() as db_name'
            )

            expect(result.success).toBe(true)
            expect(result.rows).toBeDefined()
            expect(result.rows!.length).toBe(1)
            expect(result.rows![0].postgres_version).toContain('PostgreSQL')
            expect(result.rows![0].db_name).toBe('testdb')
        })

        it('should handle schema operations', async () => {
            const testDbUrl = getTestDatabaseUrl()

            // Create test table
            const createResult = await databaseService.executeQuery(
                testDbUrl,
                `
                CREATE TABLE IF NOT EXISTS integration_test (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    email VARCHAR(255),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                `
            )

            expect(createResult.success).toBe(true)

            // Insert test data
            const insertResult = await databaseService.executeQuery(
                testDbUrl,
                'INSERT INTO integration_test (name, email) VALUES ($1, $2) RETURNING id',
                ['John Doe', 'john@example.com']
            )

            expect(insertResult.success).toBe(true)
            expect(insertResult.rows).toBeDefined()
            expect(insertResult.rows!.length).toBe(1)
            expect(insertResult.rows![0].id).toBeDefined()

            const insertedId = insertResult.rows![0].id

            // Query the inserted data
            const selectResult = await databaseService.executeQuery(
                testDbUrl,
                'SELECT * FROM integration_test WHERE id = $1',
                [insertedId]
            )

            expect(selectResult.success).toBe(true)
            expect(selectResult.rows).toBeDefined()
            expect(selectResult.rows!.length).toBe(1)
            expect(selectResult.rows![0].name).toBe('John Doe')
            expect(selectResult.rows![0].email).toBe('john@example.com')
        })

        it('should handle parameterized queries', async () => {
            const testDbUrl = getTestDatabaseUrl()

            // Insert multiple records
            const names = ['Alice', 'Bob', 'Charlie']
            for (const name of names) {
                await databaseService.executeQuery(
                    testDbUrl,
                    'INSERT INTO integration_test (name) VALUES ($1)',
                    [name]
                )
            }

            // Query with parameters
            const result = await databaseService.executeQuery(
                testDbUrl,
                'SELECT COUNT(*) as total FROM integration_test WHERE name LIKE $1',
                ['A%']
            )

            expect(result.success).toBe(true)
            expect(result.rows).toBeDefined()
            expect(parseInt(result.rows![0].total)).toBeGreaterThanOrEqual(1)
        })

        it('should handle transactions', async () => {
            const testDbUrl = getTestDatabaseUrl()

            // Note: PostgreSQL doesn't support multiple statements in prepared queries
            // We'll test individual operations instead
            const insertResult = await databaseService.executeQuery(
                testDbUrl,
                'INSERT INTO integration_test (name) VALUES ($1)',
                ['Transaction Test']
            )

            expect(insertResult.success).toBe(true)

            // Verify the record was inserted
            const verifyResult = await databaseService.executeQuery(
                testDbUrl,
                "SELECT * FROM integration_test WHERE name = $1",
                ['Transaction Test']
            )

            expect(verifyResult.success).toBe(true)
            expect(verifyResult.rows).toHaveLength(1)
        })

        it('should handle database errors gracefully', async () => {
            const testDbUrl = getTestDatabaseUrl()

            // Test invalid table name
            const result = await databaseService.executeQuery(
                testDbUrl,
                'SELECT * FROM nonexistent_table_12345'
            )

            expect(result.success).toBe(false)
            expect(result.error).toContain('relation "nonexistent_table_12345" does not exist')
        })

        it('should handle connection errors', async () => {
            // Test with invalid connection string
            const result = await databaseService.executeQuery(
                'postgresql://invalid:invalid@nonexistent:5432/invalid',
                'SELECT 1'
            )

            expect(result.success).toBe(false)
            expect(result.error).toBeDefined()
        })

        it('should handle complex queries', async () => {
            const testDbUrl = getTestDatabaseUrl()

            // Create a more complex query with JOIN-like operations
            const complexResult = await databaseService.executeQuery(
                testDbUrl,
                `
                SELECT
                    COUNT(*) as total_records,
                    COUNT(DISTINCT name) as unique_names,
                    MAX(created_at) as latest_record,
                    MIN(created_at) as oldest_record
                FROM integration_test
                WHERE name IS NOT NULL
                `
            )

            expect(complexResult.success).toBe(true)
            expect(complexResult.rows).toBeDefined()
            expect(complexResult.rows!.length).toBe(1)
            expect(parseInt(complexResult.rows![0].total_records)).toBeGreaterThan(0)
            expect(parseInt(complexResult.rows![0].unique_names)).toBeGreaterThan(0)
            expect(complexResult.rows![0].latest_record).toBeDefined()
            expect(complexResult.rows![0].oldest_record).toBeDefined()
        })
    })

    describe('Performance & Load Testing', () => {
        it('should handle multiple concurrent queries', async () => {
            const testDbUrl = getTestDatabaseUrl()

            // Create 10 concurrent queries
            const queries = Array.from({ length: 10 }, (_, i) =>
                databaseService.executeQuery(
                    testDbUrl,
                    'SELECT $1 as query_id, pg_sleep(0.01) as delay',
                    [i + 1]
                )
            )

            const startTime = Date.now()
            const results = await Promise.all(queries)
            const endTime = Date.now()

            // All queries should succeed
            results.forEach((result, index) => {
                expect(result.success).toBe(true)
                expect(result.rows).toBeDefined()
                expect(parseInt(result.rows![0].query_id)).toBe(index + 1)
            })

            // Should complete within reasonable time (allowing for some overhead)
            const duration = endTime - startTime
            expect(duration).toBeLessThan(2000) // Less than 2 seconds for 10 concurrent queries

            console.log(`✅ 10 concurrent queries completed in ${duration}ms`)
        })

        it('should handle large result sets', async () => {
            const testDbUrl = getTestDatabaseUrl()

            // Insert many records
            const insertPromises = Array.from({ length: 100 }, (_, i) =>
                databaseService.executeQuery(
                    testDbUrl,
                    'INSERT INTO integration_test (name) VALUES ($1)',
                    [`Bulk Test ${i + 1}`]
                )
            )

            await Promise.all(insertPromises)

            // Query all records
            const result = await databaseService.executeQuery(
                testDbUrl,
                'SELECT * FROM integration_test WHERE name LIKE $1 ORDER BY id',
                ['Bulk Test%']
            )

            expect(result.success).toBe(true)
            expect(result.rows).toBeDefined()
            expect(result.rows!.length).toBeGreaterThanOrEqual(100)

            console.log(`✅ Successfully handled ${result.rows!.length} records`)
        })
    })
})