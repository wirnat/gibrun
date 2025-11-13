#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { Pool } from "pg";
import axios, { Method, RawAxiosRequestConfig } from "axios";
import { exec } from "child_process";
import { promisify } from "util";
import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import * as net from "net";
import * as path from "path";

import { GoDebuggerProxy } from "@/services/dap-service.js";
import { logError, logInfo } from "@/services/logger-service.js";
import { DatabaseService } from "@/services/database-service.js";
import { HttpService } from "@/services/http-service.js";
import { FILE_SYSTEM_TOOLS, handleMultiFileReader, handleMultiFileEditor, handleProjectFileManager, handleFileTemplateManager } from "@/tools/file-system/index.js";
import { ProjectAnalyzerTool } from "@/tools/project-analyzer/index.js";

const execAsync = promisify(exec);
const goDebuggerProxy = new GoDebuggerProxy(process.cwd());

// Service instances
const databaseService = new DatabaseService();
const httpService = new HttpService();
const projectAnalyzerTool = new ProjectAnalyzerTool();

// PostgreSQL connection pools - LEGACY: will be removed after migration
const dbPools = new Map<string, Pool>();

// Tool definitions
const LOCAL_TOOLS: Tool[] = [
    ...FILE_SYSTEM_TOOLS,
    ...projectAnalyzerTool.getTools(),
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
                        "PostgreSQL connection string (e.g., postgresql://user:password@localhost:5432/dbname). When omitted, the server will build one from POSTGRES_* environment variables or POSTGRES_CONNECTION_STRING.",
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
            required: ["query"],
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
                    description:
                        "DAP server host (e.g., 127.0.0.1). When omitted, the server will auto-detect dlv dap listeners via `lsof -i -P -n`.",
                    default: "127.0.0.1",
                },
                port: {
                    type: "number",
                    description:
                        "DAP server port (shown in VSCode debug console as 'DAP server listening at: host:port'). Leave empty to auto-detect dlv dap listeners.",
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
            required: [],
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
                    description:
                        "DAP server host. When omitted, the server will auto-detect dlv dap listeners via `lsof -i -P -n`.",
                    default: "127.0.0.1",
                },
                port: {
                    type: "number",
                    description:
                        "DAP server port. Leave empty to auto-detect dlv dap listeners via `lsof -i -P -n`.",
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
            required: ["command"],
        },
    },
];

type ToolHandler = (args: any) => Promise<any>;

const LOCAL_TOOL_HANDLERS: Record<string, ToolHandler> = {
    postgres_query: handlePostgresQuery,
    http_request: handleHttpRequest,
    build_go_project: handleBuildGoProject,
    run_go_command: handleRunGoCommand,
    read_source_file: handleReadSourceFile,
    write_source_file: handleWriteSourceFile,
    execute_shell_command: handleExecuteShellCommand,
    multi_file_reader: handleMultiFileReader,
    multi_file_editor: handleMultiFileEditor,
    project_file_manager: handleProjectFileManager,
    file_template_manager: handleFileTemplateManager,
    dap_restart: handleDAPRestart,
    dap_send_command: handleDAPSendCommand,
    "project_analyzer/architecture": (args: any) => projectAnalyzerTool.executeTool("project_analyzer/architecture", args),
    "project_analyzer/quality": (args: any) => projectAnalyzerTool.executeTool("project_analyzer/quality", args),
    "project_analyzer/dependencies": (args: any) => projectAnalyzerTool.executeTool("project_analyzer/dependencies", args),
    "project_analyzer/metrics": (args: any) => projectAnalyzerTool.executeTool("project_analyzer/metrics", args),
    "project_analyzer/health": (args: any) => projectAnalyzerTool.executeTool("project_analyzer/health", args),
    "project_analyzer/insights": (args: any) => projectAnalyzerTool.executeTool("project_analyzer/insights", args),
};

function mergeToolLists(primary: Tool[], secondary: Tool[]): Tool[] {
    const merged = new Map<string, Tool>();
    for (const tool of primary) {
        merged.set(tool.name, tool);
    }
    for (const tool of secondary) {
        if (!merged.has(tool.name)) {
            merged.set(tool.name, tool);
        }
    }
    return Array.from(merged.values());
}

function createErrorResult(message: string, meta?: Record<string, unknown>) {
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify(
                    {
                        success: false,
                        error: message,
                        ...(meta ?? {}),
                    },
                    null,
                    2
                ),
            },
        ],
        isError: true,
    };
}

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

