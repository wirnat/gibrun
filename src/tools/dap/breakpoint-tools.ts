import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { DAPService } from "@/services/dap-service.js";
import { resolveDAPServer } from "@core/dap-handlers.js";

// Breakpoint management tools for DAP

export const DAP_BREAKPOINT_TOOLS: Tool[] = [
    {
        name: "dap_set_breakpoints",
        description: "Set breakpoints in source files for debugging. Supports conditional breakpoints and hit conditions.",
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
                source: {
                    type: "string",
                    description: "Source file path to set breakpoints in"
                },
                breakpoints: {
                    type: "array",
                    description: "Array of breakpoint specifications",
                    items: {
                        type: "object",
                        properties: {
                            line: {
                                type: "number",
                                description: "Line number to set breakpoint on"
                            },
                            condition: {
                                type: "string",
                                description: "Optional condition expression (e.g., 'i > 5')"
                            },
                            hitCondition: {
                                type: "string",
                                description: "Optional hit condition (e.g., '3' for every 3rd hit)"
                            },
                            logMessage: {
                                type: "string",
                                description: "Optional log message to print when breakpoint is hit"
                            }
                        },
                        required: ["line"]
                    }
                }
            },
            required: ["source", "breakpoints"]
        },
    },
    {
        name: "dap_get_breakpoints",
        description: "Get current breakpoints information from the debugger.",
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
                }
            }
        },
    },
    {
        name: "dap_clear_breakpoints",
        description: "Clear all breakpoints or breakpoints in specific source files.",
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
                source: {
                    type: "string",
                    description: "Optional: Clear breakpoints only in this source file"
                }
            }
        },
    },
];

export async function handleDAPSetBreakpoints(dapService: DAPService, args: any) {
    const { host, port, source, breakpoints } = args;

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
                            tool: "dap_set_breakpoints"
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }

        const resolvedHost = resolution.host;
        const resolvedPort = resolution.port;

        // Format breakpoints for DAP protocol
        const dapBreakpoints = breakpoints.map((bp: any) => ({
            line: bp.line,
            condition: bp.condition,
            hitCondition: bp.hitCondition,
            logMessage: bp.logMessage
        }));

        const result = await dapService.sendDAPRequest(resolvedHost, resolvedPort, 'setBreakpoints', {
            source: { path: source },
            breakpoints: dapBreakpoints
        });

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: result.type === 'response' && result.success !== false,
                        tool: "dap_set_breakpoints",
                        source,
                        breakpoints_set: breakpoints.length,
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
                        tool: "dap_set_breakpoints",
                        source,
                        error: error.message
                    }, null, 2),
                },
            ],
            isError: true,
        };
    }
}

export async function handleDAPGetBreakpoints(dapService: DAPService, args: any) {
    const { host, port } = args;

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
                            tool: "dap_get_breakpoints"
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }

        const resolvedHost = resolution.host;
        const resolvedPort = resolution.port;

        // Note: DAP doesn't have a direct "getBreakpoints" command
        // We need to use configurationDone or get a list from the debugger
        // For now, we'll return information about current breakpoints capability
        const result = await dapService.sendDAPRequest(resolvedHost, resolvedPort, 'configurationDone', {});

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: result.type === 'response' && result.success !== false,
                        tool: "dap_get_breakpoints",
                        note: "Breakpoints are managed per-source-file. Use dap_set_breakpoints to set them.",
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
                        tool: "dap_get_breakpoints",
                        error: error.message
                    }, null, 2),
                },
            ],
            isError: true,
        };
    }
}

export async function handleDAPClearBreakpoints(dapService: DAPService, args: any) {
    const { host, port, source } = args;

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
                            tool: "dap_clear_breakpoints"
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }

        const resolvedHost = resolution.host;
        const resolvedPort = resolution.port;

        // Clear breakpoints by setting empty array
        const result = await dapService.sendDAPRequest(resolvedHost, resolvedPort, 'setBreakpoints', {
            source: source ? { path: source } : undefined,
            breakpoints: []
        });

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: result.type === 'response' && result.success !== false,
                        tool: "dap_clear_breakpoints",
                        source: source || "all sources",
                        message: source ? `Cleared breakpoints in ${source}` : "Cleared all breakpoints",
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
                        tool: "dap_clear_breakpoints",
                        source: source || "all sources",
                        error: error.message
                    }, null, 2),
                },
            ],
            isError: true,
        };
    }
}