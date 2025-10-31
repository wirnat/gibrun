#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { Pool } from "pg";
import axios, { AxiosRequestConfig, Method } from "axios";
import { exec } from "child_process";
import { promisify } from "util";
import { readFile, writeFile } from "fs/promises";
import * as net from "net";

const execAsync = promisify(exec);

// PostgreSQL connection pools - multiple databases can be configured
const dbPools = new Map<string, Pool>();

// Tool definitions
const TOOLS: Tool[] = [
    {
        name: "postgres_query",
        description:
            "Execute a PostgreSQL query. Useful for getting UIDs, checking data, or verifying API results in database. Returns query results as JSON.",
        inputSchema: {
            type: "object",
            properties: {
                connection_string: {
                    type: "string",
                    description:
                        "PostgreSQL connection string (e.g., postgresql://user:password@localhost:5432/dbname)",
                },
                query: {
                    type: "string",
                    description: "SQL query to execute",
                },
                params: {
                    type: "array",
                    items: { type: "string" },
                    description: "Optional query parameters for parameterized queries",
                },
            },
            required: ["connection_string", "query"],
        },
    },
    {
        name: "http_request",
        description:
            "Make HTTP request to test API endpoints (like curl). Supports GET, POST, PUT, PATCH, DELETE methods with headers and body.",
        inputSchema: {
            type: "object",
            properties: {
                url: {
                    type: "string",
                    description: "The URL to send request to",
                },
                method: {
                    type: "string",
                    enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
                    description: "HTTP method",
                    default: "GET",
                },
                headers: {
                    type: "object",
                    description: "HTTP headers as key-value pairs",
                },
                body: {
                    type: "object",
                    description: "Request body (will be sent as JSON)",
                },
                timeout: {
                    type: "number",
                    description: "Request timeout in milliseconds",
                    default: 30000,
                },
            },
            required: ["url"],
        },
    },
    {
        name: "build_go_project",
        description:
            "Build Go project. Executes 'go build' command in specified directory. Returns build output and status.",
        inputSchema: {
            type: "object",
            properties: {
                project_path: {
                    type: "string",
                    description: "Path to Go project directory",
                },
                build_flags: {
                    type: "string",
                    description: "Additional build flags (e.g., '-v -race')",
                },
                output_path: {
                    type: "string",
                    description: "Output binary path (optional)",
                },
            },
            required: ["project_path"],
        },
    },
    {
        name: "run_go_command",
        description:
            "Execute any Go command (go test, go run, go mod tidy, etc). Useful for running tests or other Go operations.",
        inputSchema: {
            type: "object",
            properties: {
                project_path: {
                    type: "string",
                    description: "Path to Go project directory",
                },
                command: {
                    type: "string",
                    description: "Go command to execute (e.g., 'test ./...', 'run main.go')",
                },
            },
            required: ["project_path", "command"],
        },
    },
    {
        name: "read_source_file",
        description:
            "Read source code file content. Useful for examining code before fixing.",
        inputSchema: {
            type: "object",
            properties: {
                file_path: {
                    type: "string",
                    description: "Path to the source file",
                },
            },
            required: ["file_path"],
        },
    },
    {
        name: "write_source_file",
        description:
            "Write or update source code file. Use this to fix code issues.",
        inputSchema: {
            type: "object",
            properties: {
                file_path: {
                    type: "string",
                    description: "Path to the source file",
                },
                content: {
                    type: "string",
                    description: "File content to write",
                },
            },
            required: ["file_path", "content"],
        },
    },
    {
        name: "execute_shell_command",
        description:
            "Execute arbitrary shell command. Useful for custom operations like cleanup, file operations, or running custom scripts.",
        inputSchema: {
            type: "object",
            properties: {
                command: {
                    type: "string",
                    description: "Shell command to execute",
                },
                working_dir: {
                    type: "string",
                    description: "Working directory for command execution",
                },
            },
            required: ["command"],
        },
    },
    {
        name: "dap_restart",
        description:
            "Restart debugging session via Debug Adapter Protocol (DAP). Useful for hot reloading after code fixes without manually restarting the debugger. Works with VSCode debugger and other DAP-compatible debuggers.",
        inputSchema: {
            type: "object",
            properties: {
                host: {
                    type: "string",
                    description: "DAP server host (e.g., 127.0.0.1)",
                    default: "127.0.0.1",
                },
                port: {
                    type: "number",
                    description: "DAP server port (shown in VSCode debug console as 'DAP server listening at: host:port')",
                },
                rebuild_first: {
                    type: "boolean",
                    description: "Whether to rebuild project before restarting debugger",
                    default: true,
                },
                project_path: {
                    type: "string",
                    description: "Path to project (required if rebuild_first is true)",
                },
            },
            required: ["port"],
        },
    },
    {
        name: "dap_send_command",
        description:
            "Send custom DAP command to debugger. Advanced usage for specific DAP operations like evaluate, setBreakpoints, etc.",
        inputSchema: {
            type: "object",
            properties: {
                host: {
                    type: "string",
                    description: "DAP server host",
                    default: "127.0.0.1",
                },
                port: {
                    type: "number",
                    description: "DAP server port",
                },
                command: {
                    type: "string",
                    description: "DAP command name (e.g., 'restart', 'disconnect', 'evaluate')",
                },
                arguments: {
                    type: "object",
                    description: "Command arguments as object",
                },
            },
            required: ["port", "command"],
        },
    },
];

