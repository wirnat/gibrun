import { access, constants } from "fs/promises";
import { resolve, normalize } from "path";
import { logError } from "@/services/logger-service.js";

// Security and validation utilities for file operations

export interface ValidationResult {
    valid: boolean;
    error?: string;
    sanitizedPath?: string;
}

export interface FileOperationContext {
    operation: string;
    userId?: string;
    sessionId?: string;
    timestamp: Date;
}

/**
 * Validates and sanitizes file paths to prevent path traversal attacks
 */
export async function validateFilePath(inputPath: string, baseDir: string = process.cwd()): Promise<ValidationResult> {
    try {
        // Resolve the path relative to base directory
        const resolvedPath = resolve(baseDir, inputPath);

        // Normalize the path to handle .. and . components
        const normalizedPath = normalize(resolvedPath);

        // Check if the normalized path is still within the base directory
        const baseResolved = resolve(baseDir);
        if (!normalizedPath.startsWith(baseResolved)) {
            return {
                valid: false,
                error: "Path traversal detected: attempting to access files outside allowed directory"
            };
        }

        // Check for suspicious patterns
        const suspiciousPatterns = [
            /\.\./,  // Parent directory references
            /~/,     // Home directory references
            /^\//,   // Absolute paths (if not allowed)
            /[<>:|?*]/,  // Invalid filename characters
            /\\{2,}/,    // Multiple backslashes
            /\/+/     // Multiple forward slashes
        ];

        for (const pattern of suspiciousPatterns) {
            if (pattern.test(inputPath)) {
                return {
                    valid: false,
                    error: `Invalid path pattern detected: ${pattern}`
                };
            }
        }

        // Check file permissions
        try {
            await access(normalizedPath, constants.R_OK);
        } catch (error: any) {
            return {
                valid: false,
                error: `File not accessible: ${error?.message || String(error)}`
            };
        }

        return {
            valid: true,
            sanitizedPath: normalizedPath
        };

    } catch (error: any) {
        logError("Path validation failed", error, { inputPath, baseDir });
        return {
            valid: false,
            error: `Path validation error: ${error?.message || String(error)}`
        };
    }
}

/**
 * Validates file operation parameters
 */
export function validateOperationParams(operation: string, params: any): ValidationResult {
    try {
        switch (operation) {
            case 'search_replace':
                if (!params.find || typeof params.find !== 'string') {
                    return { valid: false, error: "search_replace requires 'find' parameter as string" };
                }
                if (params.replace !== undefined && typeof params.replace !== 'string') {
                    return { valid: false, error: "'replace' parameter must be string if provided" };
                }
                break;

            case 'insert':
                if (!params.content || typeof params.content !== 'string') {
                    return { valid: false, error: "insert requires 'content' parameter as string" };
                }
                const validPositions = ['beginning', 'end', 'after_line', 'before_line', 'at_line'];
                if (!validPositions.includes(params.position)) {
                    return { valid: false, error: `Invalid position: ${params.position}. Must be one of: ${validPositions.join(', ')}` };
                }
                break;

            case 'rename':
                if (!params.new_name_pattern || typeof params.new_name_pattern !== 'string') {
                    return { valid: false, error: "rename requires 'new_name_pattern' parameter as string" };
                }
                break;

            case 'transform':
                const validTransformations = ['uppercase', 'lowercase', 'capitalize', 'trim', 'indent', 'dedent'];
                if (!validTransformations.includes(params.transformation_type)) {
                    return { valid: false, error: `Invalid transformation_type: ${params.transformation_type}. Must be one of: ${validTransformations.join(', ')}` };
                }
                break;
        }

        return { valid: true };

    } catch (error: any) {
        return {
            valid: false,
            error: `Parameter validation error: ${error.message}`
        };
    }
}

/**
 * Validates glob patterns for safety
 */
