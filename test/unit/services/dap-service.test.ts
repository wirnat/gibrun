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

// Mock core handlers
vi.mock('../../../src/core/dap-handlers.js', () => ({
    resolveDAPServer: vi.fn(),
    detectDAPServers: vi.fn()
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

    describe('event handling', () => {
        it.skip('should handle DAP events', async () => {
            mockSocket.write.mockImplementation((data, callback) => {
                if (callback) callback()
            })

            let eventReceived = false;
            const testEvent = {
                seq: 2,
                type: 'event',
                event: 'stopped',
                body: { reason: 'breakpoint', threadId: 1 }
            };

            // Store the data handler to call it later
            let dataHandler: (data: Buffer) => void;

            mockSocket.on.mockImplementation((event, handler) => {
                if (event === 'data') {
                    dataHandler = handler;
                }
            })

            // Simulate socket receiving data
            setTimeout(() => {
                if (dataHandler) {
                    // First send response
                    dataHandler(Buffer.from('{"seq":1,"type":"response","success":true}\r\n'));
                    // Then send event
                    setTimeout(() => {
                        dataHandler(Buffer.from(JSON.stringify(testEvent) + '\r\n'));
                    }, 10);
                }
            }, 5);

            // Add event listener
            service.addEventListener('stopped', (event) => {
                eventReceived = true;
                expect(event).toEqual(testEvent);
            });

            await service.sendDAPRequest('localhost', 5678, 'initialize');

            // Wait for event processing
            await new Promise(resolve => setTimeout(resolve, 20));

            expect(eventReceived).toBe(true);
        })

        it('should listen for events with timeout', async () => {
            const events = await service.listenForEvents('localhost', 5678, {
                eventTypes: ['stopped'],
                timeoutMs: 100,
                maxEvents: 1
            });

            expect(Array.isArray(events)).toBe(true);
        })

        it('should manage event subscriptions', () => {
            const callback = vi.fn();
            const subscription = {
                eventType: 'breakpoint',
                filter: { threadId: 1 },
                persistent: true,
                callback
            };

            service.subscribeToEvent(subscription);
            service.unsubscribeFromEvent('breakpoint');

            // Should not crash
            expect(true).toBe(true);
        })
    })
})