function resolveConnectionString(connectionString?: string): string {
    if (connectionString && connectionString.trim().length > 0) {
        return connectionString.trim();
    }

    const envConnectionString = process.env.POSTGRES_CONNECTION_STRING;
    if (envConnectionString && envConnectionString.trim().length > 0) {
        return envConnectionString.trim();
    }

    const user = process.env.POSTGRES_USER;
    const password = process.env.POSTGRES_PASSWORD;
    const host = process.env.POSTGRES_HOST || "localhost";
    const port = process.env.POSTGRES_PORT || "5432";
    const database = process.env.POSTGRES_DB;

    if (user && password && database) {
        const encodedUser = encodeURIComponent(user);
        const encodedPassword = encodeURIComponent(password);
        return `postgresql://${encodedUser}:${encodedPassword}@${host}:${port}/${database}`;
    }

    throw new Error(
        "PostgreSQL connection details missing. Provide connection_string or set POSTGRES_CONNECTION_STRING or POSTGRES_* env vars."
    );
}

function buildGoProjectHints(
    projectPath: string | undefined,
    stderr?: string
): string[] | undefined {
    if (!projectPath || !stderr) {
        return undefined;
    }

    const normalized = stderr.toLowerCase();
    const hints: string[] = [];

    if (normalized.includes("no go files in")) {
        hints.push(
            `go build tidak menemukan file Go di "${projectPath}". Isi 'project_path' dengan folder yang berisi file Go (contoh: direktori dengan main.go).`
        );
        const cmdDir = path.join(projectPath, "cmd");
        if (existsSync(cmdDir)) {
            hints.push(
                `Folder "cmd" terdeteksi. Jika aplikasimu berada di dalamnya, arahkan 'project_path' ke subfolder yang sesuai, misalnya: ${path.join(
                    cmdDir,
                    "<service>"
                )}.`
            );
        }
        hints.push(
            "Alternatif: jalankan `go build ./cmd/<nama-service>` secara manual untuk memastikan path yang dipakai sudah benar."
        );
    }

    return hints.length > 0 ? hints : undefined;
}

// Tool handlers
async function handlePostgresQuery(args: any) {
    const { connection_string, query, params = [] } = args;

    const result = await databaseService.executeQuery(connection_string, query, params);

    return {
        content: [
            {
                type: "text",
                text: JSON.stringify(result, null, 2),
            },
        ],
        isError: !result.success,
    };
}

async function handleHttpRequest(args: any) {
    const {
        url,
        method = "GET",
        headers = {},
        body,
        timeout = 30000,
    } = args;

    const result = await httpService.makeRequest(url, method, headers, body, timeout);

    return {
        content: [
            {
                type: "text",
                text: JSON.stringify(result, null, 2),
            },
        ],
        isError: !result.success,
    };
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
        logError("build_go_project failed", error, {
            tool: "build_go_project",
            project_path,
        });
        const hints = buildGoProjectHints(
            project_path,
            error.stderr || error.stdout || error.message
        );
        const payload: Record<string, unknown> = {
            success: false,
            stdout: error.stdout || "",
            stderr: error.stderr || "",
            error: error.message,
            message: "Build failed",
            project_path,
        };
        if (hints) {
            payload.hints = hints;
        }
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(payload, null, 2),
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
        logError("run_go_command failed", error, {
            tool: "run_go_command",
            command: `go ${command}`,
            project_path,
        });
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
        logError("read_source_file failed", error, {
            tool: "read_source_file",
            file_path,
        });
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
        logError("write_source_file failed", error, {
            tool: "write_source_file",
            file_path,
        });
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
        logError("execute_shell_command failed", error, {
            tool: "execute_shell_command",
            command,
            working_dir,
        });
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

interface DetectedDAPServer {
    pid: number;
    host: string;
    port: number;
    commandLine: string;
    rawLine: string;
}

type DAPResolutionResult =
    | {
          success: true;
          host: string;
          port: number;
          source: "provided" | "auto-detected";
      }
    | {
          success: false;
          reason: "not_found";
          message: string;
      }
    | {
          success: false;
          reason: "multiple";
          message: string;
          options: DetectedDAPServer[];
      };

async function detectDAPServers(): Promise<DetectedDAPServer[]> {
    const results: DetectedDAPServer[] = [];
    const seen = new Set<string>();
    const scanCommand =
        'bash -lc "lsof -i -P -n | grep \\"dlv.*LISTEN\\" || true"';

    try {
        const { stdout } = await execAsync(scanCommand, { maxBuffer: 1024 * 1024 });
        const lines = stdout
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0);

        for (const line of lines) {
            if (!line.includes("(LISTEN)")) {
                continue;
            }

            const tokens = line.split(/\s+/);
            if (tokens.length < 10) {
                continue;
            }

            const pid = parseInt(tokens[1], 10);
            if (Number.isNaN(pid)) {
                continue;
            }

            const endpointToken = tokens[tokens.length - 2];
            const colonIndex = endpointToken.lastIndexOf(":");
            if (colonIndex === -1) {
                continue;
            }

            let host = endpointToken.substring(0, colonIndex).replace(/^\[|\]$/g, "");
            const portStr = endpointToken.substring(colonIndex + 1);
            const port = parseInt(portStr, 10);
            if (Number.isNaN(port)) {
                continue;
            }

            if (!host || host === "*" || host === "0.0.0.0") {
                host = "127.0.0.1";
            }

            try {
                const { stdout: psStdout } = await execAsync(
                    `ps -p ${pid} -o command=`
                );
                const commandLine = psStdout.trim();
                if (!commandLine.toLowerCase().includes("dlv dap")) {
                    continue;
                }

                const key = `${pid}-${host}-${port}`;
                if (seen.has(key)) {
                    continue;
                }
                seen.add(key);

                results.push({
                    pid,
                    host,
                    port,
                    commandLine,
                    rawLine: line,
                });
            } catch {
                // Process may have exited; skip it
                continue;
            }
        }
    } catch (error: any) {
        logError("Failed to auto-detect DAP ports", error, {
            tool: "dap_detection",
        });
    }

    return results;
}