export function validateGlobPattern(pattern: string): ValidationResult {
    try {
        // Check for dangerous patterns
        const dangerousPatterns = [
            /^\//,      // Absolute paths
            /~\//,      // Home directory
            /\.\./,     // Parent directory references
            /\/\//,     // Double slashes
        ];

        for (const dangerous of dangerousPatterns) {
            if (dangerous.test(pattern)) {
                return {
                    valid: false,
                    error: `Dangerous glob pattern detected: ${pattern}`
                };
            }
        }

        // Check pattern complexity (prevent ReDoS)
        if (pattern.length > 1000) {
            return {
                valid: false,
                error: "Glob pattern too complex (max 1000 characters)"
            };
        }

        return { valid: true };

    } catch (error: any) {
        return {
            valid: false,
            error: `Glob pattern validation error: ${error.message}`
        };
    }
}

/**
 * Checks file operation permissions
 */
export async function checkFilePermissions(filePath: string, operation: 'read' | 'write' | 'execute'): Promise<ValidationResult> {
    try {
        let permissionFlag: number;

        switch (operation) {
            case 'read':
                permissionFlag = constants.R_OK;
                break;
            case 'write':
                permissionFlag = constants.W_OK;
                break;
            case 'execute':
                permissionFlag = constants.X_OK;
                break;
            default:
                return { valid: false, error: `Unknown operation: ${operation}` };
        }

        await access(filePath, permissionFlag);
        return { valid: true };

    } catch (error: any) {
        return {
            valid: false,
            error: `Permission check failed for ${operation}: ${error.message}`
        };
    }
}

/**
 * Sanitizes file content to prevent injection attacks
 */
export function sanitizeFileContent(content: string): string {
    // Remove or escape potentially dangerous content
    // This is a basic implementation - extend as needed

    // Remove null bytes
    content = content.replace(/\0/g, '');

    // Basic XSS prevention for HTML content
    if (content.includes('<') && content.includes('>')) {
        content = content
            .replace(/<script[^>]*>.*?<\/script>/gi, '')
            .replace(/<[^>]+>/g, '');
    }

    return content;
}

/**
 * Validates file size limits
 */
export function validateFileSize(size: number, maxSize: number = 10 * 1024 * 1024): ValidationResult { // 10MB default
    if (size > maxSize) {
        return {
            valid: false,
            error: `File size ${size} bytes exceeds maximum allowed size ${maxSize} bytes`
        };
    }

    return { valid: true };
}

/**
 * Creates audit log entry for file operations
 */
export function createAuditLog(operation: string, filePath: string, context: FileOperationContext, result: any): void {
    const auditEntry = {
        timestamp: context.timestamp.toISOString(),
        operation,
        filePath,
        userId: context.userId,
        sessionId: context.sessionId,
        success: result.success !== false,
        details: result
    };

    // In production, this would be sent to a logging service
    logError("File operation audit", null, auditEntry);
}

/**
 * Validates batch operation limits
 */
export function validateBatchLimits(fileCount: number, maxFiles: number = 100): ValidationResult {
    if (fileCount > maxFiles) {
        return {
            valid: false,
            error: `Too many files in batch operation: ${fileCount} (max: ${maxFiles})`
        };
    }

    return { valid: true };
}

/**
 * Comprehensive input validation for file operations
 */
export async function validateFileOperation(
    operation: string,
    params: any,
    context: FileOperationContext
): Promise<ValidationResult> {
    try {
        // Validate operation parameters
        const paramValidation = validateOperationParams(operation, params);
        if (!paramValidation.valid) {
            return paramValidation;
        }

        // Validate file paths if present
        if (params.file_path) {
            const pathValidation = await validateFilePath(params.file_path);
            if (!pathValidation.valid) {
                return pathValidation;
            }
        }

        // Validate glob patterns if present
        if (params.glob_patterns) {
            for (const pattern of params.glob_patterns) {
                const globValidation = validateGlobPattern(pattern);
                if (!globValidation.valid) {
                    return globValidation;
                }
            }
        }

        // Validate file count limits
        if (params.max_files) {
            const limitValidation = validateBatchLimits(params.max_files, 1000); // Stricter limit for safety
            if (!limitValidation.valid) {
                return limitValidation;
            }
        }

        return { valid: true };

    } catch (error: any) {
        logError("File operation validation failed", error, { operation, params, context });
        return {
            valid: false,
            error: `Validation error: ${error.message}`
        };
    }
}