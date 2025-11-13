// src/types/api.ts - API type definitions
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
  timestamp: Date;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
}

export interface DAPConfig {
  host: string;
  port: number;
  timeout: number;
  debugger: 'delve' | 'gdb' | 'lldb';
}

// Tool argument interfaces
export interface DAPRestartArgs {
  host?: string;
  port?: number;
  rebuild_first?: boolean;
  project_path?: string;
}

export interface DatabaseQueryArgs {
  connection_string: string;
  query: string;
  params?: any[];
}

export interface HTTPRequestArgs {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
}