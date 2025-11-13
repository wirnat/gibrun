import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { DAPService } from "../../services/dap-service.js";
import { resolveDAPServer } from "../../core/dap-handlers.js";
import { DAPThread, DAPThreadInfo } from "../../types/server.js";

// Thread management tools for DAP

export const DAP_THREAD_TOOLS: Tool[] = [
    {
        name: "dap_list_threads",
        description: "List all threads in the current debugging session. Useful for multi-threaded applications to see thread states and locations.",
        inputSchema: {
            type: "object",
            properties: {
                host: {
                    type: "string",
                    description: "DAP server host (default: auto-detected)",
                    default: "127.0.0.1"
                },
                port: {
                    type: "number",
                    description: "DAP server port (auto-detected if not provided)"
                },
                include_stack_traces: {
                    type: "boolean",
                    description: "Include basic stack trace information for each thread",
                    default: false
                }
            }
        },
    },
    {
        name: "dap_switch_thread",
        description: "Switch the debugger focus to a specific thread. Subsequent operations will target this thread.",
        inputSchema: {
            type: "object",
            properties: {
                host: {
                    type: "string",
                    description: "DAP server host (default: auto-detected)",
                    default: "127.0.0.1"
                },
                port: {
                    type: "number",
                    description: "DAP server port (auto-detected if not provided)"
                },
                threadId: {
                    type: "number",
                    description: "ID of the thread to switch to"
                }
            },
            required: ["threadId"]
        },
    },
    {
        name: "dap_thread_info",
        description: "Get detailed information about a specific thread including stack frames and variables.",
        inputSchema: {
            type: "object",
            properties: {
                host: {
                    type: "string",
                    description: "DAP server host (default: auto-detected)",
                    default: "127.0.0.1"
                },
                port: {
                    type: "number",
                    description: "DAP server port (auto-detected if not provided)"
                },
                threadId: {
                    type: "number",
                    description: "ID of the thread to get information for"
                },
                include_stack: {
                    type: "boolean",
                    description: "Include full stack trace information",
                    default: true
                },
                include_variables: {
                    type: "boolean",
                    description: "Include local variables for the top stack frame",
                    default: false
                },
                max_stack_frames: {
                    type: "number",
                    description: "Maximum number of stack frames to return",
                    default: 20,
                    minimum: 1,
                    maximum: 100
                }
            },
            required: ["threadId"]
        },
    },
];

export async function handleDAPListThreads(dapService: DAPService, args: any) {
    const { host, port, include_stack_traces = false } = args;

    try {
        // Resolve DAP server
        const resolution = await resolveDAPServer(host, port);
        if (!resolution.success) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: false,
                            error: resolution.error,
                            tool: "dap_list_threads"
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }

        const resolvedHost = resolution.host;
        const resolvedPort = resolution.port;

        // Get threads list
        const threadsResult = await dapService.sendDAPRequest(resolvedHost, resolvedPort, 'threads', {});

        if (!threadsResult.success) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: false,
                            tool: "dap_list_threads",
                            error: "Failed to retrieve threads",
                            dap_response: threadsResult,
                            dap_server: `${resolvedHost}:${resolvedPort}`
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }

        const threads: DAPThread[] = threadsResult.body?.threads || [];

        // Optionally get basic stack traces for each thread
        let threadsWithStack = threads;
        if (include_stack_traces && threads.length > 0) {
            threadsWithStack = await Promise.all(
                threads.map(async (thread) => {
                    try {
                        const stackResult = await dapService.sendDAPRequest(resolvedHost, resolvedPort, 'stackTrace', {
                            threadId: thread.id,
                            startFrame: 0,
                            levels: 1
                        });

                        return {
                            ...thread,
                            location: stackResult.body?.stackFrames?.[0] ? {
                                file: stackResult.body.stackFrames[0].source?.path,
                                line: stackResult.body.stackFrames[0].line,
                                column: stackResult.body.stackFrames[0].column
                            } : undefined
                        };
                    } catch (error) {
                        // Return thread without stack info if stack trace fails
                        return thread;
                    }
                })
            );
        }

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        tool: "dap_list_threads",
                        threads_count: threadsWithStack.length,
                        threads: threadsWithStack,
                        include_stack_traces,
                        dap_server: `${resolvedHost}:${resolvedPort}`,
                        summary: {
                            running_threads: threadsWithStack.filter(t => t.state === 'running').length,
                            stopped_threads: threadsWithStack.filter(t => t.state === 'stopped').length,
                            exited_threads: threadsWithStack.filter(t => t.state === 'exited').length,
                            unknown_state: threadsWithStack.filter(t => !t.state).length
                        }
                    }, null, 2),
                },
            ],
        };
    } catch (error: any) {
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: false,
                        tool: "dap_list_threads",
                        include_stack_traces,
                        error: error.message
                    }, null, 2),
                },
            ],
            isError: true,
        };
    }
}

