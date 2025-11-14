import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { DAPService } from "@/services/dap-service.js";
import { resolveDAPServer } from "@core/dap-handlers.js";
import { DAPWatchExpression, DAPWatchResult } from "@types/server.js";

// Watch expression tools for DAP

export const DAP_WATCH_TOOLS: Tool[] = [
    {
        name: "dap_set_watch",
        description: "Set watch expressions to monitor variable values during debugging. Expressions are evaluated in the current context.",
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
                expressions: {
                    type: "array",
                    description: "Watch expressions to set",
                    items: {
                        type: "string"
                    },
                    minItems: 1
                }
            },
            required: ["expressions"]
        },
    },
    {
        name: "dap_get_watches",
        description: "Get current values of all watch expressions. Shows the latest evaluated values and any errors.",
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
        name: "dap_clear_watches",
        description: "Clear all watch expressions. Stops monitoring variable values.",
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
];

// In-memory storage for watch expressions (in production, this could be persisted)
const watchExpressions = new Map<string, DAPWatchExpression[]>();
const watchResults = new Map<string, DAPWatchResult[]>();

function getServerKey(host: string, port: number): string {
    return `${host}:${port}`;
}

export async function handleDAPSetWatch(dapService: DAPService, args: any) {
    const { host, port, expressions } = args;

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
                            tool: "dap_set_watch"
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }

        const resolvedHost = resolution.host;
        const resolvedPort = resolution.port;
        const serverKey = getServerKey(resolvedHost, resolvedPort);

        // Create watch expressions
        const watches: DAPWatchExpression[] = expressions.map((expr: string, index: number) => ({
            expression: expr,
            name: `watch_${index + 1}`,
            id: `${serverKey}_watch_${Date.now()}_${index}`
        }));

        // Store watches
        watchExpressions.set(serverKey, watches);
        watchResults.set(serverKey, []);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        tool: "dap_set_watch",
                        expressions_set: expressions.length,
                        watches: watches.map(w => ({
                            id: w.id,
                            name: w.name,
                            expression: w.expression
                        })),
                        dap_server: `${resolvedHost}:${resolvedPort}`,
                        note: "Watch expressions are now active. Use dap_get_watches to see current values."
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
                        tool: "dap_set_watch",
                        expressions,
                        error: error.message
                    }, null, 2),
                },
            ],
            isError: true,
        };
    }
}

export async function handleDAPGetWatches(dapService: DAPService, args: any) {
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
                            tool: "dap_get_watches"
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }

        const resolvedHost = resolution.host;
        const resolvedPort = resolution.port;
        const serverKey = getServerKey(resolvedHost, resolvedPort);

        const watches = watchExpressions.get(serverKey) || [];
        const results = watchResults.get(serverKey) || [];

        // Evaluate current values for active watches
        const currentResults: DAPWatchResult[] = [];
        for (const watch of watches) {
            try {
                const evalResult = await dapService.sendDAPRequest(resolvedHost, resolvedPort, 'evaluate', {
                    expression: watch.expression,
                    context: 'watch'
                });

                currentResults.push({
                    expression: watch.expression,
                    value: evalResult.body?.result,
                    type: evalResult.body?.type,
                    lastUpdated: new Date()
                });
            } catch (evalError: any) {
                currentResults.push({
                    expression: watch.expression,
                    error: evalError.message,
                    lastUpdated: new Date()
                });
            }
        }

        // Update stored results
        watchResults.set(serverKey, currentResults);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        tool: "dap_get_watches",
                        watches_active: watches.length,
                        watch_results: currentResults,
                        dap_server: `${resolvedHost}:${resolvedPort}`,
                        summary: {
                            successful_evaluations: currentResults.filter(r => !r.error).length,
                            failed_evaluations: currentResults.filter(r => r.error).length
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
                        tool: "dap_get_watches",
                        error: error.message
                    }, null, 2),
                },
            ],
            isError: true,
        };
    }
}

export async function handleDAPClearWatches(dapService: DAPService, args: any) {
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
                            tool: "dap_clear_watches"
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }

        const resolvedHost = resolution.host;
        const resolvedPort = resolution.port;
        const serverKey = getServerKey(resolvedHost, resolvedPort);

        const watchesCleared = (watchExpressions.get(serverKey) || []).length;

        // Clear watches
        watchExpressions.delete(serverKey);
        watchResults.delete(serverKey);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        tool: "dap_clear_watches",
                        watches_cleared: watchesCleared,
                        dap_server: `${resolvedHost}:${resolvedPort}`,
                        message: `${watchesCleared} watch expressions cleared`
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
                        tool: "dap_clear_watches",
                        error: error.message
                    }, null, 2),
                },
            ],
            isError: true,
        };
    }
}