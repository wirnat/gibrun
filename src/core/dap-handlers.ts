import * as net from "net";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { logError, logInfo } from "@/services/logger-service.js";
import { DetectedDAPServer, DAPResolutionResult, SendDAPRequestOptions } from "./server-types.js";

const execAsync = promisify(exec);

// DAP-specific handlers and utilities

export async function detectDAPServers(): Promise<DetectedDAPServer[]> {
    const servers: DetectedDAPServer[] = [];

    // Check common DAP ports for Go debugger (Delve)
    const commonPorts = [49279, 2345, 40000, 50000];

    for (const port of commonPorts) {
        try {
            const socket = net.createConnection({ host: '127.0.0.1', port, timeout: 1000 });

            await new Promise<void>((resolve, reject) => {
                socket.on('connect', () => {
                    servers.push({
                        host: '127.0.0.1',
                        port,
                        processId: process.pid, // Placeholder
                        executable: 'dlv' // Go debugger
                    });
                    socket.end();
                    resolve();
                });

                socket.on('error', () => {
                    // Port not available, continue
                    resolve();
                });

                socket.on('timeout', () => {
                    socket.end();
                    resolve();
                });
            });
        } catch {
            // Continue to next port
        }
    }

    return servers;
}

export async function resolveDAPServer(
    host?: string,
    port?: number
): Promise<DAPResolutionResult> {
    // If both host and port provided, use them directly
    if (host && port) {
        return { success: true, host, port };
    }

    // Auto-detect DAP servers
    const servers = await detectDAPServers();

    if (servers.length === 0) {
        return {
            success: false,
            error: "No DAP servers found. Make sure VSCode debugger is running and showing 'DAP server listening at: HOST:PORT' in Debug Console."
        };
    }

    if (servers.length === 1) {
        const server = servers[0];
        return {
            success: true,
            host: server.host,
            port: server.port
        };
    }

    // Multiple servers found, return the first one with a note
    const server = servers[0];
    logInfo("Multiple DAP servers found, using first one", {
        servers: servers.map(s => `${s.host}:${s.port}`),
        selected: `${server.host}:${server.port}`
    });

    return {
        success: true,
        host: server.host,
        port: server.port
    };
}

function createDAPResolutionErrorResponse(
    resolution: { success: false; error: string },
    toolName: string
) {
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    success: false,
                    error: resolution.error,
                    tool: toolName,
                    troubleshooting: {
                        check_debugger: "Pastikan VSCode debugger sedang aktif (status bar hijau) dan Debug Console masih menampilkan 'DAP server listening at: HOST:PORT'.",
                        check_port: "Verifikasi port terbaru di Debug Console. Port bisa berubah setiap kali VSCode restart.",
                        check_initialized: "Jika Debug Console tidak lagi menampilkan pesan listening, hentikan (Shift+F5) lalu jalankan lagi (F5).",
                        check_config: "Pastikan launch.json memakai konfigurasi Go debugger yang valid dan mode debug (type: \"go\", request: \"launch\").",
                        manual_specify: "Jika auto-detection gagal, berikan host dan port secara eksplisit dalam parameter."
                    }
                }, null, 2),
            },
        ],
        isError: true,
    };
}

export async function sendDAPRequest(
    host: string,
    port: number,
    command: string,
    args?: any,
    options: SendDAPRequestOptions = {}
): Promise<any> {
    const { timeout = 30000, retries = 0 } = options;

    return new Promise((resolve, reject) => {
        const socket = net.createConnection({ host, port }, () => {
            logInfo(`Connected to DAP server at ${host}:${port}`);

            // Send DAP request
            const request = {
                seq: 1,
                type: 'request',
                command,
                arguments: args || {}
            };

            socket.write(JSON.stringify(request) + '\r\n');

            // Set up response listener
            let buffer = '';
            const responseTimeout = setTimeout(() => {
                socket.end();
                reject(new Error(`DAP response timeout after ${timeout}ms`));
            }, timeout);

            socket.on('data', (data) => {
                buffer += data.toString();

                const messages = buffer.split('\r\n');
                if (messages.length > 1) {
                    try {
                        const response = JSON.parse(messages[0]);
                        clearTimeout(responseTimeout);
                        socket.end();
                        resolve(response);
                    } catch (error) {
                        clearTimeout(responseTimeout);
                        socket.end();
                        reject(new Error(`Invalid DAP response: ${error}`));
                    }
                }
            });
        });

        socket.on('error', (error) => {
            logError('DAP connection failed', error, { host, port, command });
            reject(error);
        });
    });
}

export async function restartGoDebugger(
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

function buildGoProjectHints(
    projectPath: string,
    errorOutput: string
): string[] | null {
    const hints: string[] = [];

    // Check for common Go build errors
    if (errorOutput.includes("cannot find package")) {
        hints.push("Missing Go dependencies. Run 'go mod tidy' in project directory.");
    }

    if (errorOutput.includes("go.mod file not found")) {
        hints.push("Project is not a Go module. Run 'go mod init' to initialize.");
    }

    if (errorOutput.includes("undefined:")) {
        hints.push("Undefined function or variable. Check for compilation errors.");
    }

    if (errorOutput.includes("import cycle")) {
        hints.push("Circular import detected. Refactor package dependencies.");
    }

    return hints.length > 0 ? hints : null;
}

export async function handleDAPRestart(args: any) {
    const { host, port, rebuild_first = true, project_path } = args;

    const resolution = await resolveDAPServer(host, port);
    if (!resolution.success) {
        return createDAPResolutionErrorResponse(resolution as { success: false; error: string }, "dap_restart");
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

export async function handleDAPSendCommand(args: any) {
    const { host, port, command, arguments: cmdArgs } = args;

    const resolution = await resolveDAPServer(host, port);
    if (!resolution.success) {
        return createDAPResolutionErrorResponse(resolution, "dap_send_command");
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

        const response = await sendDAPRequest(resolvedHost, resolvedPort, command, cmdArgs);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        command,
                        arguments: cmdArgs,
                        response,
                        dap_server: `${resolvedHost}:${resolvedPort}`,
                        dap_source: resolution.source,
                    }, null, 2),
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
                    text: JSON.stringify({
                        success: false,
                        command,
                        arguments: cmdArgs,
                        error: error.message,
                        dap_server: `${resolvedHost}:${resolvedPort}`,
                        dap_source: resolution.source,
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
}