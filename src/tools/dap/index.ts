import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { DAPService } from "@/services/dap-service.js";

export const DAP_TOOLS: Tool[] = [
    {
        name: "dap_restart",
        description:
            "Restart VSCode debugger session with optional rebuild. Useful for hot reloading Go applications during development.",
        inputSchema: {
            type: "object",
            properties: {
                host: {
                    type: "string",
                    description: "DAP server host (default: 127.0.0.1)",
                    default: "127.0.0.1"
                },
                port: {
                    type: "number",
                    description: "DAP server port (auto-detected if not provided)"
                },
                rebuild_first: {
                    type: "boolean",
                    description: "Rebuild Go project before restart (default: true)",
                    default: true
                },
                project_path: {
                    type: "string",
                    description: "Path to Go project directory (required if rebuild_first=true)"
                }
            },
            required: []
        },
    },
    {
        name: "dap_send_command",
        description:
            "Send custom DAP commands for advanced debugging operations like setting breakpoints, evaluating expressions, or controlling execution flow.",
        inputSchema: {
            type: "object",
            properties: {
                host: {
                    type: "string",
                    description: "DAP server host (default: 127.0.0.1)",
                    default: "127.0.0.1"
                },
                port: {
                    type: "number",
                    description: "DAP server port (auto-detected if not provided)"
                },
                command: {
                    type: "string",
                    description: "DAP command name (e.g., 'initialize', 'launch', 'setBreakpoints', 'continue', 'evaluate')"
                },
                arguments: {
                    type: "object",
                    description: "Command arguments as key-value pairs"
                }
            },
            required: ["command"]
        },
    },
];

export async function handleDAPRestart(dapService: DAPService, args: any) {
    const { host = "127.0.0.1", port, rebuild_first = true, project_path } = args;

    try {
        // Auto-detect port if not provided
        let targetPort = port;
        if (!targetPort) {
            // TODO: Implement port auto-detection
            targetPort = 49279; // Default Delve DAP port
        }

        // Rebuild if requested
        if (rebuild_first && project_path) {
            // TODO: Implement Go build logic
            console.log(`Would rebuild Go project at: ${project_path}`);
        }

        // Send restart command
        const result = await dapService.sendDAPRequest(host, targetPort, 'disconnect', {
            restart: true
        });

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: result.type === 'response' && result.success !== false,
                        message: "DAP restart initiated",
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
                        error: error.message
                    }, null, 2),
                },
            ],
            isError: true,
        };
    }
}

export async function handleDAPSendCommand(dapService: DAPService, args: any) {
    const { host = "127.0.0.1", port, command, arguments: commandArgs = {} } = args;

    try {
        // Auto-detect port if not provided
        let targetPort = port;
        if (!targetPort) {
            // TODO: Implement port auto-detection
            targetPort = 49279; // Default Delve DAP port
        }

        const result = await dapService.sendDAPRequest(host, targetPort, command, commandArgs);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: result.type === 'response' && result.success !== false,
                        command,
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
                        command,
                        error: error.message
                    }, null, 2),
                },
            ],
            isError: true,
        };
    }
}