// Get or create PostgreSQL pool
function getPool(connectionString: string): Pool {
    if (!dbPools.has(connectionString)) {
        const pool = new Pool({
            connectionString,
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000,
        });
        dbPools.set(connectionString, pool);
    }
    return dbPools.get(connectionString)!;
}

// Tool handlers
async function handlePostgresQuery(args: any) {
    const { connection_string, query, params = [] } = args;

    try {
        const pool = getPool(connection_string);
        const result = await pool.query(query, params);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(
                        {
                            success: true,
                            rowCount: result.rowCount,
                            rows: result.rows,
                            fields: result.fields.map((f) => ({
                                name: f.name,
                                dataTypeID: f.dataTypeID,
                            })),
                        },
                        null,
                        2
                    ),
                },
            ],
        };
    } catch (error: any) {
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(
                        {
                            success: false,
                            error: error.message,
                            code: error.code,
                        },
                        null,
                        2
                    ),
                },
            ],
            isError: true,
        };
    }
}

async function handleHttpRequest(args: any) {
    const {
        url,
        method = "GET",
        headers = {},
        body,
        timeout = 30000,
    } = args;

    try {
        const config: AxiosRequestConfig = {
            method: method as Method,
            url,
            headers,
            timeout,
        };

        if (body && ["POST", "PUT", "PATCH"].includes(method)) {
            config.data = body;
            if (!headers["Content-Type"]) {
                config.headers = {
                    ...headers,
                    "Content-Type": "application/json",
                };
            }
        }

        const startTime = Date.now();
        const response = await axios(config);
        const duration = Date.now() - startTime;

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(
                        {
                            success: true,
                            status: response.status,
                            statusText: response.statusText,
                            headers: response.headers,
                            data: response.data,
                            duration_ms: duration,
                        },
                        null,
                        2
                    ),
                },
            ],
        };
    } catch (error: any) {
        const duration = Date.now() - (error.config?.startTime || Date.now());

        if (error.response) {
            // Server responded with error status
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                success: false,
                                status: error.response.status,
                                statusText: error.response.statusText,
                                headers: error.response.headers,
                                data: error.response.data,
                                duration_ms: duration,
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        } else if (error.request) {
            // Request made but no response
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                success: false,
                                error: "No response received",
                                message: error.message,
                                duration_ms: duration,
                            },
                            null,
                            2
                        ),
                    },
                ],
                isError: true,
            };
        } else {
            // Request setup error
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                success: false,
                                error: error.message,
                            },
                            null,
                            2
                        ),
                    },
                ],
                isError: true,
            };
        }
    }
}

async function handleBuildGoProject(args: any) {
    const { project_path, build_flags = "", output_path = "" } = args;

    try {
        let command = "go build";
        if (build_flags) {
            command += ` ${build_flags}`;
        }
        if (output_path) {
            command += ` -o ${output_path}`;
        }

        const { stdout, stderr } = await execAsync(command, {
            cwd: project_path,
        });

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(
                        {
                            success: true,
                            stdout,
                            stderr,
                            message: "Build completed successfully",
                        },
                        null,
                        2
                    ),
                },
            ],
        };
    } catch (error: any) {
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(
                        {
                            success: false,
                            stdout: error.stdout || "",
                            stderr: error.stderr || "",
                            error: error.message,
                            message: "Build failed",
                        },
                        null,
                        2
                    ),
                },
            ],
            isError: true,
        };
    }
}

