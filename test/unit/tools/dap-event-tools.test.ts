import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleDAPListenEvents, handleDAPSubscribeEvents } from '../../../src/tools/dap/event-tools.js'
import { DAPService } from '../../../src/services/dap-service.js'
import { resolveDAPServer } from '../../../src/core/dap-handlers.js'

// Mock dependencies
vi.mock('../../../src/services/dap-service.js', () => ({
    DAPService: vi.fn().mockImplementation(function() {
        return {
            listenForEvents: vi.fn(),
            subscribeToEvent: vi.fn()
        }
    })
}))

vi.mock('../../../src/core/dap-handlers.js', () => ({
    resolveDAPServer: vi.fn()
}))

describe('DAP Event Tools', () => {
    let mockDAPService: any
    let mockResolveDAPServer: any

    beforeEach(() => {
        vi.clearAllMocks()
        mockDAPService = new DAPService()
        mockResolveDAPServer = vi.mocked(resolveDAPServer)
        mockResolveDAPServer.mockResolvedValue({
            success: true,
            host: '127.0.0.1',
            port: 49279
        })
    })

    describe('handleDAPListenEvents', () => {
        it('should successfully listen for events', async () => {
            mockResolveDAPServer.mockResolvedValue({
                success: true,
                host: 'localhost',
                port: 5678
            })

            mockDAPService.listenForEvents.mockResolvedValue([
                {
                    seq: 1,
                    type: 'event',
                    event: 'stopped',
                    body: { reason: 'breakpoint' }
                }
            ])

            const result = await handleDAPListenEvents(mockDAPService as any, {
                event_types: ['stopped'],
                timeout_ms: 5000,
                max_events: 10
            })

            expect(result.content).toBeDefined()
            expect(result.isError).toBeUndefined()
            const response = JSON.parse(result.content[0].text)
            expect(response.success).toBe(true)
            expect(response.events_received).toBe(1)
        })

        it('should handle server resolution failure', async () => {
            mockResolveDAPServer.mockResolvedValue({
                success: false,
                error: 'No DAP server found'
            })

            const result = await handleDAPListenEvents(mockDAPService as any, {
                event_types: ['stopped']
            })

            expect(result.isError).toBe(true)
            const response = JSON.parse(result.content[0].text)
            expect(response.success).toBe(false)
            expect(response.error).toBe('No DAP server found')
        })

        it('should handle listen errors', async () => {
            mockResolveDAPServer.mockResolvedValue({
                success: true,
                host: 'localhost',
                port: 5678
            })

            mockDAPService.listenForEvents.mockRejectedValue(new Error('Listen failed'))

            const result = await handleDAPListenEvents(mockDAPService as any, {
                event_types: ['stopped']
            })

            expect(result.isError).toBe(true)
            const response = JSON.parse(result.content[0].text)
            expect(response.success).toBe(false)
            expect(response.error).toBe('Listen failed')
        })
    })

    describe('handleDAPSubscribeEvents', () => {
        it('should successfully subscribe to events', async () => {
            mockResolveDAPServer.mockResolvedValue({
                success: true,
                host: 'localhost',
                port: 5678
            })

            const result = await handleDAPSubscribeEvents(mockDAPService as any, {
                subscriptions: [
                    {
                        event_type: 'stopped',
                        filter: { threadId: 1 },
                        persistent: true
                    }
                ]
            })

            expect(result.content).toBeDefined()
            expect(result.isError).toBeUndefined()
            const response = JSON.parse(result.content[0].text)
            expect(response.success).toBe(true)
            expect(response.subscriptions_created).toBe(1)
            expect(mockDAPService.subscribeToEvent).toHaveBeenCalled()
        })

        it('should handle subscription errors', async () => {
            mockResolveDAPServer.mockResolvedValue({
                success: true,
                host: 'localhost',
                port: 5678
            })

            mockDAPService.subscribeToEvent.mockImplementation(() => {
                throw new Error('Subscription failed')
            })

            const result = await handleDAPSubscribeEvents(mockDAPService as any, {
                subscriptions: [
                    {
                        event_type: 'invalid_event'
                    }
                ]
            })

            expect(result.isError).toBe(true)
            const response = JSON.parse(result.content[0].text)
            expect(response.success).toBe(false)
            expect(response.error).toBe('Subscription failed')
        })
    })
})