async function resolveDAPServer(
    host?: string,
    port?: number
): Promise<DAPResolutionResult> {
    if (port) {
        return {
            success: true,
            host: host || "127.0.0.1",
            port,
            source: "provided",
        };
    }

    const servers = await detectDAPServers();
    if (servers.length === 0) {
        return {
            success: false,
            reason: "not_found",
            message:
                "Tidak ditemukan proses `dlv dap` yang LISTEN. Pastikan debugger Go di VSCode sedang berjalan lalu coba lagi atau isi parameter `port` secara manual.",
        };
    }

    if (servers.length === 1) {
        const server = servers[0];
        return {
            success: true,
            host: server.host,
            port: server.port,
            source: "auto-detected",
        };
    }

    return {
        success: false,
        reason: "multiple",
        message:
            "Ditemukan lebih dari satu proses `dlv dap` yang LISTEN. Tolong pilih salah satu DAP server dengan mengisi parameter `port` (dan opsional `host`).",
        options: servers,
    };
}

function createDAPResolutionErrorResponse(
    result: Exclude<DAPResolutionResult, { success: true }>,
    toolName: string
) {
    const meta: Record<string, unknown> = {
        tool: toolName,
        reason: result.reason,
    };

    if ("options" in result && result.options) {
        meta.detected_count = result.options.length;
    }

    logError("Failed to resolve DAP server", undefined, meta);

    const basePayload: any = {
        success: false,
        tool: toolName,
        error: result.message,
    };

    if (result.reason === "multiple" && result.options) {
        basePayload.detected_servers = result.options.map((option, index) => ({
            option: index + 1,
            host: option.host,
            port: option.port,
            pid: option.pid,
            command: option.commandLine,
        }));
        basePayload.hint =
            "Jalankan ulang perintah dengan `port` yang diinginkan atau hentikan sesi dlv lain yang tidak digunakan.";
        basePayload.detector_command =
            'lsof -i -P -n | grep "dlv.*LISTEN" | while read line; do pid=$(echo "$line" | awk \'{print $2}\'); if ps -p $pid -o command= 2>/dev/null | grep -q "dlv dap"; then echo "$line" | awk \'{print "Port:", $9, "PID:", $2}\'; fi; done';
    } else {
        basePayload.hint =
            "Pastikan VSCode debugger (dlv dap) sedang berjalan. Setelah Debug Console menampilkan 'DAP server listening at: HOST:PORT', jalankan ulang perintah ini.";
    }

    return {
        content: [
            {
                type: "text",
                text: JSON.stringify(basePayload, null, 2),
            },
        ],
        isError: true,
    };
}

