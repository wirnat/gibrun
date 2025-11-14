// Server-specific types and interfaces
export interface DetectedDAPServer {
    host: string;
    port: number;
    processId?: number;
    executable?: string;
    args?: string[];
}

export type DAPResolutionResult =
    | { success: true; host: string; port: number }
    | { success: false; error: string };

export interface SendDAPRequestOptions {
    timeout?: number;
    retries?: number;
}

export type ToolHandler = (args: any) => Promise<any>;

// DAP Event Handling Types
export interface DAPEvent {
    seq: number;
    type: 'event';
    event: string;
    body?: any;
}

export interface DAPEventSubscription {
    eventType: string;
    filter?: Record<string, any>;
    persistent?: boolean;
    callback?: (event: DAPEvent) => void;
}

export interface DAPEventListenerOptions {
    eventTypes?: string[];
    timeoutMs?: number;
    maxEvents?: number;
    filters?: Record<string, any>;
}

// Exception Breakpoint Types
export interface DAPExceptionBreakpoint {
    path: string[];
    breakMode: 'never' | 'always' | 'unhandled' | 'userUnhandled';
}

export interface DAPExceptionBreakpointsArgs {
    host?: string;
    port?: number;
    filters?: string[];
    exceptionOptions?: DAPExceptionBreakpoint[];
}

// Watch Expression Types
export interface DAPWatchExpression {
    expression: string;
    name?: string;
    id?: string;
}

export interface DAPWatchResult {
    expression: string;
    value?: any;
    type?: string;
    error?: string;
    lastUpdated?: Date;
}

// Advanced Error Handling Types
export interface DAPErrorDetails {
    id: string;
    type: 'protocol' | 'connection' | 'timeout' | 'debugger' | 'application';
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    details?: any;
    context?: {
        command?: string;
        arguments?: any;
        timestamp?: Date;
        stackTrace?: string[];
    };
    suggestions?: string[];
    recoveryActions?: string[];
}

export interface DAPErrorClassification {
    category: string;
    confidence: number;
    description: string;
    recommendedAction: string;
}

// Thread Management Types
export interface DAPThread {
    id: number;
    name?: string;
    state?: 'running' | 'stopped' | 'exited';
    location?: {
        file?: string;
        line?: number;
        column?: number;
    };
}

export interface DAPThreadInfo {
    thread: DAPThread;
    stackFrames?: any[];
    variables?: any[];
    callStack?: string[];
}

export interface DAPListThreadsArgs {
    host?: string;
    port?: number;
    include_stack_traces?: boolean;
}

export interface DAPSwitchThreadArgs {
    host?: string;
    port?: number;
    threadId: number;
}

export interface DAPThreadInfoArgs {
    host?: string;
    port?: number;
    threadId: number;
    include_stack?: boolean;
    include_variables?: boolean;
    max_stack_frames?: number;
}