import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { DAPService } from "@/services/dap-service.js";
import { resolveDAPServer } from "@core/dap-handlers.js";
import { exec } from "child_process";
import { promisify } from "util";
import { logError, logInfo } from "@/services/logger-service.js";

// Import all DAP tool modules
import { DAP_BREAKPOINT_TOOLS } from "./breakpoint-tools.js";
import { DAP_EXECUTION_TOOLS } from "./execution-tools.js";
import { DAP_INSPECTION_TOOLS } from "./inspection-tools.js";
import { DAP_EVENT_TOOLS } from "./event-tools.js";
import { DAP_EXCEPTION_TOOLS } from "./exception-tools.js";
import { DAP_WATCH_TOOLS } from "./watch-tools.js";
import { DAP_ERROR_TOOLS } from "./error-tools.js";
import { DAP_THREAD_TOOLS } from "./thread-tools.js";
import { DAP_MULTI_IDE_TOOLS } from "./multi-ide-tools.js";
import { DAP_SECURITY_TOOLS } from "./security-tools.js";

const execAsync = promisify(exec);

// Combine all DAP tools
export const DAP_TOOLS: Tool[] = [
    // Original tools
    {
        name: "dap_restart",
        description:
            "Restart VSCode debugger session with optional rebuild. Useful for hot reloading Go applications during development.",
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
                    description: "DAP server host (default: auto-detected)",
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

    // Phase 2: Enhanced Features - HIGH PRIORITY
    ...DAP_EVENT_TOOLS,
    ...DAP_EXCEPTION_TOOLS,
    ...DAP_WATCH_TOOLS,
    ...DAP_ERROR_TOOLS,
    ...DAP_THREAD_TOOLS,
    ...DAP_MULTI_IDE_TOOLS,
    ...DAP_SECURITY_TOOLS,

    // Existing specialized tools
    ...DAP_BREAKPOINT_TOOLS,
    ...DAP_EXECUTION_TOOLS,
    ...DAP_INSPECTION_TOOLS,
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
    const { host, port, rebuild_first = true, project_path } = args;

    try {
        // Resolve DAP server (auto-detect if needed)
        const resolution = await resolveDAPServer(host, port);
        if (!resolution.success) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: false,
                            error: resolution.error,
                            troubleshooting: {
                                check_debugger: "Pastikan VSCode debugger sedang aktif (status bar hijau) dan Debug Console masih menampilkan 'DAP server listening at: HOST:PORT'.",
                                check_port: "Verifikasi port terbaru di Debug Console. Port bisa berubah setiap kali VSCode restart.",
                                check_initialized: "Jika Debug Console tidak lagi menampilkan pesan listening, hentikan (Shift+F5) lalu jalankan lagi (F5).",
                                manual_specify: "Jika auto-detection gagal, berikan host dan port secara eksplisit dalam parameter."
                            }
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }

        const resolvedHost = resolution.host;
        const resolvedPort = resolution.port;

        // Rebuild if requested
        let buildResult = null;
        if (rebuild_first && project_path) {
            try {
                logInfo("Building Go project before DAP restart", {
                    tool: "dap_restart",
                    project_path
                });

                const { stdout, stderr } = await execAsync("go build", {
                    cwd: project_path,
                    timeout: 30000, // 30 second timeout
                    maxBuffer: 1024 * 1024 // 1MB buffer
                });

                buildResult = { stdout, stderr };
                logInfo("Go project build completed successfully", {
                    tool: "dap_restart",
                    project_path
                });
            } catch (buildError: any) {
                logError("Go project build failed", buildError, {
                    tool: "dap_restart",
                    project_path
                });

                // Continue with restart even if build fails
                buildResult = {
                    stdout: buildError.stdout || '',
                    stderr: buildError.stderr || buildError.message,
                    error: buildError.message
                };
            }
        }

        // Send restart command
        const result = await dapService.sendDAPRequest(resolvedHost, resolvedPort, 'disconnect', {
            restart: true
        });

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: result.type === 'response' && result.success !== false,
                        message: "DAP restart initiated",
                        dap_server: `${resolvedHost}:${resolvedPort}`,
                        build_result: buildResult,
                        dap_response: result,
                        note: "Debugger will restart automatically. Wait a few seconds for the new session to initialize."
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
    const { host, port, command, arguments: commandArgs = {} } = args;

    try {
        // Resolve DAP server (auto-detect if needed)
        const resolution = await resolveDAPServer(host, port);
        if (!resolution.success) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: false,
                            command,
                            error: resolution.error,
                            troubleshooting: {
                                check_debugger: "Pastikan VSCode debugger masih aktif dan terhubung.",
                                check_command: "Verifikasi command DAP valid untuk Go debugger (Delve).",
                                check_arguments: "Pastikan command arguments sesuai dengan DAP protocol.",
                            }
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }

        const resolvedHost = resolution.host;
        const resolvedPort = resolution.port;

        const result = await dapService.sendDAPRequest(resolvedHost, resolvedPort, command, commandArgs);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: result.type === 'response' && result.success !== false,
                        command,
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
                        command,
                        error: error.message
                    }, null, 2),
                },
            ],
            isError: true,
        };
    }
}

// Re-export all handler functions from specialized tool modules
export {
    // Event handling tools
    handleDAPListenEvents,
    handleDAPSubscribeEvents
} from "./event-tools.js";

export {
    // Exception breakpoint tools
    handleDAPSetExceptionBreakpoints
} from "./exception-tools.js";

export {
    // Watch expression tools
    handleDAPSetWatch,
    handleDAPGetWatches,
    handleDAPClearWatches
} from "./watch-tools.js";

export {
    // Advanced error handling tools
    handleDAPGetErrorDetails
} from "./error-tools.js";

export {
    // Breakpoint tools
    handleDAPSetBreakpoints,
    handleDAPGetBreakpoints,
    handleDAPClearBreakpoints
} from "./breakpoint-tools.js";

export {
    // Execution control tools
    handleDAPContinue,
    handleDAPStepOver,
    handleDAPStepInto,
    handleDAPStepOut,
    handleDAPPause
} from "./execution-tools.js";

export {
    // Variable inspection tools
    handleDAPEvaluate,
    handleDAPVariables,
    handleDAPStackTrace
} from "./inspection-tools.js";

export {
    // Thread management tools
    handleDAPListThreads,
    handleDAPSwitchThread,
    handleDAPThreadInfo
} from "./thread-tools.js";

export {
    // Multi-IDE support tools
    handleDAPDetectIDE,
    handleDAPConfigureMultiIDE,
    handleDAPValidateIDESetup
} from "./multi-ide-tools.js";

export {
    // Security hardening tools
    handleDAPValidateInput,
    handleDAPSetSecurityLimits,
    handleDAPSecurityAudit,
    handleDAPSanitizeExpression
} from "./security-tools.js";