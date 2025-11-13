import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { performance } from 'perf_hooks'
import { Method } from 'axios'
import {
    startTestServices,
    stopTestServices,
    waitForService,
    TEST_SERVICES,
    getTestDatabaseUrl,
    getHttpMockUrl
} from '../helpers/docker.js'

// Import services
import { DatabaseService } from '../../src/services/database-service.js'
import { HttpService } from '../../src/services/http-service.js'

describe('Performance Testing', () => {
    let databaseService: DatabaseService
    let httpService: HttpService

    beforeAll(async () => {
        console.log('🚀 Starting services for performance testing...')

        await startTestServices()

        for (const service of TEST_SERVICES) {
            console.log(`⏳ Waiting for ${service.name}...`)
            await waitForService(service, 120000)
            console.log(`✅ ${service.name} is ready`)
        }

        databaseService = new DatabaseService()
        httpService = new HttpService()

        console.log('🎯 Performance testing setup complete')
    }, 180000)

    afterAll(async () => {
        console.log('🛑 Stopping performance testing services...')
        await stopTestServices()
        console.log('✅ Performance testing services stopped')
    }, 60000)

    describe('Database Performance', () => {
        beforeAll(async () => {
            // Setup test data
            const testDbUrl = getTestDatabaseUrl()
            await databaseService.executeQuery(
                testDbUrl,
                'CREATE TABLE IF NOT EXISTS perf_test (id SERIAL PRIMARY KEY, data TEXT)'
            )

            // Insert test data
            const inserts = Array.from({ length: 100 }, (_, i) =>
                databaseService.executeQuery(
                    testDbUrl,
                    'INSERT INTO perf_test (data) VALUES ($1)',
                    [`Test data ${i}`]
                )
            )
            await Promise.all(inserts)
        })

        it('should handle high concurrent database operations', async () => {
            const testDbUrl = getTestDatabaseUrl()
            const concurrentOps = 50

            const startTime = performance.now()

            // Execute concurrent queries
            const queries = Array.from({ length: concurrentOps }, (_, i) =>
                databaseService.executeQuery(
                    testDbUrl,
                    'SELECT * FROM perf_test WHERE id = $1',
                    [i + 1]
                )
            )

            const results = await Promise.all(queries)
            const endTime = performance.now()

            const totalTime = endTime - startTime
            const avgTime = totalTime / concurrentOps

            console.log(`📊 DB Performance: ${concurrentOps} concurrent queries`)
            console.log(`   Total time: ${totalTime.toFixed(2)}ms`)
            console.log(`   Average time: ${avgTime.toFixed(2)}ms per query`)

            // Assertions
            results.forEach(result => {
                expect(result.success).toBe(true)
            })

            // Performance thresholds
            expect(totalTime).toBeLessThan(5000) // 5 seconds max for 50 concurrent queries
            expect(avgTime).toBeLessThan(100) // 100ms average response time
        })

        it('should handle large result sets efficiently', async () => {
            const testDbUrl = getTestDatabaseUrl()

            const startTime = performance.now()
            const result = await databaseService.executeQuery(
                testDbUrl,
                'SELECT * FROM perf_test'
            )
            const endTime = performance.now()

            const queryTime = endTime - startTime

            console.log(`📊 Large Result Set Performance:`)
            console.log(`   Records: ${result.rows?.length || 0}`)
            console.log(`   Query time: ${queryTime.toFixed(2)}ms`)

            expect(result.success).toBe(true)
            expect(result.rows).toBeDefined()
            expect(result.rows!.length).toBeGreaterThan(90) // At least 90 records
            expect(queryTime).toBeLessThan(1000) // 1 second max
        })

        it('should maintain performance under sustained load', async () => {
            const testDbUrl = getTestDatabaseUrl()
            const iterations = 10
            const queriesPerIteration = 20
            const times: number[] = []

            for (let i = 0; i < iterations; i++) {
                const startTime = performance.now()

                const queries = Array.from({ length: queriesPerIteration }, (_, j) =>
                    databaseService.executeQuery(
                        testDbUrl,
                        'SELECT COUNT(*) as count FROM perf_test'
                    )
                )

                await Promise.all(queries)
                const endTime = performance.now()
                times.push(endTime - startTime)
            }

            const avgTime = times.reduce((a, b) => a + b) / times.length
            const maxTime = Math.max(...times)
            const minTime = Math.min(...times)

            console.log(`📊 Sustained Load Performance:`)
            console.log(`   Iterations: ${iterations}`)
            console.log(`   Queries per iteration: ${queriesPerIteration}`)
            console.log(`   Average time: ${avgTime.toFixed(2)}ms`)
            console.log(`   Max time: ${maxTime.toFixed(2)}ms`)
            console.log(`   Min time: ${minTime.toFixed(2)}ms`)

            // Performance should not degrade significantly
            expect(avgTime).toBeLessThan(2000) // 2 seconds average
            expect(maxTime).toBeLessThan(3000) // 3 seconds max
        })
    })

    describe('HTTP Performance', () => {
        it('should handle high concurrent HTTP requests', async () => {
            const mockUrl = getHttpMockUrl()
            const concurrentRequests = 30

            const startTime = performance.now()

            // Use existing WireMock endpoints for performance testing
            const requests = Array.from({ length: concurrentRequests }, (_, i) =>
                httpService.makeRequest(`${mockUrl}/health`, 'GET')
            )

            const results = await Promise.all(requests)
            const endTime = performance.now()

            const totalTime = endTime - startTime
            const avgTime = totalTime / concurrentRequests

            console.log(`🌐 HTTP Performance: ${concurrentRequests} concurrent requests`)
            console.log(`   Total time: ${totalTime.toFixed(2)}ms`)
            console.log(`   Average time: ${avgTime.toFixed(2)}ms per request`)

            // Check that most requests succeeded (some may fail due to mock setup)
            const successCount = results.filter(r => r.success).length
            expect(successCount).toBeGreaterThan(concurrentRequests * 0.8) // 80% success rate

            expect(totalTime).toBeLessThan(10000) // 10 seconds max
            expect(avgTime).toBeLessThan(500) // 500ms average response time
        })

        it('should handle different HTTP methods efficiently', async () => {
            const mockUrl = getHttpMockUrl()
            const methods = ['GET', 'POST', 'PUT', 'DELETE']
            const requestsPerMethod = 5

            const startTime = performance.now()

            // Test different HTTP methods on existing endpoints
            const requests = methods.flatMap(method =>
                Array.from({ length: requestsPerMethod }, (_, i) =>
                    method === 'GET'
                        ? httpService.makeRequest(`${mockUrl}/health`, 'GET')
                        : httpService.makeRequest(
                            `${mockUrl}/api/users`,
                            method as Method,
                            { 'Content-Type': 'application/json' },
                            { test: true, index: i, method }
                        )
                )
            )

            await Promise.all(requests)
            const endTime = performance.now()

            const totalTime = endTime - startTime
            const totalRequests = methods.length * requestsPerMethod

            console.log(`🌐 HTTP Methods Performance:`)
            console.log(`   Methods tested: ${methods.join(', ')}`)
            console.log(`   Requests per method: ${requestsPerMethod}`)
            console.log(`   Total requests: ${totalRequests}`)
            console.log(`   Total time: ${totalTime.toFixed(2)}ms`)
            console.log(`   Average time: ${(totalTime / totalRequests).toFixed(2)}ms per request`)

            expect(totalTime).toBeLessThan(5000) // 5 seconds max for all requests
        })
    })

    describe('Memory and Resource Usage', () => {
        it('should monitor memory usage during operations', async () => {
            const testDbUrl = getTestDatabaseUrl()
            const initialMemory = process.memoryUsage()

            // Perform memory-intensive operations
            const operations = Array.from({ length: 100 }, () =>
                databaseService.executeQuery(
                    testDbUrl,
                    'SELECT * FROM perf_test LIMIT 10'
                )
            )

            await Promise.all(operations)

            const finalMemory = process.memoryUsage()
            const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed
            const memoryIncreaseMB = memoryIncrease / 1024 / 1024

            console.log(`🧠 Memory Usage Analysis:`)
            console.log(`   Initial heap: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`)
            console.log(`   Final heap: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`)
            console.log(`   Increase: ${memoryIncreaseMB.toFixed(2)} MB`)

            // Memory increase should be reasonable
            expect(memoryIncreaseMB).toBeLessThan(50) // Less than 50MB increase
        })

        it('should handle connection pooling efficiently', async () => {
            const testDbUrl = getTestDatabaseUrl()
            const connectionTestCount = 20

            const startTime = performance.now()

            // Test connection reuse
            const connections = Array.from({ length: connectionTestCount }, () =>
                databaseService.executeQuery(testDbUrl, 'SELECT 1')
            )

            await Promise.all(connections)
            const endTime = performance.now()

            const totalTime = endTime - startTime

            console.log(`🔌 Connection Pooling Performance:`)
            console.log(`   Connections tested: ${connectionTestCount}`)
            console.log(`   Total time: ${totalTime.toFixed(2)}ms`)
            console.log(`   Average time: ${(totalTime / connectionTestCount).toFixed(2)}ms per connection`)

            expect(totalTime).toBeLessThan(2000) // 2 seconds max for connection tests
        })
    })

    describe('End-to-End Performance', () => {
        it('should maintain performance in end-to-end scenarios', async () => {
            const testDbUrl = getTestDatabaseUrl()
            const mockUrl = getHttpMockUrl()
            const iterations = 10

            const results: number[] = []

            for (let i = 0; i < iterations; i++) {
                const startTime = performance.now()

                // Database operation
                const dbResult = await databaseService.executeQuery(
                    testDbUrl,
                    'INSERT INTO perf_test (data) VALUES ($1) RETURNING id',
                    [`E2E test ${i}`]
                )

                if (dbResult.success && dbResult.rows?.[0]?.id) {
                    const recordId = dbResult.rows[0].id

                    // HTTP operation
                    await httpService.makeRequest(
                        `${mockUrl}/api/e2e-test`,
                        'POST',
                        { 'Content-Type': 'application/json' },
                        { recordId, iteration: i }
                    )
                }

                const endTime = performance.now()
                results.push(endTime - startTime)
            }

            const avgTime = results.reduce((a, b) => a + b) / results.length
            const maxTime = Math.max(...results)
            const minTime = Math.min(...results)

            console.log(`🔄 End-to-End Performance:`)
            console.log(`   Iterations: ${iterations}`)
            console.log(`   Average time: ${avgTime.toFixed(2)}ms`)
            console.log(`   Max time: ${maxTime.toFixed(2)}ms`)
            console.log(`   Min time: ${minTime.toFixed(2)}ms`)

            // Performance thresholds for E2E scenarios
            expect(avgTime).toBeLessThan(1000) // 1 second average
            expect(maxTime).toBeLessThan(2000) // 2 seconds max
        })
    })
})