export async function handleDAPSwitchThread(dapService: DAPService, args: any) {
    const { host, port, threadId } = args;

    try {
        // Resolve DAP server
        const resolution = await resolveDAPServer(host, port);
        if (!resolution.success) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: false,
                            error: resolution.error,
                            tool: "dap_switch_thread",
                            thread_id: threadId
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }

        const resolvedHost = resolution.host;
        const resolvedPort = resolution.port;

        // In DAP, thread focus is typically handled by specifying threadId in subsequent commands
        // We'll verify the thread exists first
        const threadsResult = await dapService.sendDAPRequest(resolvedHost, resolvedPort, 'threads', {});

        if (!threadsResult.success) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: false,
                            tool: "dap_switch_thread",
                            thread_id: threadId,
                            error: "Failed to retrieve threads list",
                            dap_server: `${resolvedHost}:${resolvedPort}`
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }

        const threads: DAPThread[] = threadsResult.body?.threads || [];
        const targetThread = threads.find(t => t.id === threadId);

        if (!targetThread) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: false,
                            tool: "dap_switch_thread",
                            thread_id: threadId,
                            error: `Thread ${threadId} not found`,
                            available_threads: threads.map(t => ({ id: t.id, name: t.name })),
                            dap_server: `${resolvedHost}:${resolvedPort}`
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }

        // Get current stack frame for the thread to confirm it's accessible
        const stackResult = await dapService.sendDAPRequest(resolvedHost, resolvedPort, 'stackTrace', {
            threadId: threadId,
            startFrame: 0,
            levels: 1
        });

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        tool: "dap_switch_thread",
                        thread_id: threadId,
                        thread_info: targetThread,
                        current_location: stackResult.body?.stackFrames?.[0] ? {
                            file: stackResult.body.stackFrames[0].source?.path,
                            line: stackResult.body.stackFrames[0].line,
                            column: stackResult.body.stackFrames[0].column
                        } : null,
                        dap_server: `${resolvedHost}:${resolvedPort}`,
                        note: "Thread focus switched. Subsequent debugging operations will target this thread."
                    }, null, 2),
                },
            ],
        };
    } catch (error: any) {
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: false,
                        tool: "dap_switch_thread",
                        thread_id: threadId,
                        error: error.message
                    }, null, 2),
                },
            ],
            isError: true,
        };
    }
}

export async function handleDAPThreadInfo(dapService: DAPService, args: any) {
    const {
        host,
        port,
        threadId,
        include_stack = true,
        include_variables = false,
        max_stack_frames = 20
    } = args;

    try {
        // Resolve DAP server
        const resolution = await resolveDAPServer(host, port);
        if (!resolution.success) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: false,
                            error: resolution.error,
                            tool: "dap_thread_info",
                            thread_id: threadId
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }

        const resolvedHost = resolution.host;
        const resolvedPort = resolution.port;

        // Get basic thread info first
        const threadsResult = await dapService.sendDAPRequest(resolvedHost, resolvedPort, 'threads', {});
        const threads: DAPThread[] = threadsResult.body?.threads || [];
        const thread = threads.find(t => t.id === threadId);

        if (!thread) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: false,
                            tool: "dap_thread_info",
                            thread_id: threadId,
                            error: `Thread ${threadId} not found`,
                            available_threads: threads.map(t => ({ id: t.id, name: t.name })),
                            dap_server: `${resolvedHost}:${resolvedPort}`
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }

        const threadInfo: DAPThreadInfo = {
            thread
        };

        // Get stack trace if requested
        if (include_stack) {
            try {
                const stackResult = await dapService.sendDAPRequest(resolvedHost, resolvedPort, 'stackTrace', {
                    threadId: threadId,
                    startFrame: 0,
                    levels: max_stack_frames
                });

                threadInfo.stackFrames = stackResult.body?.stackFrames || [];
                threadInfo.callStack = stackResult.body?.stackFrames?.map((frame: any) =>
                    `${frame.name} (${frame.source?.path}:${frame.line})`
                ) || [];
            } catch (stackError: any) {
                threadInfo.stackFrames = [];
                threadInfo.callStack = [`Error getting stack trace: ${stackError.message}`];
            }
        }

        // Get variables for top stack frame if requested
        if (include_variables && threadInfo.stackFrames && threadInfo.stackFrames.length > 0) {
            try {
                const topFrame = threadInfo.stackFrames[0];
                if (topFrame) {
                    const variablesResult = await dapService.sendDAPRequest(resolvedHost, resolvedPort, 'variables', {
                        variablesReference: topFrame.variablesReference || 0
                    });

                    threadInfo.variables = variablesResult.body?.variables || [];
                }
            } catch (variablesError: any) {
                threadInfo.variables = [`Error getting variables: ${variablesError.message}`];
            }
        }

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        tool: "dap_thread_info",
                        thread_id: threadId,
                        thread_info: threadInfo,
                        include_stack,
                        include_variables,
                        max_stack_frames,
                        dap_server: `${resolvedHost}:${resolvedPort}`,
                        summary: {
                            stack_frames_count: threadInfo.stackFrames?.length || 0,
                            variables_count: Array.isArray(threadInfo.variables) ? threadInfo.variables.length : 0,
                            thread_state: thread.state,
                            current_location: threadInfo.callStack?.[0] || 'Unknown'
                        }
                    }, null, 2),
                },
            ],
        };
    } catch (error: any) {
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: false,
                        tool: "dap_thread_info",
                        thread_id: threadId,
                        error: error.message
                    }, null, 2),
                },
            ],
            isError: true,
        };
    }
}