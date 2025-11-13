import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
    StdioClientTransport,
    type StdioServerParameters,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { existsSync } from "fs";
import * as path from "path";

import { logError, logInfo } from "./logger.js";

interface CommandOption {
    label: string;
    params: StdioServerParameters;
}

function cloneEnvironment(): Record<string, string> {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
        if (typeof value === "string") {
            env[key] = value;
        }
    }
    return env;
}

function parseArgs(value?: string): string[] | undefined {
    if (!value) {
        return undefined;
    }
    return value
        .split(/\s+/)
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0);
}

export class GoDebuggerProxy {
    private client: Client | null = null;
    private transport: StdioClientTransport | null = null;
    private connectPromise: Promise<void> | null = null;
    private cachedTools: Tool[] = [];
    private shuttingDown = false;
    private readonly env: Record<string, string>;

    constructor(private readonly projectRoot: string) {
        this.env = cloneEnvironment();
    }

    async ensureReady(): Promise<void> {
        if (this.client || this.shuttingDown) {
            if (this.shuttingDown) {
                throw new Error("Go debugger proxy is shutting down");
            }
            return;
        }

        if (this.connectPromise) {
            return this.connectPromise;
        }

        this.connectPromise = this.startClient();
        try {
            await this.connectPromise;
        } finally {
            this.connectPromise = null;
        }
    }

    async listTools(forceRefresh = false): Promise<Tool[]> {
        await this.ensureReady();
        if (!this.client) {
            throw new Error("Go debugger client unavailable");
        }

        if (!forceRefresh && this.cachedTools.length > 0) {
            return this.cachedTools;
        }

        const result = await this.client.listTools({});
        this.cachedTools = result.tools;
        return this.cachedTools;
    }

    async callTool(
        name: string,
        args: Record<string, unknown> = {}
    ): Promise<any> {
        await this.ensureReady();
        if (!this.client) {
            throw new Error("Go debugger client unavailable");
        }

        try {
            return await this.client.callTool({
                name,
                arguments: args,
            });
        } catch (error) {
            logError("Go debugger tool call failed", error, { tool: name });
            throw error;
        }
    }

    async shutdown(): Promise<void> {
        this.shuttingDown = true;

        try {
            if (this.client) {
                await this.client.close();
            }
        } catch (error) {
            logError("Failed to close Go debugger client", error);
        }

        try {
            if (this.transport) {
                await this.transport.close();
            }
        } catch (error) {
            logError("Failed to close Go debugger transport", error);
        }

        this.resetConnectionState();
    }

    private async startClient(): Promise<void> {
        const options = this.buildServerOptions();
        let lastError: unknown = null;

        for (const option of options) {
            let transport: StdioClientTransport | null = null;
            let client: Client | null = null;
            try {
                transport = new StdioClientTransport(option.params);
                const stderr = transport.stderr;
                if (stderr) {
                    stderr.on("data", (chunk) => {
                        const text = chunk.toString().trim();
                        if (text.length > 0) {
                            logInfo("Go debugger stderr", {
                                message: text,
                                command: option.label,
                            });
                        }
                    });
                }
                transport.onclose = () => {
                    logInfo("Go debugger transport closed", {
                        command: option.label,
                    });
                    this.resetConnectionState();
                };
                transport.onerror = (error) => {
                    logError("Go debugger transport error", error, {
                        command: option.label,
                    });
                };

                client = new Client(
                    {
                        name: "gibrun-go-debugger-proxy",
                        version: "1.0.0",
                    },
                    {
                        capabilities: {
                            tools: {},
                        },
                    }
                );

                await client.connect(transport);

                this.transport = transport;
                this.client = client;
                this.cachedTools = [];

                logInfo("Connected to Go debugger server", {
                    command: option.label,
                });

                return;
            } catch (error) {
                lastError = error;
                logError("Failed to start Go debugger subprocess", error, {
                    command: option.label,
                });

                if (client) {
                    try {
                        await client.close();
                    } catch {
                        // ignore close errors during startup
                    }
                }

                if (transport) {
                    try {
                        await transport.close();
                    } catch {
                        // ignore close errors during startup
                    }
                }
            }
        }

        throw new Error(
            `Unable to start Go debugger subprocess. Last error: ${
                lastError instanceof Error ? lastError.message : String(lastError)
            }`
        );
    }

    private resetConnectionState() {
        this.client = null;
        this.transport = null;
        this.cachedTools = [];
    }

    private buildServerOptions(): CommandOption[] {
        const options: CommandOption[] = [];
        const envCommand = process.env.GIBRUN_GO_DEBUGGER_COMMAND?.trim();
        const envArgs = parseArgs(process.env.GIBRUN_GO_DEBUGGER_ARGS);
        const envCwd = process.env.GIBRUN_GO_DEBUGGER_CWD?.trim();

        if (envCommand) {
            options.push({
                label: envCommand,
                params: {
                    command: envCommand,
                    args: envArgs,
                    cwd: envCwd || undefined,
                    env: this.env,
                    stderr: "pipe",
                },
            });
        }

        options.push({
            label: "mcp-go-debugger",
            params: {
                command: "mcp-go-debugger",
                env: this.env,
                stderr: "pipe",
            },
        });

        const goRunDir = path.join(
            this.projectRoot,
            "external",
            "mcp-go-debugger"
        );
        if (existsSync(goRunDir)) {
            options.push({
                label: "go run ./cmd/mcp-go-debugger",
                params: {
                    command: "go",
                    args: ["run", "./cmd/mcp-go-debugger"],
                    cwd: goRunDir,
                    env: this.env,
                    stderr: "pipe",
                },
            });
        }

        return options;
    }
}
