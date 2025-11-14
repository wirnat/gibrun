// Server-specific types and interfaces
export interface DetectedDAPServer {
    host: string;
    port: number;
    processId?: number;
    executable?: string;
    args?: string[];
}

export type DAPResolutionResult =
    | { success: true; host: string; port: number; source?: string }
    | { success: false; error: string; source?: string };

export interface SendDAPRequestOptions {
    timeout?: number;
    retries?: number;
}

export type ToolHandler = (args: any) => Promise<any>;