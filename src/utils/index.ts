/**
 * Utility functions for gibRun MCP Server
 */

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if a value is a valid JSON string
 */
export function isValidJson(str: string): boolean {
    try {
        JSON.parse(str);
        return true;
    } catch {
        return false;
    }
}

/**
 * Safely parse JSON string with fallback
 */
export function safeJsonParse<T = any>(str: string, fallback: T): T {
    try {
        return JSON.parse(str);
    } catch {
        return fallback;
    }
}

/**
 * Generate a random ID string
 */
export function generateId(length: number = 8): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    if (obj instanceof Date) {
        return new Date(obj.getTime()) as unknown as T;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => deepClone(item)) as unknown as T;
    }

    const clonedObj = {} as T;
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            clonedObj[key] = deepClone(obj[key]);
        }
    }

    return clonedObj;
}

/**
 * Check if running in development mode
 */
export function isDevelopment(): boolean {
    return process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'dev';
}

/**
 * Check if running in test mode
 */
export function isTest(): boolean {
    return process.env.NODE_ENV === 'test';
}

/**
 * Check if running in production mode
 */
export function isProduction(): boolean {
    return process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'prod';
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Truncate string to specified length with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
}

/**
 * Capitalize first letter of string
 */
export function capitalize(str: string): string {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Convert camelCase to kebab-case
 */
export function camelToKebab(str: string): string {
    return str.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Convert kebab-case to camelCase
 */
export function kebabToCamel(str: string): string {
    return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Get current timestamp in ISO format
 */
export function getTimestamp(): string {
    return new Date().toISOString();
}

/**
 * Calculate time difference in milliseconds
 */
export function timeDiff(start: Date, end: Date = new Date()): number {
    return end.getTime() - start.getTime();
}

/**
 * Format duration in milliseconds to human readable string
 */
export function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    } else {
        return `${seconds}s`;
    }
}