async function handleRunGoCommand(args: any) {
    const { project_path, command } = args;

    try {
        const { stdout, stderr } = await execAsync(`go ${command}`, {
            cwd: project_path,
        });

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(
                        {
                            success: true,
                            stdout,
                            stderr,
                            command: `go ${command}`,
                        },
                        null,
                        2
                    ),
                },
            ],
        };
    } catch (error: any) {
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(
                        {
                            success: false,
                            stdout: error.stdout || "",
                            stderr: error.stderr || "",
                            error: error.message,
                            command: `go ${command}`,
                        },
                        null,
                        2
                    ),
                },
            ],
            isError: true,
        };
    }
}

async function handleReadSourceFile(args: any) {
    const { file_path } = args;

    try {
        const content = await readFile(file_path, "utf-8");

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(
                        {
                            success: true,
                            file_path,
                            content,
                            size: content.length,
                        },
                        null,
                        2
                    ),
                },
            ],
        };
    } catch (error: any) {
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(
                        {
                            success: false,
                            file_path,
                            error: error.message,
                        },
                        null,
                        2
                    ),
                },
            ],
            isError: true,
        };
    }
}

async function handleWriteSourceFile(args: any) {
    const { file_path, content } = args;

    try {
        await writeFile(file_path, content, "utf-8");

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(
                        {
                            success: true,
                            file_path,
                            size: content.length,
                            message: "File written successfully",
                        },
                        null,
                        2
                    ),
                },
            ],
        };
    } catch (error: any) {
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(
                        {
                            success: false,
                            file_path,
                            error: error.message,
                        },
                        null,
                        2
                    ),
                },
            ],
            isError: true,
        };
    }
}

async function handleExecuteShellCommand(args: any) {
    const { command, working_dir } = args;

    try {
        const options: any = {};
        if (working_dir) {
            options.cwd = working_dir;
        }

        const { stdout, stderr } = await execAsync(command, options);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(
                        {
                            success: true,
                            command,
                            stdout,
                            stderr,
                        },
                        null,
                        2
                    ),
                },
            ],
        };
    } catch (error: any) {
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(
                        {
                            success: false,
                            command,
                            stdout: error.stdout || "",
                            stderr: error.stderr || "",
                            error: error.message,
                        },
                        null,
                        2
                    ),
                },
            ],
            isError: true,
        };
    }
}

// DAP Protocol helper - sends request and waits for response
let dapSequence = 1;

async function sendDAPRequest(
    host: string,
    port: number,
    command: string,
    args?: any
): Promise<any> {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        let buffer = "";
        let receivedResponses = 0;
        const expectedResponses = 1;

        const request = {
            seq: dapSequence++,
            type: "request",
            command: command,
            arguments: args || {},
        };

        const requestStr = JSON.stringify(request);
        const contentLength = Buffer.byteLength(requestStr, "utf8");
        const message = `Content-Length: ${contentLength}\r\n\r\n${requestStr}`;

        client.connect(port, host, () => {
            client.write(message);
        });

        client.on("data", (data) => {
            buffer += data.toString();

            // Parse all messages in buffer
            while (true) {
                const headerEndIndex = buffer.indexOf("\r\n\r\n");
                if (headerEndIndex === -1) break;

                const headerPart = buffer.substring(0, headerEndIndex);
                const contentLengthMatch = headerPart.match(/Content-Length: (\d+)/);

                if (!contentLengthMatch) break;

                const contentLength = parseInt(contentLengthMatch[1]);
                const messageStart = headerEndIndex + 4;
                const messageEnd = messageStart + contentLength;

                if (buffer.length < messageEnd) break;

                const messageBody = buffer.substring(messageStart, messageEnd);
                buffer = buffer.substring(messageEnd);

                try {
                    const message = JSON.parse(messageBody);

                    // Only resolve on response messages (not events)
                    if (message.type === "response") {
                        receivedResponses++;
                        if (receivedResponses >= expectedResponses) {
                            client.destroy();
                            resolve(message);
                            return;
                        }
                    }
                } catch (e) {
                    console.error("Failed to parse DAP message:", e);
                }
            }
        });

        client.on("error", (err) => {
            client.destroy();
            reject(err);
        });

        client.on("close", () => {
            if (receivedResponses === 0) {
                reject(new Error("Connection closed without receiving response"));
            }
        });

        client.setTimeout(10000, () => {
            client.destroy();
            reject(new Error("DAP request timeout - server may not support this command or needs initialization"));
        });
    });
}

