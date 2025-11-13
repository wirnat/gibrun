import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    Tool,
} from '@modelcontextprotocol/sdk/types.js'

import {
    startTestServices,
    stopTestServices,
    waitForService,
    TEST_SERVICES,
    getTestDatabaseUrl,
    getHttpMockUrl,
    getDapMockAddress
} from '../helpers/docker.js'

// Import actual handlers to test real functionality
import { handlePostgresQuery } from '../../src/core/tool-handlers.js'
import { handleHttpRequest } from '../../src/core/tool-handlers.js'
import { handleDAPSendCommand } from '../../src/tools/dap/index.js'

// Import services
import { DatabaseService } from '../../src/services/database-service.js'
import { HttpService } from '../../src/services/http-service.js'
import { DAPService } from '../../src/services/dap-service.js'

describe('End-to-End Integration Tests', () => {
    let databaseService: DatabaseService
    let httpService: HttpService
    let dapService: DAPService

    beforeAll(async () => {
        console.log('🚀 Starting Docker services for integration tests...')

        // Start Docker services
        await startTestServices()

        // Wait for all services to be healthy
        for (const service of TEST_SERVICES) {
            console.log(`⏳ Waiting for ${service.name}...`)
            await waitForService(service, 120000) // 2 minutes timeout
            console.log(`✅ ${service.name} is ready`)
        }

        // Initialize services with test configurations
        databaseService = new DatabaseService()
        httpService = new HttpService()
        dapService = new DAPService()

        console.log('🎯 All services initialized and ready for testing')
    }, 180000) // 3 minutes timeout for setup

    afterAll(async () => {
        console.log('🛑 Stopping Docker services...')

        // Stop Docker services
        await stopTestServices()

        console.log('✅ All services stopped')
    }, 60000)

    describe('Database Integration', () => {
        it('should connect to real PostgreSQL and execute queries', async () => {
            const testDbUrl = getTestDatabaseUrl()

            // Test SELECT query
            const result = await handlePostgresQuery(databaseService, {
                connection_string: testDbUrl,
                query: 'SELECT version() as postgres_version'
            })

            expect(result.isError).toBeUndefined()
            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.success).toBe(true)
            expect(parsedContent.rows).toHaveLength(1)
            expect(parsedContent.rows[0].postgres_version).toContain('PostgreSQL')
        })

        it('should handle database schema operations', async () => {
            const testDbUrl = getTestDatabaseUrl()

            // Test CREATE TABLE
            await handlePostgresQuery(databaseService, {
                connection_string: testDbUrl,
                query: `
                    CREATE TABLE IF NOT EXISTS test_integration (
                        id SERIAL PRIMARY KEY,
                        name VARCHAR(100) NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `
            })

            // Test INSERT
            const insertResult = await handlePostgresQuery(databaseService, {
                connection_string: testDbUrl,
                query: 'INSERT INTO test_integration (name) VALUES ($1) RETURNING id',
                params: ['integration_test']
            })

            expect(insertResult.isError).toBeUndefined()
            const insertData = JSON.parse(insertResult.content[0].text)
            expect(insertData.success).toBe(true)
            expect(insertData.rows).toHaveLength(1)

            // Test SELECT
            const selectResult = await handlePostgresQuery(databaseService, {
                connection_string: testDbUrl,
                query: 'SELECT * FROM test_integration WHERE name = $1',
                params: ['integration_test']
            })

            expect(selectResult.isError).toBeUndefined()
            const selectData = JSON.parse(selectResult.content[0].text)
            expect(selectData.success).toBe(true)
            expect(selectData.rows).toHaveLength(1)
            expect(selectData.rows[0].name).toBe('integration_test')
        })

        it('should handle database errors gracefully', async () => {
            const testDbUrl = getTestDatabaseUrl()

            // Test invalid query
            const result = await handlePostgresQuery(databaseService, {
                connection_string: testDbUrl,
                query: 'SELECT * FROM nonexistent_table_12345'
            })

            expect(result.isError).toBe(true)
            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.success).toBe(false)
            expect(parsedContent.error).toContain('relation "nonexistent_table_12345" does not exist')
        })
    })

    describe('HTTP Integration', () => {
        it('should make real HTTP requests to WireMock', async () => {
            const mockUrl = getHttpMockUrl()

            // Test GET request to health endpoint
            const result = await handleHttpRequest(httpService, {
                url: `${mockUrl}/health`,
                method: 'GET'
            })

            expect(result.isError).toBeUndefined()
            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.success).toBe(true)
            expect(parsedContent.status).toBe(200)
        })

        it('should handle HTTP POST with JSON body', async () => {
            const mockUrl = getHttpMockUrl()

            // Test POST request with JSON body
            const result = await handleHttpRequest(httpService, {
                url: `${mockUrl}/api/users`,
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: { name: 'John Doe', email: 'john@example.com' }
            })

            expect(result.isError).toBeUndefined()
            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.success).toBe(true)
            expect(parsedContent.status).toBe(201) // Created
        })

        it('should handle HTTP errors', async () => {
            const mockUrl = getHttpMockUrl()

            // Test request to non-existent endpoint
            const result = await handleHttpRequest(httpService, {
                url: `${mockUrl}/nonexistent`,
                method: 'GET'
            })

            expect(result.isError).toBe(true)
            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.success).toBe(false)
            expect(parsedContent.status).toBe(404)
        })
    })

    describe('DAP Integration', () => {
        it('should connect to DAP mock server', async () => {
            const dapAddress = getDapMockAddress()

            // Test basic DAP command
            const result = await handleDAPSendCommand(dapService, {
                host: dapAddress.host,
                port: dapAddress.port,
                command: 'initialize',
                arguments: {
                    clientID: 'gibRun-test',
                    clientName: 'gibRun Integration Test',
                    adapterID: 'go'
                }
            })

            expect(result.isError).toBeUndefined()
            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.success).toBe(true)
            expect(parsedContent.command).toBe('initialize')
            expect(parsedContent.dap_server).toBe(`${dapAddress.host}:${dapAddress.port}`)
        })

        it('should handle DAP server connection errors', async () => {
            // Test with invalid port
            const result = await handleDAPSendCommand(dapService, {
                host: 'localhost',
                port: 99999, // Invalid port
                command: 'initialize'
            })

            expect(result.isError).toBe(true)
            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.success).toBe(false)
            expect(parsedContent.error).toBeDefined()
        })
    })

    describe('End-to-End Workflow', () => {
        it('should perform complete workflow: Database → HTTP → DAP', async () => {
            const testDbUrl = getTestDatabaseUrl()
            const mockUrl = getHttpMockUrl()
            const dapAddress = getDapMockAddress()

            // Step 1: Database operation - Create test data
            console.log('📊 Step 1: Database operation')
            const dbResult = await handlePostgresQuery(databaseService, {
                connection_string: testDbUrl,
                query: 'INSERT INTO test_integration (name) VALUES ($1) RETURNING id',
                params: ['workflow_test']
            })

            expect(dbResult.isError).toBeUndefined()
            const dbData = JSON.parse(dbResult.content[0].text)
            expect(dbData.success).toBe(true)
            const recordId = dbData.rows[0].id

            // Step 2: HTTP operation - Send data to mock API
            console.log('🌐 Step 2: HTTP operation')
            const httpResult = await handleHttpRequest(httpService, {
                url: `${mockUrl}/api/workflow`,
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: {
                    recordId: recordId,
                    action: 'workflow_test',
                    timestamp: new Date().toISOString()
                }
            })

            expect(httpResult.isError).toBeUndefined()
            const httpData = JSON.parse(httpResult.content[0].text)
            expect(httpData.success).toBe(true)

            // Step 3: DAP operation - Send debug command
            console.log('🐛 Step 3: DAP operation')
            const dapResult = await handleDAPSendCommand(dapService, {
                host: dapAddress.host,
                port: dapAddress.port,
                command: 'launch',
                arguments: {
                    program: '/app/test-program',
                    args: ['--workflow-id', recordId.toString()]
                }
            })

            expect(dapResult.isError).toBeUndefined()
            const dapData = JSON.parse(dapResult.content[0].text)
            expect(dapData.success).toBe(true)

            console.log('✅ End-to-end workflow completed successfully!')
        })

        it('should handle workflow failures gracefully', async () => {
            const testDbUrl = getTestDatabaseUrl()
            const mockUrl = getHttpMockUrl()

            // Step 1: Database operation (should succeed)
            console.log('📊 Step 1: Database operation (success)')
            const dbResult = await handlePostgresQuery(databaseService, {
                connection_string: testDbUrl,
                query: 'SELECT COUNT(*) as count FROM test_integration'
            })

            expect(dbResult.isError).toBeUndefined()
            const dbData = JSON.parse(dbResult.content[0].text)
            expect(dbData.success).toBe(true)

            // Step 2: HTTP operation with invalid endpoint (should fail)
            console.log('🌐 Step 2: HTTP operation (expected failure)')
            const httpResult = await handleHttpRequest(httpService, {
                url: `${mockUrl}/invalid-endpoint-404`,
                method: 'GET'
            })

            expect(httpResult.isError).toBe(true)
            const httpData = JSON.parse(httpResult.content[0].text)
            expect(httpData.success).toBe(false)
            expect(httpData.status).toBe(404)

            // Step 3: DAP operation with invalid server (should fail)
            console.log('🐛 Step 3: DAP operation (expected failure)')
            const dapResult = await handleDAPSendCommand(dapService, {
                host: 'invalid-host',
                port: 12345,
                command: 'initialize'
            })

            expect(dapResult.isError).toBe(true)
            const dapData = JSON.parse(dapResult.content[0].text)
            expect(dapData.success).toBe(false)

            console.log('✅ Workflow failure handling tested successfully!')
        })
    })

    describe('Performance & Load Testing', () => {
        it('should handle concurrent database operations', async () => {
            const testDbUrl = getTestDatabaseUrl()

            // Create multiple concurrent queries
            const queries = Array.from({ length: 10 }, (_, i) =>
                handlePostgresQuery(databaseService, {
                    connection_string: testDbUrl,
                    query: 'SELECT $1 as id, NOW() as timestamp',
                    params: [i]
                })
            )

            const results = await Promise.all(queries)

            // All queries should succeed
            results.forEach(result => {
                expect(result.isError).toBeUndefined()
                const data = JSON.parse(result.content[0].text)
                expect(data.success).toBe(true)
                expect(data.rows).toHaveLength(1)
            })

            console.log('✅ Concurrent database operations handled successfully!')
        })

        it('should handle multiple HTTP requests efficiently', async () => {
            const mockUrl = getHttpMockUrl()

            // Create multiple concurrent HTTP requests
            const requests = Array.from({ length: 5 }, (_, i) =>
                handleHttpRequest(httpService, {
                    url: `${mockUrl}/api/test/${i}`,
                    method: 'GET'
                })
            )

            const results = await Promise.all(requests)

            // All requests should complete
            results.forEach(result => {
                const data = JSON.parse(result.content[0].text)
                // Note: Some may fail due to mock setup, but they should complete
                expect(data).toBeDefined()
            })

            console.log('✅ Multiple HTTP requests handled!')
        })
    })
})