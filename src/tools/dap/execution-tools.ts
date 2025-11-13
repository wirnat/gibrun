import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { DAPService } from "@/services/dap-service.js";
import { resolveDAPServer } from "@/core/dap-handlers.js";

// Execution control tools for DAP

export const DAP_EXECUTION_TOOLS: Tool[] = [
    {
        name: "dap_continue",
        description: "Continue program execution until the next breakpoint or program termination.",
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
                    description: "Optional thread ID to continue (default: all threads)"
                }
            }
        },
    },
    {
        name: "dap_step_over",
        description: "Step over the current line, executing any function calls without stepping into them.",
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
                    description: "Thread ID to step over"
                }
            },
            required: ["threadId"]
        },
    },
    {
        name: "dap_step_into",
        description: "Step into the current function call, entering the function being called.",
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
                    description: "Thread ID to step into"
                }
            },
            required: ["threadId"]
        },
    },
    {
        name: "dap_step_out",
        description: "Step out of the current function, continuing execution until returning to the caller.",
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
                    description: "Thread ID to step out of"
                }
            },
            required: ["threadId"]
        },
    },
    {
        name: "dap_pause",
        description: "Pause program execution, stopping at the current location.",
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
                    description: "Optional thread ID to pause (default: all threads)"
                }
            }
        },
    },
];

export async function handleDAPContinue(dapService: DAPService, args: any) {
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
                            tool: "dap_continue"
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }

        const resolvedHost = resolution.host;
        const resolvedPort = resolution.port;

        const result = await dapService.sendDAPRequest(resolvedHost, resolvedPort, 'continue', {
            threadId: threadId
        });

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: result.type === 'response' && result.success !== false,
                        tool: "dap_continue",
                        thread_id: threadId || "all",
                        message: "Program execution continued",
                        dap_server: `${resolvedHost}:${resolvedPort}`,
                        result
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
                        tool: "dap_continue",
                        thread_id: threadId || "all",
                        error: error.message
                    }, null, 2),
                },
            ],
            isError: true,
        };
    }
}

export async function handleDAPStepOver(dapService: DAPService, args: any) {
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
                            tool: "dap_step_over"
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }

        const resolvedHost = resolution.host;
        const resolvedPort = resolution.port;

        const result = await dapService.sendDAPRequest(resolvedHost, resolvedPort, 'next', {
            threadId: threadId
        });

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: result.type === 'response' && result.success !== false,
                        tool: "dap_step_over",
                        thread_id: threadId,
                        message: "Stepped over current line",
                        dap_server: `${resolvedHost}:${resolvedPort}`,
                        result
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
                        tool: "dap_step_over",
                        thread_id: threadId,
                        error: error.message
                    }, null, 2),
                },
            ],
            isError: true,
        };
    }
}

export async function handleDAPStepInto(dapService: DAPService, args: any) {
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
                            tool: "dap_step_into"
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }

        const resolvedHost = resolution.host;
        const resolvedPort = resolution.port;

        const result = await dapService.sendDAPRequest(resolvedHost, resolvedPort, 'stepIn', {
            threadId: threadId
        });

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: result.type === 'response' && result.success !== false,
                        tool: "dap_step_into",
                        thread_id: threadId,
                        message: "Stepped into function call",
                        dap_server: `${resolvedHost}:${resolvedPort}`,
                        result
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
                        tool: "dap_step_into",
                        thread_id: threadId,
                        error: error.message
                    }, null, 2),
                },
            ],
            isError: true,
        };
    }
}

export async function handleDAPStepOut(dapService: DAPService, args: any) {
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
                            tool: "dap_step_out"
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }

        const resolvedHost = resolution.host;
        const resolvedPort = resolution.port;

        const result = await dapService.sendDAPRequest(resolvedHost, resolvedPort, 'stepOut', {
            threadId: threadId
        });

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: result.type === 'response' && result.success !== false,
                        tool: "dap_step_out",
                        thread_id: threadId,
                        message: "Stepped out of current function",
                        dap_server: `${resolvedHost}:${resolvedPort}`,
                        result
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
                        tool: "dap_step_out",
                        thread_id: threadId,
                        error: error.message
                    }, null, 2),
                },
            ],
            isError: true,
        };
    }
}

export async function handleDAPPause(dapService: DAPService, args: any) {
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
                            tool: "dap_pause"
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }

        const resolvedHost = resolution.host;
        const resolvedPort = resolution.port;

        const result = await dapService.sendDAPRequest(resolvedHost, resolvedPort, 'pause', {
            threadId: threadId
        });

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: result.type === 'response' && result.success !== false,
                        tool: "dap_pause",
                        thread_id: threadId || "all",
                        message: "Program execution paused",
                        dap_server: `${resolvedHost}:${resolvedPort}`,
                        result
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
                        tool: "dap_pause",
                        thread_id: threadId || "all",
                        error: error.message
                    }, null, 2),
                },
            ],
            isError: true,
        };
    }
}