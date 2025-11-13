import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
    startTestServices,
    stopTestServices,
    waitForService,
    TEST_SERVICES
} from '../helpers/docker.js'

describe('Docker Services Integration', () => {
    beforeAll(async () => {
        // Start Docker services
        await startTestServices()

        // Wait for services to be healthy
        for (const service of TEST_SERVICES) {
            await waitForService(service, 60000) // 60 seconds timeout
        }
    }, 120000) // 2 minutes timeout for setup

    afterAll(async () => {
        // Stop Docker services
        await stopTestServices()
    }, 60000)

    describe('Service Health Checks', () => {
        it('should have PostgreSQL test database running', async () => {
            const postgresService = TEST_SERVICES.find(s => s.name === 'test-postgres')
            expect(postgresService).toBeDefined()

            const isHealthy = await postgresService!.healthCheck()
            expect(isHealthy).toBe(true)
        })

        it('should have HTTP mock server running', async () => {
            const httpService = TEST_SERVICES.find(s => s.name === 'http-mock')
            expect(httpService).toBeDefined()

            const isHealthy = await httpService!.healthCheck()
            expect(isHealthy).toBe(true)
        })

        it('should have DAP mock server running', async () => {
            const dapService = TEST_SERVICES.find(s => s.name === 'dap-mock')
            expect(dapService).toBeDefined()

            const isHealthy = await dapService!.healthCheck()
            expect(isHealthy).toBe(true)
        })
    })
})