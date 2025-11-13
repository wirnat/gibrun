import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DAPService } from '../../../src/services/dap-service.js'
import * as net from 'net'

// Mock net module
vi.mock('net', () => ({
    createConnection: vi.fn()
}))

// Mock logger service
vi.mock('../../../src/services/logger-service.js', () => ({
    logError: vi.fn(),
    logInfo: vi.fn()
}))

describe('DAPService', () => {
    let service: DAPService
    let mockSocket: any

    beforeEach(() => {
        vi.clearAllMocks()
        service = new DAPService()

        mockSocket = {
            write: vi.fn(),
            end: vi.fn(),
            on: vi.fn(),
            removeListener: vi.fn(),
            once: vi.fn()
        }

        const mockCreateConnection = vi.mocked(net.createConnection)
        mockCreateConnection.mockImplementation((options, callback) => {
            // Simulate async connection
            setTimeout(() => {
                if (callback) callback()
            }, 1)
            return mockSocket as any
        })
    })

    afterEach(async () => {
        await service.closeAllConnections()
    })

    describe('sendDAPRequest', () => {
        it('should send DAP request and receive response successfully', async () => {
            const mockResponse = {
                seq: 1,
                type: 'response',
                request_seq: 1,
                success: true,
                command: 'initialize',
                body: { capabilities: {} }
            }

            // Mock successful connection and response
            mockSocket.write.mockImplementation((data, callback) => {
                if (callback) callback()
            })

            mockSocket.on.mockImplementation((event, handler) => {
                if (event === 'data') {
                    // Simulate receiving response
                    setTimeout(() => {
                        handler(Buffer.from(JSON.stringify(mockResponse) + '\r\n'))
                    }, 10)
                }
            })

            const result = await service.sendDAPRequest('localhost', 5678, 'initialize', {
                adapterID: 'go',
                pathFormat: 'path'
            })

            expect(result).toEqual(mockResponse)
            expect(mockSocket.write).toHaveBeenCalledWith(
                expect.stringContaining('"command":"initialize"'),
                expect.any(Function)
            )
        })

        it('should handle connection errors', async () => {
            const mockCreateConnection = vi.mocked(net.createConnection)
            mockCreateConnection.mockImplementation(() => {
                throw new Error('Connection refused')
            })

            await expect(service.sendDAPRequest('localhost', 5678, 'initialize'))
                .rejects.toThrow('Connection refused')
        })

        it('should handle message sending errors', async () => {
            mockSocket.write.mockImplementation((data, callback) => {
                if (callback) callback(new Error('Write failed'))
            })

            await expect(service.sendDAPRequest('localhost', 5678, 'initialize'))
                .rejects.toThrow('Write failed')
        })

        it('should handle response parsing errors', async () => {
            mockSocket.write.mockImplementation((data, callback) => {
                if (callback) callback()
            })

            mockSocket.on.mockImplementation((event, handler) => {
                if (event === 'data') {
                    setTimeout(() => {
                        handler(Buffer.from('invalid json\r\n'))
                    }, 10)
                }
            })

            await expect(service.sendDAPRequest('localhost', 5678, 'initialize'))
                .rejects.toThrow()
        })

        it('should handle response timeout', async () => {
            mockSocket.write.mockImplementation((data, callback) => {
                if (callback) callback()
            })

            // Mock no data received (timeout)
            mockSocket.on.mockImplementation(() => {})

            await expect(service.sendDAPRequest('localhost', 5678, 'initialize'))
                .rejects.toThrow('DAP response timeout')
        }, 35000) // Longer timeout for this test
    })

    describe('disconnect', () => {
        it('should disconnect specific connection', async () => {
            // First establish a connection
            mockSocket.write.mockImplementation((data, callback) => {
                if (callback) callback()
            })

            mockSocket.on.mockImplementation((event, handler) => {
                if (event === 'data') {
                    setTimeout(() => {
                        handler(Buffer.from('{"seq":1,"type":"response","success":true}\r\n'))
                    }, 10)
                }
            })

            await service.sendDAPRequest('localhost', 5678, 'initialize')

            // Disconnect
            await service.disconnect('localhost', 5678)

            expect(mockSocket.end).toHaveBeenCalled()
        })

        it('should handle disconnecting non-existent connection gracefully', async () => {
            await expect(service.disconnect('localhost', 9999)).resolves.toBeUndefined()
        })
    })
})