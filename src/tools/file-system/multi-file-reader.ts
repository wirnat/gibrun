import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { readFile, stat, readdir } from "fs/promises";
import { join, extname, relative, resolve } from "path";
import { logError } from "@/services/logger-service.js";
import { validateFileOperation, validateBatchLimits, FileOperationContext } from "./validation.js";

export const MULTI_FILE_READER_TOOLS: Tool[] = [
    {
        name: "multi_file_reader",
        description: "Read multiple files simultaneously with advanced filtering and processing options",
        inputSchema: {
            type: "object",
            properties: {
                paths: {
                    type: "array",
                    items: { type: "string" },
                    description: "Array of file paths to read"
                },
                glob_patterns: {
                    type: "array",
                    items: { type: "string" },
                    description: "Glob patterns to match files (e.g., ['src/**/*.ts', 'test/**/*.test.ts'])"
                },
                exclude_patterns: {
                    type: "array",
                    items: { type: "string" },
                    description: "Patterns to exclude from results"
                },
                file_types: {
                    type: "array",
                    items: {
                        type: "string",
                        enum: ["typescript", "javascript", "json", "markdown", "yaml", "xml", "html", "css", "python", "go", "java", "cpp", "c", "rust", "php", "ruby", "shell", "dockerfile", "gitignore", "readme"]
                    },
                    description: "Filter by file types"
                },
                max_file_size: {
                    type: "number",
                    description: "Maximum file size in bytes (default: 1MB)",
                    default: 1048576
                },
                max_files: {
                    type: "number",
                    description: "Maximum number of files to read (default: 50)",
                    default: 50
                },
                include_content: {
                    type: "boolean",
                    description: "Include file content in response (default: true)",
                    default: true
                },
                include_metadata: {
                    type: "boolean",
                    description: "Include file metadata (size, modified time, etc.)",
                    default: true
                },
                recursive: {
                    type: "boolean",
                    description: "Recursively search directories",
                    default: true
                },
                base_directory: {
                    type: "string",
                    description: "Base directory for relative paths",
                    default: "."
                }
            }
        },
    },
];

export async function handleMultiFileReader(args: any) {
    const {
        paths = [],
        glob_patterns = [],
        exclude_patterns = [],
        file_types = [],
        max_file_size = 1048576, // 1MB
        max_files = 50,
        include_content = true,
        include_metadata = true,
        recursive = true,
        base_directory = "."
    } = args;

    // Validate operation
    const context: FileOperationContext = {
        operation: 'multi_file_reader',
        timestamp: new Date()
    };

    const validation = await validateFileOperation('multi_file_reader', args, context);
    if (!validation.valid) {
        return {
            content: [{
                type: "text",
                text: JSON.stringify({
                    success: false,
                    error: validation.error
                }, null, 2)
            }],
            isError: true
        };
    }

    // Validate batch limits
    const batchValidation = validateBatchLimits(max_files, 200); // Allow higher limit for reading
    if (!batchValidation.valid) {
        return {
            content: [{
                type: "text",
                text: JSON.stringify({
                    success: false,
                    error: batchValidation.error
                }, null, 2)
            }],
            isError: true
        };
    }

    try {
        // Collect all file paths
        let allFiles: string[] = [];

        // Add explicit paths
        if (paths.length > 0) {
            allFiles.push(...paths.map((path: string) => resolve(base_directory, path)));
        }

        // Process glob patterns
        if (glob_patterns.length > 0) {
            for (const pattern of glob_patterns) {
                const matchedFiles = await matchGlobPattern(pattern, base_directory, recursive);
                allFiles.push(...matchedFiles);
            }
        }

        // Remove duplicates
        allFiles = [...new Set(allFiles)];

        // Apply filters
        let filteredFiles = await filterFiles(allFiles, {
            exclude_patterns,
            file_types,
            max_file_size
        });

        // Limit number of files
        if (filteredFiles.length > max_files) {
            filteredFiles = filteredFiles.slice(0, max_files);
        }

        // Read files
        const fileResults = [];
        const errors = [];

        for (const filePath of filteredFiles) {
            try {
                const fileData = await readFileData(filePath, {
                    include_content,
                    include_metadata
                });
                fileResults.push(fileData);
            } catch (error: any) {
                errors.push({
                    file: filePath,
                    error: error.message
                });
            }
        }

        // Calculate summary
        const summary = {
            total_files: filteredFiles.length,
            successful_reads: fileResults.length,
            failed_reads: errors.length,
            total_size: fileResults.reduce((sum, file) => sum + (file.metadata?.size || 0), 0),
            file_types: [...new Set(fileResults.map(f => f.metadata?.type).filter(Boolean))],
            errors: errors.length > 0 ? errors : undefined
        };

        return {
            content: [{
                type: "text",
                text: JSON.stringify({
                    files: fileResults,
                    summary
                }, null, 2)
            }]
        };

    } catch (error: any) {
        logError("multi_file_reader failed", error, args);
        return {
            content: [{
                type: "text",
                text: JSON.stringify({
                    success: false,
                    error: error.message,
                    args
                }, null, 2)
            }],
            isError: true
        };
    }
}

