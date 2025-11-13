import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DAPService } from '../../../src/services/dap-service.js';
import {
    handleDAPListThreads,
    handleDAPSwitchThread,
    handleDAPThreadInfo
} from '../../../src/tools/dap/thread-tools.js';

// Mock DAPService
vi.mock('../../../src/services/dap-service.js');
vi.mock('../../../src/core/dap-handlers.js', () => ({
    resolveDAPServer: vi.fn().mockResolvedValue({
        success: true,
        host: '127.0.0.1',
        port: 2345
    })
}));

describe('DAP Thread Tools', () => {
    let mockDAPService: any;

    beforeEach(() => {
        mockDAPService = {
            sendDAPRequest: vi.fn()
        };
        (DAPService as any).mockImplementation(() => mockDAPService);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('handleDAPListThreads', () => {
        it('should list threads successfully', async () => {
            const mockThreads = [
                { id: 1, name: 'main', state: 'stopped' },
                { id: 2, name: 'worker', state: 'running' }
            ];

            mockDAPService.sendDAPRequest.mockResolvedValueOnce({
                type: 'response',
                success: true,
                body: { threads: mockThreads }
            });

            const result = await handleDAPListThreads(mockDAPService, {});

            expect(result.content[0].type).toBe('text');
            const response = JSON.parse(result.content[0].text);
            expect(response.success).toBe(true);
            expect(response.tool).toBe('dap_list_threads');
            expect(response.threads_count).toBe(2);
            expect(response.threads).toEqual(mockThreads);
            expect(response.summary.running_threads).toBe(1);
            expect(response.summary.stopped_threads).toBe(1);
        });

        it('should include stack traces when requested', async () => {
            const mockThreads = [{ id: 1, name: 'main' }];
            const mockStackFrame = {
                source: { path: '/app/main.go' },
                line: 15,
                column: 10
            };

            mockDAPService.sendDAPRequest
                .mockResolvedValueOnce({
                    type: 'response',
                    success: true,
                    body: { threads: mockThreads }
                })
                .mockResolvedValueOnce({
                    type: 'response',
                    success: true,
                    body: { stackFrames: [mockStackFrame] }
                });

            const result = await handleDAPListThreads(mockDAPService, {
                include_stack_traces: true
            });

            expect(result.content[0].type).toBe('text');
            const response = JSON.parse(result.content[0].text);
            expect(response.success).toBe(true);
            expect(response.threads[0].location).toEqual({
                file: '/app/main.go',
                line: 15,
                column: 10
            });
        });

        it('should handle DAP server resolution failure', async () => {
            const { resolveDAPServer } = await import('../../../src/core/dap-handlers.js');
            (resolveDAPServer as any).mockResolvedValueOnce({
                success: false,
                error: 'No DAP server found'
            });

            const result = await handleDAPListThreads(mockDAPService, {});

            expect(result.isError).toBe(true);
            const response = JSON.parse(result.content[0].text);
            expect(response.success).toBe(false);
            expect(response.error).toBe('No DAP server found');
        });
    });

    describe('handleDAPSwitchThread', () => {
        it('should switch thread successfully', async () => {
            const mockThreads = [
                { id: 1, name: 'main' },
                { id: 2, name: 'worker' }
            ];
            const mockStackFrame = {
                source: { path: '/app/worker.go' },
                line: 25,
                column: 5
            };

            mockDAPService.sendDAPRequest
                .mockResolvedValueOnce({
                    type: 'response',
                    success: true,
                    body: { threads: mockThreads }
                })
                .mockResolvedValueOnce({
                    type: 'response',
                    success: true,
                    body: { stackFrames: [mockStackFrame] }
                });

            const result = await handleDAPSwitchThread(mockDAPService, { threadId: 2 });

            expect(result.content[0].type).toBe('text');
            const response = JSON.parse(result.content[0].text);
            expect(response.success).toBe(true);
            expect(response.tool).toBe('dap_switch_thread');
            expect(response.thread_id).toBe(2);
            expect(response.thread_info.name).toBe('worker');
            expect(response.current_location).toEqual({
                file: '/app/worker.go',
                line: 25,
                column: 5
            });
        });

        it('should handle non-existent thread', async () => {
            const mockThreads = [{ id: 1, name: 'main' }];

            mockDAPService.sendDAPRequest.mockResolvedValueOnce({
                type: 'response',
                success: true,
                body: { threads: mockThreads }
            });

            const result = await handleDAPSwitchThread(mockDAPService, { threadId: 999 });

            expect(result.isError).toBe(true);
            const response = JSON.parse(result.content[0].text);
            expect(response.success).toBe(false);
            expect(response.error).toBe('Thread 999 not found');
            expect(response.available_threads).toEqual([{ id: 1, name: 'main' }]);
        });
    });

    describe('handleDAPThreadInfo', () => {
        it('should get thread info with stack trace', async () => {
            const mockThreads = [{ id: 1, name: 'main', state: 'stopped' }];
            const mockStackFrames = [
                {
                    name: 'main',
                    source: { path: '/app/main.go' },
                    line: 10,
                    variablesReference: 100
                }
            ];

            mockDAPService.sendDAPRequest
                .mockResolvedValueOnce({
                    type: 'response',
                    success: true,
                    body: { threads: mockThreads }
                })
                .mockResolvedValueOnce({
                    type: 'response',
                    success: true,
                    body: { stackFrames: mockStackFrames }
                });

            const result = await handleDAPThreadInfo(mockDAPService, {
                threadId: 1,
                include_stack: true
            });

            expect(result.content[0].type).toBe('text');
            const response = JSON.parse(result.content[0].text);
            expect(response.success).toBe(true);
            expect(response.tool).toBe('dap_thread_info');
            expect(response.thread_id).toBe(1);
            expect(response.thread_info.thread.name).toBe('main');
            expect(response.thread_info.stackFrames).toEqual(mockStackFrames);
            expect(response.thread_info.callStack).toEqual(['main (/app/main.go:10)']);
        });

        it('should get thread info with variables', async () => {
            const mockThreads = [{ id: 1, name: 'main' }];
            const mockStackFrames = [{ variablesReference: 100 }];
            const mockVariables = [
                { name: 'x', value: '42', type: 'int' },
                { name: 'msg', value: '"hello"', type: 'string' }
            ];

            mockDAPService.sendDAPRequest
                .mockResolvedValueOnce({
                    type: 'response',
                    success: true,
                    body: { threads: mockThreads }
                })
                .mockResolvedValueOnce({
                    type: 'response',
                    success: true,
                    body: { stackFrames: mockStackFrames }
                })
                .mockResolvedValueOnce({
                    type: 'response',
                    success: true,
                    body: { variables: mockVariables }
                });

            const result = await handleDAPThreadInfo(mockDAPService, {
                threadId: 1,
                include_variables: true
            });

            expect(result.content[0].type).toBe('text');
            const response = JSON.parse(result.content[0].text);
            expect(response.success).toBe(true);
            expect(response.thread_info.variables).toEqual(mockVariables);
            expect(response.summary.variables_count).toBe(2);
        });

        it('should handle thread not found', async () => {
            mockDAPService.sendDAPRequest.mockResolvedValueOnce({
                type: 'response',
                success: true,
                body: { threads: [{ id: 1, name: 'main' }] }
            });

            const result = await handleDAPThreadInfo(mockDAPService, { threadId: 2 });

            expect(result.isError).toBe(true);
            const response = JSON.parse(result.content[0].text);
            expect(response.success).toBe(false);
            expect(response.error).toBe('Thread 2 not found');
        });
    });
});