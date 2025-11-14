import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { DAPService } from "@/services/dap-service.js";
import { resolveDAPServer } from "@core/dap-handlers.js";

// Variable inspection and evaluation tools for DAP

export const DAP_INSPECTION_TOOLS: Tool[] = [
    {
        name: "dap_evaluate",
        description: "Evaluate expressions in the current debug context and return their values.",
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
                expression: {
                    type: "string",
                    description: "Expression to evaluate (e.g., 'myVar', 'len(arr)', 'user.name')"
                },
                frameId: {
                    type: "number",
                    description: "Optional stack frame ID for evaluation context"
                },
                context: {
                    type: "string",
                    description: "Evaluation context: 'watch', 'repl', 'hover', or 'clipboard'",
                    enum: ["watch", "repl", "hover", "clipboard"],
                    default: "repl"
                }
            },
            required: ["expression"]
        },
    },
    {
        name: "dap_variables",
        description: "Get variables available in the current scope or from a specific variables reference.",
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
                variablesReference: {
                    type: "number",
                    description: "Variables reference ID (0 for current scope, or from previous variables call)"
                },
                filter: {
                    type: "string",
                    description: "Optional filter: 'indexed', 'named', or 'all'",
                    enum: ["indexed", "named", "all"]
                },
                start: {
                    type: "number",
                    description: "Optional start index for pagination",
                    minimum: 0
                },
                count: {
                    type: "number",
                    description: "Optional number of variables to return",
                    minimum: 1
                }
            }
        },
    },
    {
        name: "dap_stack_trace",
        description: "Get the current stack trace showing the call stack frames.",
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
                    description: "Thread ID to get stack trace for"
                },
                startFrame: {
                    type: "number",
                    description: "Optional start frame index",
                    minimum: 0,
                    default: 0
                },
                levels: {
                    type: "number",
                    description: "Optional number of frames to return",
                    minimum: 1,
                    default: 20
                }
            },
            required: ["threadId"]
        },
    },
];

export async function handleDAPEvaluate(dapService: DAPService, args: any) {
    const { host, port, expression, frameId, context = 'repl' } = args;

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
                            tool: "dap_evaluate",
                            expression
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }

        const resolvedHost = resolution.host;
        const resolvedPort = resolution.port;

        const result = await dapService.sendDAPRequest(resolvedHost, resolvedPort, 'evaluate', {
            expression: expression,
            frameId: frameId,
            context: context
        });

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: result.type === 'response' && result.success !== false,
                        tool: "dap_evaluate",
                        expression,
                        context,
                        frame_id: frameId,
                        result_value: result.body?.result,
                        result_type: result.body?.type,
                        dap_server: `${resolvedHost}:${resolvedPort}`,
                        full_result: result
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
                        tool: "dap_evaluate",
                        expression,
                        context,
                        frame_id: frameId,
                        error: error.message
                    }, null, 2),
                },
            ],
            isError: true,
        };
    }
}

export async function handleDAPVariables(dapService: DAPService, args: any) {
    const { host, port, variablesReference = 0, filter, start, count } = args;

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
                            tool: "dap_variables"
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }

        const resolvedHost = resolution.host;
        const resolvedPort = resolution.port;

        const requestArgs: any = {
            variablesReference: variablesReference
        };

        if (filter) requestArgs.filter = filter;
        if (start !== undefined) requestArgs.start = start;
        if (count !== undefined) requestArgs.count = count;

        const result = await dapService.sendDAPRequest(resolvedHost, resolvedPort, 'variables', requestArgs);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: result.type === 'response' && result.success !== false,
                        tool: "dap_variables",
                        variables_reference: variablesReference,
                        filter,
                        variables_count: result.body?.variables?.length || 0,
                        variables: result.body?.variables,
                        dap_server: `${resolvedHost}:${resolvedPort}`,
                        full_result: result
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
                        tool: "dap_variables",
                        variables_reference: variablesReference,
                        error: error.message
                    }, null, 2),
                },
            ],
            isError: true,
        };
    }
}

export async function handleDAPStackTrace(dapService: DAPService, args: any) {
    const { host, port, threadId, startFrame = 0, levels = 20 } = args;

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
                            tool: "dap_stack_trace",
                            thread_id: threadId
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }

        const resolvedHost = resolution.host;
        const resolvedPort = resolution.port;

        const result = await dapService.sendDAPRequest(resolvedHost, resolvedPort, 'stackTrace', {
            threadId: threadId,
            startFrame: startFrame,
            levels: levels
        });

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: result.type === 'response' && result.success !== false,
                        tool: "dap_stack_trace",
                        thread_id: threadId,
                        start_frame: startFrame,
                        levels_requested: levels,
                        total_frames: result.body?.totalFrames,
                        stack_frames: result.body?.stackFrames,
                        dap_server: `${resolvedHost}:${resolvedPort}`,
                        full_result: result
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
                        tool: "dap_stack_trace",
                        thread_id: threadId,
                        error: error.message
                    }, null, 2),
                },
            ],
            isError: true,
        };
    }
}