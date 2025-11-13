import { appendFile, mkdir } from "fs/promises";
import * as path from "path";

type LogLevel = "INFO" | "ERROR";

interface SerializedError {
    message: string;
    name?: string;
    stack?: string;
    code?: string | number;
    details?: string;
}

interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
    meta?: Record<string, unknown>;
    error?: SerializedError;
}

function resolvePath(targetPath: string): string {
    return path.isAbsolute(targetPath)
        ? targetPath
        : path.join(process.cwd(), targetPath);
}

const defaultLogDirectory = path.join(process.cwd(), "logs");
const LOG_DIRECTORY =
    process.env.MCP_LOG_DIR && process.env.MCP_LOG_DIR.trim().length > 0
        ? resolvePath(process.env.MCP_LOG_DIR)
        : defaultLogDirectory;
const LOG_FILE_PATH =
    process.env.MCP_LOG_FILE && process.env.MCP_LOG_FILE.trim().length > 0
        ? resolvePath(process.env.MCP_LOG_FILE)
        : path.join(LOG_DIRECTORY, "mcp.log");
let logSetupPromise: Promise<void> | null = null;

async function ensureLogDestination(): Promise<void> {
    if (!logSetupPromise) {
        const directory = path.dirname(LOG_FILE_PATH);
        logSetupPromise = (async () => {
            try {
                await mkdir(directory, { recursive: true });
            } catch (error) {
                console.error("Failed to prepare MCP log directory:", error);
            }
        })();
    }

    await logSetupPromise;
}

async function appendLogEntry(entry: LogEntry): Promise<void> {
    try {
        await ensureLogDestination();
        await appendFile(LOG_FILE_PATH, `${JSON.stringify(entry)}\n`);
    } catch (error) {
        console.error("Failed to append MCP log entry:", error);
    }
}

function serializeError(error: unknown): SerializedError | undefined {
    if (!error) {
        return undefined;
    }

    if (error instanceof Error) {
        const serialized: SerializedError = {
            message: error.message,
            name: error.name,
        };

        const anyError = error as any;
        if (anyError?.code) {
            serialized.code = anyError.code;
        }

        if (error.stack) {
            serialized.stack = error.stack;
        }

        return serialized;
    }

    if (typeof error === "string") {
        return { message: error };
    }

    let details = "";
    try {
        details = JSON.stringify(error);
    } catch {
        details = String(error);
    }

    return {
        message: "Non-Error thrown",
        details,
    };
}

function emitConsoleLog(
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown>,
    serializedError?: SerializedError
) {
    const metaPart =
        meta && Object.keys(meta).length > 0 ? ` | ${JSON.stringify(meta)}` : "";
    const errorPart = serializedError ? ` | ${serializedError.message}` : "";
    console.error(`[${level}] ${message}${metaPart}${errorPart}`);

    if (serializedError?.stack) {
        console.error(serializedError.stack);
    }
}

export function logInfo(message: string, meta?: Record<string, unknown>) {
    const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: "INFO",
        message,
        ...(meta ? { meta } : {}),
    };

    emitConsoleLog("INFO", message, meta);
    void appendLogEntry(entry);
}

export function logError(
    message: string,
    error?: unknown,
    meta?: Record<string, unknown>
) {
    const serializedError = serializeError(error);
    const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: "ERROR",
        message,
        ...(meta ? { meta } : {}),
        ...(serializedError ? { error: serializedError } : {}),
    };

    emitConsoleLog("ERROR", message, meta, serializedError);
    void appendLogEntry(entry);
}