interface SendDAPRequestOptions {
    initializeSession?: boolean;
    initializeArgs?: Record<string, unknown>;
    timeoutMs?: number;
    sendConfigurationDone?: boolean;
    configurationDoneArgs?: Record<string, unknown>;
    waitForInitializedEvent?: boolean;
    configurationDoneTimeoutMs?: number;
}

const DEFAULT_DAP_INITIALIZE_ARGS: Record<string, unknown> = {
    clientID: "gibrun-mcp",
    clientName: "gibRun MCP",
    adapterID: "delve",
    linesStartAt1: true,
    columnsStartAt1: true,
    pathFormat: "path",
    supportsRunInTerminalRequest: false,
    supportsProgressReporting: false,
    supportsInvalidatedEvent: false,
};
const DEFAULT_CONFIGURATION_DONE_TIMEOUT_MS = 750;

async function sendDAPRequest(
    host: string,
    port: number,
    command: string,
    args?: any,
    options?: SendDAPRequestOptions
): Promise<any> {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        let buffer = "";
        const shouldInitialize = options?.initializeSession !== false;
        const shouldSendConfigurationDone =
            shouldInitialize && options?.sendConfigurationDone !== false;
        const waitForInitializedEvent =
            options?.waitForInitializedEvent ?? true;
        const configurationDoneTimeoutMs =
            options?.configurationDoneTimeoutMs ??
            DEFAULT_CONFIGURATION_DONE_TIMEOUT_MS;
        let awaitingInitializeResponse = shouldInitialize;
        let awaitingInitializedEvent =
            shouldSendConfigurationDone && waitForInitializedEvent;
        let configurationDoneSent = !shouldSendConfigurationDone;
        let commandSent = false;
        let resolved = false;
        let configurationDoneTimer: NodeJS.Timeout | null = null;

        const timeoutMs = options?.timeoutMs ?? 10000;
        const initializeArgs = {
            ...DEFAULT_DAP_INITIALIZE_ARGS,
            ...(options?.initializeArgs || {}),
        };

        const clearConfigurationDoneTimer = () => {
            if (configurationDoneTimer) {
                clearTimeout(configurationDoneTimer);
                configurationDoneTimer = null;
            }
        };

        const cleanup = () => {
            clearConfigurationDoneTimer();
            if (!client.destroyed) {
                client.destroy();
            }
        };

        const sendDAPMessage = (dapCommand: string, dapArgs?: any) => {
            const request = {
                seq: dapSequence++,
                type: "request",
                command: dapCommand,
                arguments: dapArgs || {},
            };

            const requestStr = JSON.stringify(request);
            const contentLength = Buffer.byteLength(requestStr, "utf8");
            const message = `Content-Length: ${contentLength}\r\n\r\n${requestStr}`;
            client.write(message);
        };

        const sendPrimaryCommand = () => {
            if (commandSent) {
                return;
            }
            if (awaitingInitializeResponse || !configurationDoneSent) {
                return;
            }
            commandSent = true;
            sendDAPMessage(command, args);
        };

        const sendConfigurationDone = () => {
            if (configurationDoneSent) {
                return;
            }
            configurationDoneSent = true;
            awaitingInitializedEvent = false;
            clearConfigurationDoneTimer();
            sendDAPMessage(
                "configurationDone",
                options?.configurationDoneArgs || {}
            );
            sendPrimaryCommand();
        };

        const scheduleConfigurationDoneFallback = () => {
            if (!awaitingInitializedEvent || configurationDoneTimer) {
                return;
            }
            configurationDoneTimer = setTimeout(() => {
                configurationDoneTimer = null;
                sendConfigurationDone();
            }, configurationDoneTimeoutMs);
        };

        client.connect(port, host, () => {
            if (awaitingInitializeResponse) {
                sendDAPMessage("initialize", initializeArgs);
            } else {
                sendPrimaryCommand();
            }
        });

        client.on("data", (data) => {
            buffer += data.toString();

            // Parse all messages in buffer
            while (true) {
                const headerEndIndex = buffer.indexOf("\r\n\r\n");
                if (headerEndIndex === -1) break;

                const headerPart = buffer.substring(0, headerEndIndex);
                const contentLengthMatch = headerPart.match(/Content-Length:\s*(\d+)/i);

                if (!contentLengthMatch) break;

                const contentLength = parseInt(contentLengthMatch[1]);
                const messageStart = headerEndIndex + 4;
                const messageEnd = messageStart + contentLength;

                if (buffer.length < messageEnd) break;

                const messageBody = buffer.substring(messageStart, messageEnd);
                buffer = buffer.substring(messageEnd);

                try {
                    const message = JSON.parse(messageBody);

                    if (message.type === "event") {
                        if (
                            message.event === "initialized" &&
                            awaitingInitializedEvent
                        ) {
                            sendConfigurationDone();
                        }
                        continue;
                    }

                    if (message.type === "response") {
                        if (awaitingInitializeResponse && message.command === "initialize") {
                            awaitingInitializeResponse = false;
                            if (!message.success) {
                                cleanup();
                                reject(
                                    new Error(
                                        `DAP initialize failed: ${message.message || "Unknown error"}`
                                    )
                                );
                                return;
                            }
                            if (configurationDoneSent) {
                                sendPrimaryCommand();
                            } else if (!awaitingInitializedEvent) {
                                sendConfigurationDone();
                            } else {
                                scheduleConfigurationDoneFallback();
                            }
                            continue;
                        }

                        if (message.command === "configurationDone") {
                            continue;
                        }

                        if (message.command === command) {
                            resolved = true;
                            cleanup();
                            resolve(message);
                            return;
                        }
                    }
                } catch (e) {
                    logError("Failed to parse DAP message", e, {
                        tool: "dap_transport",
                        command,
                    });
                }
            }
        });

        client.on("error", (err) => {
            cleanup();
            reject(err);
        });

        client.on("close", () => {
            clearConfigurationDoneTimer();
            if (!resolved) {
                reject(new Error("Connection closed without receiving response"));
            }
        });

        client.setTimeout(timeoutMs, () => {
            cleanup();
            if (awaitingInitializeResponse) {
                reject(
                    new Error(
                        "DAP initialize timeout - debugger tidak merespons. Pastikan sesi VSCode masih berjalan."
                    )
                );
                return;
            }

            if (awaitingInitializedEvent) {
                reject(
                    new Error(
                        "Debugger tidak pernah mengirim event 'initialized'. Jalankan ulang sesi VSCode lalu coba lagi."
                    )
                );
                return;
            }

            if (!commandSent) {
                reject(
                    new Error(
                        "Gagal mengirim perintah DAP karena sesi belum siap. Tunggu hingga debugger selesai inisialisasi."
                    )
                );
                return;
            }

            reject(
                new Error(
                    "DAP request timeout - server may not support this command or needs initialization"
                )
            );
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
    const { host, port, rebuild_first = true, project_path } = args;

    const resolution = await resolveDAPServer(host, port);
    if (!resolution.success) {
        return createDAPResolutionErrorResponse(resolution, "dap_restart");
    }

    const resolvedHost = resolution.host;
    const resolvedPort = resolution.port;

    let failureStage: "build" | "dap" = "dap";

    try {
        let buildResult = null;

        // Rebuild first if requested
        if (rebuild_first) {
            if (!project_path) {
                logError(
                    "dap_restart missing project_path while rebuild_first is true",
                    undefined,
                    { tool: "dap_restart" }
                );
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

            logInfo("Building project before DAP restart", {
                tool: "dap_restart",
                project_path,
            });
            failureStage = "build";
            const buildCommand = "go build";
            const { stdout, stderr } = await execAsync(buildCommand, {
                cwd: project_path,
            });
            buildResult = { stdout, stderr };
            logInfo("Go project build completed", {
                tool: "dap_restart",
                project_path,
            });
            failureStage = "dap";
        }

        // Send restart request to DAP server using proper method for Go debugger
        logInfo("Restarting DAP debugger", {
            tool: "dap_restart",
            host: resolvedHost,
            port: resolvedPort,
            source: resolution.source,
        });
        const restartResult = await restartGoDebugger(
            resolvedHost,
            resolvedPort
        );

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
                            dap_server: `${resolvedHost}:${resolvedPort}`,
                            dap_source: resolution.source,
                            note: "Debugger will restart automatically. Wait a few seconds for the new session to initialize.",
                        },
                        null,
                        2
                    ),
                },
            ],
        };
    } catch (error: any) {
        logError("dap_restart failed", error, {
            tool: "dap_restart",
            host: resolvedHost,
            port: resolvedPort,
            stage: failureStage,
        });
        const payload: Record<string, unknown> = {
            success: false,
            error: error.message,
            dap_server: `${resolvedHost}:${resolvedPort}`,
            dap_source: resolution.source,
            stage: failureStage,
        };

        if (failureStage === "build") {
            payload.build_stdout = error.stdout || "";
            payload.build_stderr = error.stderr || "";
            if (project_path) {
                const hints = buildGoProjectHints(
                    project_path,
                    error.stderr || error.stdout || error.message
                );
                if (hints) {
                    payload.hints = hints;
                }
            }
        } else {
            payload.troubleshooting = {
                check_debugger:
                    "Pastikan VSCode debugger sedang aktif (status bar hijau) dan Debug Console masih menampilkan 'DAP server listening at: HOST:PORT'.",
                check_port:
                    "Verifikasi port terbaru di Debug Console. Port bisa berubah setiap kali VSCode restart.",
                check_initialized:
                    "Jika Debug Console tidak lagi menampilkan pesan listening, hentikan (Shift+F5) lalu jalankan lagi (F5) sebelum memanggil dap_restart.",
                check_config:
                    "Pastikan launch.json memakai konfigurasi Go debugger yang valid dan mode debug (type: \"go\", request: \"launch\").",
                alternative:
                    "Bila masih timeout, restart debugger secara manual (Shift+F5 lalu F5) kemudian jalankan ulang perintah ini.",
            };
        }

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(payload, null, 2),
                },
            ],
            isError: true,
        };
    }
}

