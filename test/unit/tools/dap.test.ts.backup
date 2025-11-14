import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    handleDAPSetBreakpoints,
    handleDAPGetBreakpoints,
    handleDAPClearBreakpoints
} from '../../../src/tools/dap/breakpoint-tools.js'
import { DAPService } from '../../../src/services/dap-service.js'
import { resolveDAPServer } from '../../../src/core/dap-handlers.js'

// Mock dependencies
vi.mock('../../../src/services/dap-service.js', () => ({
    DAPService: vi.fn().mockImplementation(function() {
        return {
            sendDAPRequest: vi.fn()
        }
    })
}))

vi.mock('../../../src/core/dap-handlers.js', () => ({
    resolveDAPServer: vi.fn()
}))

describe('DAP Breakpoint Tools', () => {
    let mockDAPService: any

    beforeEach(() => {
        vi.clearAllMocks()
        mockDAPService = new DAPService()

        // Default mock for resolveDAPServer
        const mockResolveDAPServer = vi.mocked(resolveDAPServer)
        mockResolveDAPServer.mockResolvedValue({
            success: true,
            host: '127.0.0.1',
            port: 49279
        })
    })

    describe('handleDAPSetBreakpoints', () => {
        it('should set breakpoints successfully', async () => {
            const mockResult = {
                type: 'response',
                success: true,
                body: {
                    breakpoints: [
                        { id: 1, verified: true, line: 10 },
                        { id: 2, verified: true, line: 20 }
                    ]
                }
            }

            mockDAPService.sendDAPRequest.mockResolvedValue(mockResult)

            const result = await handleDAPSetBreakpoints(mockDAPService, {
                source: '/app/main.go',
                breakpoints: [
                    { line: 10, condition: 'i > 5' },
                    { line: 20 }
                ]
            })

            expect(mockDAPService.sendDAPRequest).toHaveBeenCalledWith(
                '127.0.0.1',
                49279,
                'setBreakpoints',
                {
                    source: { path: '/app/main.go' },
                    breakpoints: [
                        { line: 10, condition: 'i > 5' },
                        { line: 20 }
                    ]
                }
            )

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.success).toBe(true)
            expect(parsedContent.tool).toBe('dap_set_breakpoints')
            expect(parsedContent.breakpoints_set).toBe(2)
            expect(result.isError).toBeUndefined()
        })

        it('should handle server resolution failure', async () => {
            const mockResolveDAPServer = vi.mocked(resolveDAPServer)
            mockResolveDAPServer.mockResolvedValue({
                success: false,
                error: 'No DAP server found'
            })

            const result = await handleDAPSetBreakpoints(mockDAPService, {
                source: '/app/main.go',
                breakpoints: [{ line: 10 }]
            })

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.success).toBe(false)
            expect(parsedContent.error).toBe('No DAP server found')
            expect(result.isError).toBe(true)
        })

        it('should handle DAP request failure', async () => {
            mockDAPService.sendDAPRequest.mockRejectedValue(new Error('Connection failed'))

            const result = await handleDAPSetBreakpoints(mockDAPService, {
                source: '/app/main.go',
                breakpoints: [{ line: 10 }]
            })

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.success).toBe(false)
            expect(parsedContent.error).toBe('Connection failed')
            expect(result.isError).toBe(true)
        })

        it('should support conditional breakpoints', async () => {
            const mockResult = {
                type: 'response',
                success: true,
                body: {
                    breakpoints: [
                        { id: 1, verified: true, line: 15, condition: 'count > 10' }
                    ]
                }
            }

            mockDAPService.sendDAPRequest.mockResolvedValue(mockResult)

            await handleDAPSetBreakpoints(mockDAPService, {
                source: '/app/debug.go',
                breakpoints: [{
                    line: 15,
                    condition: 'count > 10',
                    hitCondition: '5'
                }]
            })

            expect(mockDAPService.sendDAPRequest).toHaveBeenCalledWith(
                '127.0.0.1',
                49279,
                'setBreakpoints',
                {
                    source: { path: '/app/debug.go' },
                    breakpoints: [{
                        line: 15,
                        condition: 'count > 10',
                        hitCondition: '5'
                    }]
                }
            )
        })
    })

    describe('handleDAPGetBreakpoints', () => {
        it('should get breakpoints information', async () => {
            const mockResult = {
                type: 'response',
                success: true,
                body: {}
            }

            mockDAPService.sendDAPRequest.mockResolvedValue(mockResult)

            const result = await handleDAPGetBreakpoints(mockDAPService, {})

            expect(mockDAPService.sendDAPRequest).toHaveBeenCalledWith(
                '127.0.0.1',
                49279,
                'configurationDone',
                {}
            )

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.success).toBe(true)
            expect(parsedContent.tool).toBe('dap_get_breakpoints')
            expect(parsedContent.note).toContain('Breakpoints are managed per-source-file')
        })

        it('should handle server resolution failure', async () => {
            const mockResolveDAPServer = vi.mocked(resolveDAPServer)
            mockResolveDAPServer.mockResolvedValue({
                success: false,
                error: 'Server not found'
            })

            const result = await handleDAPGetBreakpoints(mockDAPService, {})

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.success).toBe(false)
            expect(parsedContent.error).toBe('Server not found')
            expect(result.isError).toBe(true)
        })
    })

    describe('handleDAPClearBreakpoints', () => {
        it('should clear all breakpoints', async () => {
            const mockResult = {
                type: 'response',
                success: true,
                body: {}
            }

            mockDAPService.sendDAPRequest.mockResolvedValue(mockResult)

            const result = await handleDAPClearBreakpoints(mockDAPService, {})

            expect(mockDAPService.sendDAPRequest).toHaveBeenCalledWith(
                '127.0.0.1',
                49279,
                'setBreakpoints',
                {
                    breakpoints: []
                }
            )

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.success).toBe(true)
            expect(parsedContent.message).toBe('Cleared all breakpoints')
        })

        it('should clear breakpoints in specific source', async () => {
            const mockResult = {
                type: 'response',
                success: true,
                body: {}
            }

            mockDAPService.sendDAPRequest.mockResolvedValue(mockResult)

            const result = await handleDAPClearBreakpoints(mockDAPService, {
                source: '/app/main.go'
            })

            expect(mockDAPService.sendDAPRequest).toHaveBeenCalledWith(
                '127.0.0.1',
                49279,
                'setBreakpoints',
                {
                    source: { path: '/app/main.go' },
                    breakpoints: []
                }
            )

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.message).toBe('Cleared breakpoints in /app/main.go')
        })

        it('should handle clear breakpoints failure', async () => {
            mockDAPService.sendDAPRequest.mockRejectedValue(new Error('Clear failed'))

            const result = await handleDAPClearBreakpoints(mockDAPService, {})

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.success).toBe(false)
            expect(parsedContent.error).toBe('Clear failed')
            expect(result.isError).toBe(true)
        })
    })
})