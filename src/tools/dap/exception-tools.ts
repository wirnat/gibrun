import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { DAPService } from "@/services/dap-service.js";
import { resolveDAPServer } from "@core/dap-handlers.js";
import { DAPExceptionBreakpointsArgs } from "@types/server.js";

// Exception breakpoint tools for DAP

export const DAP_EXCEPTION_TOOLS: Tool[] = [
    {
        name: "dap_set_exception_breakpoints",
        description: "Set exception breakpoints to pause execution when specific exceptions occur. Useful for debugging error handling and exception flows.",
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
                filters: {
                    type: "array",
                    description: "Exception filters to apply",
                    items: {
                        type: "string",
                        enum: ["uncaught", "runtime", "custom", "all"]
                    },
                    default: ["uncaught"]
                },
                exception_options: {
                    type: "array",
                    description: "Detailed exception breakpoint options",
                    items: {
                        type: "object",
                        properties: {
                            path: {
                                type: "array",
                                description: "Exception type path (e.g., ['runtime', 'TypeError'])",
                                items: {
                                    type: "string"
                                }
                            },
                            break_mode: {
                                type: "string",
                                description: "When to break on this exception",
                                enum: ["never", "always", "unhandled", "userUnhandled"],
                                default: "unhandled"
                            }
                        },
                        required: ["path", "break_mode"]
                    }
                }
            }
        },
    },
];

export async function handleDAPSetExceptionBreakpoints(dapService: DAPService, args: any) {
    const { host, port, filters = ["uncaught"], exception_options = [] } = args;

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
                            tool: "dap_set_exception_breakpoints"
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }

        const resolvedHost = resolution.host;
        const resolvedPort = resolution.port;

        // Prepare exception breakpoint arguments
        const exceptionBreakpointsArgs: any = {
            filters: filters
        };

        if (exception_options.length > 0) {
            exceptionBreakpointsArgs.exceptionOptions = exception_options.map((option: any) => ({
                path: option.path,
                breakMode: option.break_mode
            }));
        }

        const result = await dapService.sendDAPRequest(resolvedHost, resolvedPort, 'setExceptionBreakpoints', exceptionBreakpointsArgs);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: result.type === 'response' && result.success !== false,
                        tool: "dap_set_exception_breakpoints",
                        filters_applied: filters,
                        exception_options_set: exception_options.length,
                        exception_options: exception_options,
                        dap_server: `${resolvedHost}:${resolvedPort}`,
                        result,
                        note: "Exception breakpoints are now active. Program will pause when matching exceptions occur."
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
                        tool: "dap_set_exception_breakpoints",
                        filters,
                        exception_options,
                        error: error.message
                    }, null, 2),
                },
            ],
            isError: true,
        };
    }
}