// For Go debugger (Delve), restart is handled by disconnect + relaunch
// This is more reliable than trying to use the restart command
async function restartGoDebugger(
    host: string,
    port: number
): Promise<any> {
    try {
        // Try disconnect first (this will trigger VSCode to restart automatically if configured)
        await sendDAPRequest(host, port, "disconnect", {
            restart: true,
            terminateDebuggee: false,
        });

        return {
            success: true,
            message: "Debugger restart initiated (disconnect with restart=true)",
        };
    } catch (disconnectError: any) {
        // If disconnect fails, try restart command directly
        try {
            const response = await sendDAPRequest(host, port, "restart");
            return {
                success: true,
                message: "Debugger restarted via restart command",
                response,
            };
        } catch (restartError: any) {
            throw new Error(
                `Failed to restart debugger. Disconnect error: ${disconnectError.message}, Restart error: ${restartError.message}`
            );
        }
    }
}

async function handleDAPRestart(args: any) {
    const {
        host = "127.0.0.1",
        port,
        rebuild_first = true,
        project_path,
    } = args;

    try {
        let buildResult = null;

        // Rebuild first if requested
        if (rebuild_first) {
            if (!project_path) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(
                                {
                                    success: false,
                                    error: "project_path is required when rebuild_first is true",
                                },
                                null,
                                2
                            ),
                        },
                    ],
                    isError: true,
                };
            }

            console.error(`Building project at ${project_path}...`);
            const buildCommand = "go build";
            const { stdout, stderr } = await execAsync(buildCommand, {
                cwd: project_path,
            });
            buildResult = { stdout, stderr };
            console.error("Build completed successfully");
        }

        // Send restart request to DAP server using proper method for Go debugger
        console.error(`Restarting debugger at ${host}:${port}...`);
        const restartResult = await restartGoDebugger(host, port);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(
                        {
                            success: true,
                            message: restartResult.message,
                            dap_response: restartResult.response,
                            build_result: buildResult,
                            dap_server: `${host}:${port}`,
                            note: "Debugger will restart automatically. Wait a few seconds for the new session to initialize.",
                        },
                        null,
                        2
                    ),
                },
            ],
        };
    } catch (error: any) {
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(
                        {
                            success: false,
                            error: error.message,
                            dap_server: `${host}:${port}`,
                            troubleshooting: {
                                check_debugger: "Ensure VSCode debugger is running (green status bar)",
                                check_port: "Verify DAP port in Debug Console: 'DAP server listening at: HOST:PORT'",
                                check_config: "Ensure launch.json has proper Go debugger configuration",
                                alternative: "Try manually restarting debugger (Shift+F5 then F5) and note any errors",
                            },
                        },
                        null,
                        2
                    ),
                },
            ],
            isError: true,
        };
    }
}

async function handleDAPSendCommand(args: any) {
    const { host = "127.0.0.1", port, command, arguments: cmdArgs } = args;

    try {
        console.error(`Sending DAP command '${command}' to ${host}:${port}...`);
        const response = await sendDAPRequest(host, port, command, cmdArgs);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(
                        {
                            success: true,
                            command,
                            response,
                            dap_server: `${host}:${port}`,
                        },
                        null,
                        2
                    ),
                },
            ],
        };
    } catch (error: any) {
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(
                        {
                            success: false,
                            command,
                            error: error.message,
                            dap_server: `${host}:${port}`,
                        },
                        null,
                        2
                    ),
                },
            ],
            isError: true,
        };
    }
}

// Main server setup
async function main() {
    const server = new Server(
        {
            name: "gibrun-mcp-server",
            version: "1.0.0",
        },
        {
            capabilities: {
                tools: {},
            },
        }
    );

    // List available tools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return { tools: TOOLS };
    });

    // Handle tool calls
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;

        try {
            switch (name) {
                case "postgres_query":
                    return await handlePostgresQuery(args);
                case "http_request":
                    return await handleHttpRequest(args);
                case "build_go_project":
                    return await handleBuildGoProject(args);
                case "run_go_command":
                    return await handleRunGoCommand(args);
                case "read_source_file":
                    return await handleReadSourceFile(args);
                case "write_source_file":
                    return await handleWriteSourceFile(args);
                case "execute_shell_command":
                    return await handleExecuteShellCommand(args);
                case "dap_restart":
                    return await handleDAPRestart(args);
                case "dap_send_command":
                    return await handleDAPSendCommand(args);
                default:
                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify({
                                    success: false,
                                    error: `Unknown tool: ${name}`,
                                }),
                            },
                        ],
                        isError: true,
                    };
            }
        } catch (error: any) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: false,
                            error: error.message,
                            stack: error.stack,
                        }),
                    },
                ],
                isError: true,
            };
        }
    });

    // Cleanup on exit
    process.on("SIGINT", async () => {
        for (const pool of dbPools.values()) {
            await pool.end();
        }
        process.exit(0);
    });

    // Start server
    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error("gibRun MCP Server running on stdio");
}

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});

