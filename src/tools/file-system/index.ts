import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { readFile, writeFile, mkdir, stat } from "fs/promises";
import { existsSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { logError } from "@/services/logger-service.js";

const execAsync = promisify(exec);

export const FILE_SYSTEM_TOOLS: Tool[] = [
    {
        name: "read_source_file",
        description:
            "Read content from a source file. Useful for examining code, configuration files, or any text-based content.",
        inputSchema: {
            type: "object",
            properties: {
                file_path: {
                    type: "string",
                    description: "Path to the file to read"
                },
                encoding: {
                    type: "string",
                    description: "File encoding (default: utf8)",
                    default: "utf8",
                    enum: ["utf8", "ascii", "latin1", "base64", "hex"]
                }
            },
            required: ["file_path"]
        },
    },
    {
        name: "write_source_file",
        description:
            "Write content to a source file. Creates the file if it doesn't exist, or overwrites if it does.",
        inputSchema: {
            type: "object",
            properties: {
                file_path: {
                    type: "string",
                    description: "Path to the file to write"
                },
                content: {
                    type: "string",
                    description: "Content to write to the file"
                },
                encoding: {
                    type: "string",
                    description: "File encoding (default: utf8)",
                    default: "utf8",
                    enum: ["utf8", "ascii", "latin1", "base64", "hex"]
                },
                create_dirs: {
                    type: "boolean",
                    description: "Create parent directories if they don't exist (default: false)",
                    default: false
                }
            },
            required: ["file_path", "content"]
        },
    },
    {
        name: "execute_shell_command",
        description:
            "Execute shell commands on the system. Useful for running build commands, scripts, or system operations.",
        inputSchema: {
            type: "object",
            properties: {
                command: {
                    type: "string",
                    description: "Shell command to execute"
                },
                cwd: {
                    type: "string",
                    description: "Working directory for command execution (default: current directory)"
                },
                timeout: {
                    type: "number",
                    description: "Command timeout in milliseconds (default: 30000)",
                    default: 30000
                },
                env: {
                    type: "object",
                    description: "Environment variables for the command"
                }
            },
            required: ["command"]
        },
    },
];

export async function handleReadSourceFile(args: any) {
    const { file_path, encoding = 'utf8' } = args;

    try {
        // Check if file exists
        if (!existsSync(file_path)) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: false,
                            error: `File not found: ${file_path}`
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }

        // Check if it's actually a file (not directory)
        const stats = await stat(file_path);
        if (!stats.isFile()) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: false,
                            error: `Path is not a file: ${file_path}`
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }

        const content = await readFile(file_path, { encoding });

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        file_path,
                        encoding,
                        size: stats.size,
                        content
                    }, null, 2),
                },
            ],
        };
    } catch (error: any) {
        logError("read_source_file failed", error, { file_path, encoding });
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: false,
                        file_path,
                        encoding,
                        error: error.message
                    }, null, 2),
                },
            ],
            isError: true,
        };
    }
}

export async function handleWriteSourceFile(args: any) {
    const { file_path, content, encoding = 'utf8', create_dirs = false } = args;

    try {
        // Create directories if requested
        if (create_dirs) {
            const dirPath = file_path.substring(0, file_path.lastIndexOf('/'));
            if (dirPath && !existsSync(dirPath)) {
                await mkdir(dirPath, { recursive: true });
            }
        }

        await writeFile(file_path, content, { encoding });

        // Get file stats after writing
        const stats = await stat(file_path);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        file_path,
                        encoding,
                        size: stats.size,
                        created: !existsSync(file_path) // This check is after write, so always true
                    }, null, 2),
                },
            ],
        };
    } catch (error: any) {
        logError("write_source_file failed", error, { file_path, encoding, create_dirs });
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: false,
                        file_path,
                        encoding,
                        create_dirs,
                        error: error.message
                    }, null, 2),
                },
            ],
            isError: true,
        };
    }
}

export async function handleExecuteShellCommand(args: any) {
    const { command, cwd, timeout = 30000, env } = args;

    try {
        const execOptions: any = {
            timeout,
            maxBuffer: 1024 * 1024 * 10, // 10MB buffer
        };

        if (cwd) execOptions.cwd = cwd;
        if (env) execOptions.env = { ...process.env, ...env };

        const result = await execAsync(command, execOptions);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        command,
                        cwd: cwd || process.cwd(),
                        exitCode: 0,
                        stdout: result.stdout,
                        stderr: result.stderr,
                        duration_ms: timeout // TODO: Calculate actual duration
                    }, null, 2),
                },
            ],
        };
    } catch (error: any) {
        logError("execute_shell_command failed", error, { command, cwd, timeout });

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: false,
                        command,
                        cwd: cwd || process.cwd(),
                        exitCode: error.code || 1,
                        stdout: error.stdout || '',
                        stderr: error.stderr || error.message,
                        error: error.message
                    }, null, 2),
                },
            ],
            isError: true,
        };
    }
}