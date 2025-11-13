import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DAP_TOOLS, handleDAPRestart, handleDAPSendCommand } from '../../../src/tools/dap/index.js'
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

describe('DAP Tools', () => {
    let mockDAPService: any

    beforeEach(() => {
        vi.clearAllMocks()
        mockDAPService = new DAPService()

        // Mock resolveDAPServer to return success by default
        const mockResolveDAPServer = vi.mocked(resolveDAPServer)
        mockResolveDAPServer.mockResolvedValue({
            success: true,
            host: '127.0.0.1',
            port: 49279
        })
    })

    describe('DAP_TOOLS', () => {
        it('should export DAP_TOOLS array with correct structure', () => {
            expect(DAP_TOOLS).toBeDefined()
            expect(Array.isArray(DAP_TOOLS)).toBe(true)
            expect(DAP_TOOLS.length).toBeGreaterThan(0)

            // Check each tool has required properties
            DAP_TOOLS.forEach(tool => {
                expect(tool).toHaveProperty('name')
                expect(tool).toHaveProperty('description')
                expect(tool).toHaveProperty('inputSchema')
                expect(typeof tool.name).toBe('string')
                expect(typeof tool.description).toBe('string')
                expect(typeof tool.inputSchema).toBe('object')
            })
        })

        it('should have proper default values in input schemas', () => {
            const restartTool = DAP_TOOLS.find(tool => tool.name === 'dap_restart')
            expect(restartTool).toBeDefined()
            expect(restartTool?.inputSchema.properties?.host?.default).toBe('127.0.0.1')
            expect(restartTool?.inputSchema.properties?.rebuild_first?.default).toBe(true)
        })
    })

    describe('handleDAPRestart', () => {
        it('should handle successful DAP restart', async () => {
            const mockResponse = {
                seq: 1,
                type: 'response',
                request_seq: 1,
                success: true
            }

            mockDAPService.sendDAPRequest.mockResolvedValue(mockResponse)

            const result = await handleDAPRestart(mockDAPService, {
                host: '127.0.0.1',
                port: 49279
            })

            expect(result.content).toHaveLength(1)
            expect(result.isError).toBeUndefined()
            expect(mockDAPService.sendDAPRequest).toHaveBeenCalledWith(
                '127.0.0.1',
                49279,
                'disconnect',
                { restart: true }
            )
        })

        it('should use default values when not provided', async () => {
            const mockResponse = {
                seq: 1,
                type: 'response',
                request_seq: 1,
                success: true
            }

            mockDAPService.sendDAPRequest.mockResolvedValue(mockResponse)

            const result = await handleDAPRestart(mockDAPService, {})

            expect(mockDAPService.sendDAPRequest).toHaveBeenCalledWith(
                '127.0.0.1',
                49279,
                'disconnect',
                { restart: true }
            )
        })

        it('should handle DAP restart errors', async () => {
            mockDAPService.sendDAPRequest.mockRejectedValue(new Error('Connection failed'))

            const result = await handleDAPRestart(mockDAPService, {
                host: '127.0.0.1',
                port: 49279
            })

            expect(result.content).toHaveLength(1)
            expect(result.isError).toBe(true)
        })

        it('should handle rebuild_first flag (currently logs only)', async () => {
            const mockResponse = {
                seq: 1,
                type: 'response',
                request_seq: 1,
                success: true
            }

            mockDAPService.sendDAPRequest.mockResolvedValue(mockResponse)

            // Test that function completes without error when rebuild_first is true
            const result = await handleDAPRestart(mockDAPService, {
                host: '127.0.0.1',
                port: 49279,
                rebuild_first: true,
                project_path: '/path/to/project'
            })

            expect(result.content).toHaveLength(1)
            expect(result.isError).toBeUndefined()

            // Test passes if no error is thrown (build failure is handled gracefully)
        })
    })

    describe('handleDAPSendCommand', () => {
        it('should handle successful DAP command execution', async () => {
            const mockResponse = {
                seq: 1,
                type: 'response',
                request_seq: 1,
                success: true,
                command: 'continue'
            }

            mockDAPService.sendDAPRequest.mockResolvedValue(mockResponse)

            const result = await handleDAPSendCommand(mockDAPService, {
                command: 'continue'
            })

            expect(result.content).toHaveLength(1)
            expect(result.isError).toBeUndefined()

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.success).toBe(true)
            expect(parsedContent.command).toBe('continue')
        })

        it('should handle DAP command with custom host and port', async () => {
            const mockResponse = {
                seq: 1,
                type: 'response',
                request_seq: 1,
                success: true
            }

            mockDAPService.sendDAPRequest.mockResolvedValue(mockResponse)

            // Mock resolveDAPServer to return custom values for this test
            const mockResolveDAPServer = vi.mocked(resolveDAPServer)
            mockResolveDAPServer.mockResolvedValueOnce({
                success: true,
                host: '192.168.1.100',
                port: 50000
            })

            const result = await handleDAPSendCommand(mockDAPService, {
                host: '192.168.1.100',
                port: 50000,
                command: 'setBreakpoints',
                arguments: { source: { path: '/app/main.go' }, breakpoints: [{ line: 10 }] }
            })

            expect(mockDAPService.sendDAPRequest).toHaveBeenCalledWith(
                '192.168.1.100',
                50000,
                'setBreakpoints',
                { source: { path: '/app/main.go' }, breakpoints: [{ line: 10 }] }
            )
        })

        it('should handle DAP command errors', async () => {
            mockDAPService.sendDAPRequest.mockRejectedValue(new Error('Invalid command'))

            const result = await handleDAPSendCommand(mockDAPService, {
                command: 'invalid_command'
            })

            expect(result.content).toHaveLength(1)
            expect(result.isError).toBe(true)

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.success).toBe(false)
            expect(parsedContent.error).toBe('Invalid command')
        })

        it('should handle empty arguments gracefully', async () => {
            const mockResponse = {
                seq: 1,
                type: 'response',
                request_seq: 1,
                success: true
            }

            mockDAPService.sendDAPRequest.mockResolvedValue(mockResponse)

            const result = await handleDAPSendCommand(mockDAPService, {
                command: 'continue'
            })

            expect(mockDAPService.sendDAPRequest).toHaveBeenCalledWith(
                '127.0.0.1',
                49279,
                'continue',
                {} // empty arguments object
            )
        })

        it('should handle failed DAP responses', async () => {
            const mockResponse = {
                seq: 1,
                type: 'response',
                request_seq: 1,
                success: false,
                message: 'Breakpoint not found'
            }

            mockDAPService.sendDAPRequest.mockResolvedValue(mockResponse)

            const result = await handleDAPSendCommand(mockDAPService, {
                command: 'setBreakpoints'
            })

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.success).toBe(false) // success is false in response
        })
    })
})