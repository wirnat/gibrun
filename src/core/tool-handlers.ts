import { DatabaseService } from "@/services/database-service.js";
import { HttpService } from "@/services/http-service.js";
import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { logError } from "@/services/logger-service.js";

const execAsync = promisify(exec);

// Tool handlers for database, HTTP, and file system operations

export async function handlePostgresQuery(databaseService: DatabaseService, args: any) {
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

export async function handleHttpRequest(httpService: HttpService, args: any) {
    const { url, method = 'GET', headers, body, timeout = 30000 } = args;

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
        const stats = await import("fs/promises").then(fs => fs.stat(file_path));
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
                const { mkdir } = await import("fs/promises");
                await mkdir(dirPath, { recursive: true });
            }
        }

        await writeFile(file_path, content, { encoding });

        // Get file stats after writing
        const { stat } = await import("fs/promises");
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