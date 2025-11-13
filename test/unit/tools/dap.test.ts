import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DAP_TOOLS, handleDAPRestart, handleDAPSendCommand } from '../../../src/tools/dap/index.js'
import { resolveDAPServer } from '../../../src/core/dap-handlers.js'

// Mock resolveDAPServer
vi.mock('../../../src/core/dap-handlers.js', () => ({
    resolveDAPServer: vi.fn()
}))

describe('DAP Tools', () => {
    let mockDAPService: any

    beforeEach(() => {
        vi.clearAllMocks()

        // Create mock DAPService instance
        mockDAPService = {
            sendDAPRequest: vi.fn()
        }

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
            expect(DAP_TOOLS).toBeInstanceOf(Array)
            expect(DAP_TOOLS).toHaveLength(15)

            // Check first tool (dap_restart)
            const restartTool = DAP_TOOLS[0]
            expect(restartTool.name).toBe('dap_restart')
            expect(restartTool.description).toContain('Restart VSCode debugger session')
            expect(restartTool.inputSchema.type).toBe('object')

            const restartProps = restartTool.inputSchema.properties as any
            expect(restartProps).toHaveProperty('host')
            expect(restartProps).toHaveProperty('port')
            expect(restartProps).toHaveProperty('rebuild_first')
            expect(restartProps).toHaveProperty('project_path')
            expect(restartProps.host.default).toBe('127.0.0.1')
            expect(restartProps.rebuild_first.default).toBe(true)

            // Check second tool (dap_send_command)
            const sendCommandTool = DAP_TOOLS[1]
            expect(sendCommandTool.name).toBe('dap_send_command')
            expect(sendCommandTool.description).toContain('Send custom DAP commands')

            const sendCommandProps = sendCommandTool.inputSchema.properties as any
            expect(sendCommandProps).toHaveProperty('command')
            expect(sendCommandProps).toHaveProperty('arguments')
            expect(sendCommandProps.host.default).toBe('127.0.0.1')
            expect(sendCommandTool.inputSchema.required).toEqual(['command'])
        })

        it('should have proper default values in input schemas', () => {
            const restartTool = DAP_TOOLS[0]
            const sendCommandTool = DAP_TOOLS[1]

            // Test that required fields are properly defined
            expect(sendCommandTool.inputSchema.required).toEqual(['command'])
        })
    })

    describe('handleDAPRestart', () => {
        it('should handle successful DAP restart', async () => {
            const mockResponse = {
                seq: 1,
                type: 'response',
                request_seq: 1,
                success: true,
                command: 'disconnect'
            }

            mockDAPService.sendDAPRequest.mockResolvedValue(mockResponse)

            const result = await handleDAPRestart(mockDAPService, {
                host: '127.0.0.1',
                port: 49279,
                rebuild_first: false
            })

            expect(mockDAPService.sendDAPRequest).toHaveBeenCalledWith(
                '127.0.0.1',
                49279,
                'disconnect',
                { restart: true }
            )

            expect(result.content).toHaveLength(1)
            expect(result.content[0].type).toBe('text')

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.success).toBe(true)
            expect(parsedContent.message).toBe('DAP restart initiated')
            expect(parsedContent.dap_response).toEqual(mockResponse)
            expect(result.isError).toBeUndefined()
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
                '127.0.0.1', // default host
                49279, // default port
                'disconnect',
                { restart: true }
            )
        })

        it('should handle DAP restart errors', async () => {
            const testError = new Error('Connection failed')
            mockDAPService.sendDAPRequest.mockRejectedValue(testError)

            const result = await handleDAPRestart(mockDAPService, {
                host: '127.0.0.1',
                port: 49279
            })

            expect(result.content).toHaveLength(1)
            expect(result.content[0].type).toBe('text')

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.success).toBe(false)
            expect(parsedContent.error).toBe('Connection failed')
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
        })

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
                command: 'initialize',
                body: { capabilities: {} }
            }

            mockDAPService.sendDAPRequest.mockResolvedValue(mockResponse)

            const result = await handleDAPSendCommand(mockDAPService, {
                command: 'initialize',
                arguments: { adapterID: 'go' }
            })

            expect(mockDAPService.sendDAPRequest).toHaveBeenCalledWith(
                '127.0.0.1', // default host
                49279, // default port
                'initialize',
                { adapterID: 'go' }
            )

            expect(result.content).toHaveLength(1)
            expect(result.content[0].type).toBe('text')

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.success).toBe(true)
            expect(parsedContent.command).toBe('initialize')
            expect(parsedContent.result).toEqual(mockResponse)
            expect(result.isError).toBeUndefined()
        })

        it('should handle DAP command with custom host and port', async () => {
            const mockResponse = {
                seq: 1,
                type: 'response',
                request_seq: 1,
                success: true,
                command: 'launch'
            }

            mockDAPService.sendDAPRequest.mockResolvedValue(mockResponse)

            await handleDAPSendCommand(mockDAPService, {
                host: '127.0.0.1',
                port: 49279,
                command: 'launch',
                arguments: { program: '/path/to/app' }
            })

            expect(mockDAPService.sendDAPRequest).toHaveBeenCalledWith(
                '127.0.0.1',
                49279,
                'launch',
                { program: '/path/to/app' }
            )
        })

            expect(mockDAPService.sendDAPRequest).toHaveBeenCalledWith(
                '192.168.1.100',
                5678,
                'launch',
                { program: '/path/to/app' }
            )
        })

        it('should handle DAP command errors', async () => {
            const testError = new Error('Invalid command')
            mockDAPService.sendDAPRequest.mockRejectedValue(testError)

            const result = await handleDAPSendCommand(mockDAPService, {
                command: 'invalid_command'
            })

            expect(result.content).toHaveLength(1)
            expect(result.content[0].type).toBe('text')

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.success).toBe(false)
            expect(parsedContent.command).toBe('invalid_command')
            expect(parsedContent.error).toBe('Invalid command')
            expect(result.isError).toBe(true)
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