async function handleDAPSendCommand(args: any) {
    const { host, port, command, arguments: cmdArgs } = args;

    const resolution = await resolveDAPServer(host, port);
    if (!resolution.success) {
        return createDAPResolutionErrorResponse(
            resolution,
            "dap_send_command"
        );
    }

    const resolvedHost = resolution.host;
    const resolvedPort = resolution.port;

    try {
        logInfo("Sending DAP command", {
            tool: "dap_send_command",
            command,
            host: resolvedHost,
            port: resolvedPort,
            source: resolution.source,
        });
        const response = await sendDAPRequest(
            resolvedHost,
            resolvedPort,
            command,
            cmdArgs
        );

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(
                        {
                            success: true,
                            command,
                            response,
                            dap_server: `${resolvedHost}:${resolvedPort}`,
                            dap_source: resolution.source,
                        },
                        null,
                        2
                    ),
                },
            ],
        };
    } catch (error: any) {
        logError("dap_send_command failed", error, {
            tool: "dap_send_command",
            command,
            host: resolvedHost,
            port: resolvedPort,
        });
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(
                        {
                            success: false,
                            command,
                            error: error.message,
                            dap_server: `${resolvedHost}:${resolvedPort}`,
                            dap_source: resolution.source,
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
    logInfo("Initializing gibRun MCP server");
    const server = new Server(
        {
            name: "gibrun-mcp-server",
            version: "1.1.0",
        },
        {
            capabilities: {
                tools: {},
            },
        }
    );

    // List available tools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        let goTools: Tool[] = [];
        try {
            goTools = await goDebuggerProxy.listTools();
        } catch (error) {
            logError("Failed to load Go debugger tools", error);
        }
        return { tools: mergeToolLists(LOCAL_TOOLS, goTools) };
    });

    // Handle tool calls
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name } = request.params;
        const args = request.params.arguments ?? {};
        const handler = LOCAL_TOOL_HANDLERS[name];
        try {
            if (handler) {
                return await handler(args);
            }

            return await goDebuggerProxy.callTool(name, args);
        } catch (error: any) {
            logError("Tool handler threw unhandled exception", error, {
                tool: name,
            });
            return createErrorResult(error?.message ?? "Unknown tool failure", {
                stack: error?.stack,
                tool: name,
            });
        }
    });

    // Cleanup on exit
    process.on("SIGINT", async () => {
        logInfo("Received SIGINT, closing MCP server");
        for (const pool of dbPools.values()) {
            await pool.end();
        }
        await goDebuggerProxy.shutdown();
        process.exit(0);
    });

    process.on("SIGTERM", async () => {
        logInfo("Received SIGTERM, closing MCP server");
        for (const pool of dbPools.values()) {
            await pool.end();
        }
        await goDebuggerProxy.shutdown();
        process.exit(0);
    });

    process.on("unhandledRejection", (reason) => {
        logError("Unhandled promise rejection", reason);
    });

    process.on("uncaughtException", (error) => {
        logError("Uncaught exception", error);
        process.exit(1);
    });

    // Start server
    const transport = new StdioServerTransport();
    await server.connect(transport);

    logInfo("gibRun MCP Server running on stdio", { transport: "stdio" });
}

main().catch((error) => {
    logError("Fatal error during MCP startup", error);
    process.exit(1);
});
