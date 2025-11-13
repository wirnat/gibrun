// src/types/common.ts - Common type definitions
export interface ErrorResponse {
    success: false;
    error: string;
    code?: string;
    details?: any;
}

export interface SuccessResponse<T = any> {
    success: true;
    data: T;
    message?: string;
}

export type APIResult<T = any> = SuccessResponse<T> | ErrorResponse;

export interface PaginationParams {
    page?: number;
    limit?: number;
    offset?: number;
}

export interface SortParams {
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

export interface FilterParams {
    [key: string]: any;
}

export interface QueryParams extends PaginationParams, SortParams, FilterParams {}

// src/types/tool.ts - MCP Tool type definitions
export interface ToolHandler {
    (args: any): Promise<{
        content: Array<{
            type: string;
            text: string;
        }>;
        isError?: boolean;
    }>;
}

export interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: Record<string, any>;
        required?: string[];
    };
}

// src/types/service.ts - Service layer type definitions
export interface DatabaseConnection {
    host: string;
    port: number;
    database: string;
    user: string;
    password?: string;
    ssl?: boolean;
    maxConnections?: number;
}

export interface HTTPClientConfig {
    timeout: number;
    retries?: number;
    headers?: Record<string, string>;
}

export interface LoggerConfig {
    level: 'debug' | 'info' | 'warn' | 'error';
    format: 'json' | 'text';
    output: 'console' | 'file';
    filePath?: string;
}

// src/types/dap.ts - DAP specific type definitions
export interface DAPServerInfo {
    host: string;
    port: number;
    debugger: string;
    status: 'connected' | 'disconnected' | 'error';
    lastSeen?: Date;
}

export interface DAPCommand {
    command: string;
    arguments?: any;
    timeout?: number;
}

export interface DAPResponse {
    seq: number;
    type: 'response' | 'event';
    request_seq?: number;
    success?: boolean;
    command?: string;
    message?: string;
    body?: any;
}

// src/types/config.ts - Configuration type definitions
export interface ServerConfig {
    port: number;
    host: string;
    logLevel: string;
    database: DatabaseConnection;
    dap: {
        defaultHost: string;
        defaultPort: number;
        timeout: number;
    };
}

export interface EnvironmentConfig {
    NODE_ENV: 'development' | 'production' | 'test';
    DATABASE_URL?: string;
    LOG_LEVEL?: string;
    DEBUG?: string;
}