// Helper function to match glob patterns (simple implementation)
async function matchGlobPattern(pattern: string, baseDir: string, recursive: boolean): Promise<string[]> {
    const results: string[] = [];

    // Simple glob implementation - supports **/* and basic patterns
    const parts = pattern.split('/');
    const basePath = resolve(baseDir);

    await collectFiles(basePath, parts, 0, results, recursive);

    return results;
}

async function collectFiles(dir: string, patternParts: string[], partIndex: number, results: string[], recursive: boolean): Promise<void> {
    if (partIndex >= patternParts.length) {
        return;
    }

    const currentPart = patternParts[partIndex];
    const isLastPart = partIndex === patternParts.length - 1;

    try {
        const items = await readdir(dir, { withFileTypes: true });

        for (const item of items) {
            const fullPath = join(dir, item.name);

            // Check if matches current pattern part
            if (matchesPattern(item.name, currentPart)) {
                if (isLastPart) {
                    // This is a file match
                    if (item.isFile()) {
                        results.push(fullPath);
                    }
                } else {
                    // Continue with next part
                    if (item.isDirectory()) {
                        await collectFiles(fullPath, patternParts, partIndex + 1, results, recursive);
                    }
                }
            } else if (currentPart === '**' && recursive && item.isDirectory()) {
                // Handle ** recursive matching
                await collectFiles(fullPath, patternParts, partIndex, results, recursive);
                if (!isLastPart) {
                    await collectFiles(fullPath, patternParts, partIndex + 1, results, recursive);
                }
            }
        }
    } catch (error) {
        // Skip directories we can't read
    }
}

function matchesPattern(filename: string, pattern: string): boolean {
    // Simple pattern matching - supports * and basic patterns
    if (pattern === '*') return true;
    if (pattern === '**') return true;

    // Convert glob to regex
    const regex = pattern
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.')
        .replace(/\./g, '\\.');

    return new RegExp(`^${regex}$`).test(filename);
}

// Filter files based on criteria
async function filterFiles(files: string[], filters: {
    exclude_patterns: string[],
    file_types: string[],
    max_file_size: number
}): Promise<string[]> {
    const filtered: string[] = [];

    for (const file of files) {
        try {
            // Check exclude patterns
            const relativePath = relative(process.cwd(), file);
            const shouldExclude = filters.exclude_patterns.some(pattern =>
                relativePath.includes(pattern) || matchesPattern(relativePath, pattern)
            );

            if (shouldExclude) continue;

            // Check file type
            if (filters.file_types.length > 0) {
                const fileType = getFileType(file);
                if (!filters.file_types.includes(fileType)) continue;
            }

            // Check file size
            const stats = await stat(file);
            if (stats.size > filters.max_file_size) continue;

            // Check if it's actually a file
            if (!stats.isFile()) continue;

            filtered.push(file);
        } catch (error) {
            // Skip files we can't access
        }
    }

    return filtered;
}

function getFileType(filePath: string): string {
    const ext = extname(filePath).toLowerCase();

    const typeMap: { [key: string]: string } = {
        '.ts': 'typescript',
        '.tsx': 'typescript',
        '.js': 'javascript',
        '.jsx': 'javascript',
        '.json': 'json',
        '.md': 'markdown',
        '.yaml': 'yaml',
        '.yml': 'yaml',
        '.xml': 'xml',
        '.html': 'html',
        '.css': 'css',
        '.py': 'python',
        '.go': 'go',
        '.java': 'java',
        '.cpp': 'cpp',
        '.c': 'c',
        '.rs': 'rust',
        '.php': 'php',
        '.rb': 'ruby',
        '.sh': 'shell',
        '.bash': 'shell',
        '.dockerfile': 'dockerfile',
        '.gitignore': 'gitignore',
        'readme': 'readme'
    };

    // Special case for README files
    if (filePath.toLowerCase().includes('readme')) {
        return 'readme';
    }

    return typeMap[ext] || 'unknown';
}

// Read file data with options
async function readFileData(filePath: string, options: {
    include_content: boolean,
    include_metadata: boolean
}): Promise<any> {
    const stats = await stat(filePath);
    const relativePath = relative(process.cwd(), filePath);

    const result: any = {
        path: relativePath
    };

    if (options.include_metadata) {
        result.metadata = {
            size: stats.size,
            modified: stats.mtime.toISOString(),
            type: getFileType(filePath),
            lines: 0 // Will be calculated if content is read
        };
    }

    if (options.include_content) {
        const content = await readFile(filePath, 'utf8');
        result.content = content;

        if (options.include_metadata) {
            result.metadata.lines = content.split('\n').length;
        }
    }

    return result;
}