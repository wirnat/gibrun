import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { readFile, writeFile, copyFile } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname, basename } from "path";
import { logError } from "@/services/logger-service.js";
import { validateFileOperation, validateBatchLimits, FileOperationContext, createAuditLog } from "./validation.js";

export const MULTI_FILE_EDITOR_TOOLS: Tool[] = [
    {
        name: "multi_file_editor",
        description: "Perform batch editing operations across multiple files with search/replace, content insertion, and transformation capabilities",
        inputSchema: {
            type: "object",
            properties: {
                operation: {
                    type: "string",
                    enum: ["search_replace", "insert", "delete", "transform", "rename"],
                    description: "Type of editing operation"
                },
                target_files: {
                    type: "object",
                    properties: {
                        paths: {
                            type: "array",
                            items: { type: "string" },
                            description: "Specific file paths"
                        },
                        glob_patterns: {
                            type: "array",
                            items: { type: "string" },
                            description: "Glob patterns to match files"
                        },
                        exclude_patterns: {
                            type: "array",
                            items: { type: "string" },
                            description: "Patterns to exclude"
                        }
                    }
                },
                search_replace: {
                    type: "object",
                    properties: {
                        find: {
                            type: "string",
                            description: "Text to find (supports regex)"
                        },
                        replace: {
                            type: "string",
                            description: "Text to replace with"
                        },
                        use_regex: {
                            type: "boolean",
                            description: "Use regular expressions",
                            default: false
                        },
                        case_sensitive: {
                            type: "boolean",
                            description: "Case sensitive matching",
                            default: true
                        },
                        whole_word: {
                            type: "boolean",
                            description: "Match whole words only",
                            default: false
                        }
                    }
                },
                insert: {
                    type: "object",
                    properties: {
                        position: {
                            type: "string",
                            enum: ["beginning", "end", "after_line", "before_line", "at_line"],
                            description: "Where to insert content"
                        },
                        content: {
                            type: "string",
                            description: "Content to insert"
                        },
                        line_number: {
                            type: "number",
                            description: "Line number for position-based insertion"
                        },
                        after_pattern: {
                            type: "string",
                            description: "Pattern to insert after"
                        }
                    }
                },
                transform: {
                    type: "object",
                    properties: {
                        transformation_type: {
                            type: "string",
                            enum: ["uppercase", "lowercase", "capitalize", "trim", "indent", "dedent"],
                            description: "Type of text transformation"
                        },
                        apply_to: {
                            type: "string",
                            enum: ["entire_file", "lines", "matches"],
                            description: "What to transform"
                        }
                    }
                },
                rename: {
                    type: "object",
                    properties: {
                        new_name_pattern: {
                            type: "string",
                            description: "New name pattern (supports {filename}, {ext}, {dirname})"
                        },
                        preserve_extension: {
                            type: "boolean",
                            description: "Keep original file extension",
                            default: true
                        }
                    }
                },
                options: {
                    type: "object",
                    properties: {
                        create_backup: {
                            type: "boolean",
                            description: "Create backup files before editing",
                            default: true
                        },
                        dry_run: {
                            type: "boolean",
                            description: "Preview changes without applying them",
                            default: false
                        },
                        max_files: {
                            type: "number",
                            description: "Maximum files to process",
                            default: 10
                        }
                    }
                }
            },
            required: ["operation", "target_files"]
        },
    },
];

export async function handleMultiFileEditor(args: any) {
    const {
        operation,
        target_files,
        search_replace,
        insert,
        transform,
        rename,
        options = {}
    } = args;

    const {
        create_backup = true,
        dry_run = false,
        max_files = 10
    } = options;

    // Validate operation
    const context: FileOperationContext = {
        operation: 'multi_file_editor',
        timestamp: new Date()
    };

    const validation = await validateFileOperation(operation, args, context);
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

    // Validate batch limits for editing operations (stricter limits)
    const batchValidation = validateBatchLimits(max_files, 50); // Stricter limit for editing
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
        // Collect target files
        let targetFilePaths: string[] = [];

        if (target_files.paths && target_files.paths.length > 0) {
            targetFilePaths.push(...target_files.paths);
        }

        if (target_files.glob_patterns && target_files.glob_patterns.length > 0) {
            // Use simple glob implementation (reuse from multi-file-reader)
            for (const pattern of target_files.glob_patterns) {
                const matchedFiles = await matchGlobPattern(pattern, ".", true);
                targetFilePaths.push(...matchedFiles);
            }
        }

        // Remove duplicates and apply exclusions
        targetFilePaths = [...new Set(targetFilePaths)];
        targetFilePaths = targetFilePaths.filter((path: string) => {
            return !target_files.exclude_patterns?.some((pattern: string) =>
                path.includes(pattern) || matchesPattern(path, pattern)
            );
        });

        // Limit files
        if (targetFilePaths.length > max_files) {
            targetFilePaths = targetFilePaths.slice(0, max_files);
        }

        // Process files based on operation
        const results = [];
        const errors = [];

        for (const filePath of targetFilePaths) {
            try {
                const result = await processFileOperation(filePath, operation, {
                    search_replace,
                    insert,
                    transform,
                    rename
                }, { create_backup, dry_run });

                results.push(result);
            } catch (error: any) {
                errors.push({
                    file: filePath,
                    error: error.message
                });
            }
        }

        // Calculate summary
        const summary = {
            operation,
            total_files: targetFilePaths.length,
            successful_operations: results.length,
            failed_operations: errors.length,
            dry_run,
            changes_made: dry_run ? 0 : results.filter(r => r.modified).length,
            backups_created: create_backup && !dry_run ? results.filter(r => r.backup_created).length : 0,
            errors: errors.length > 0 ? errors : undefined
        };

        return {
            content: [{
                type: "text",
                text: JSON.stringify({
                    results,
                    summary
                }, null, 2)
            }]
        };

    } catch (error: any) {
        logError("multi_file_editor failed", error, args);
        return {
            content: [{
                type: "text",
                text: JSON.stringify({
                    success: false,
                    error: error.message,
                    operation,
                    args
                }, null, 2)
            }],
            isError: true
        };
    }
}

// Helper function to match glob patterns (reuse from multi-file-reader)
async function matchGlobPattern(pattern: string, baseDir: string, recursive: boolean): Promise<string[]> {
    const results: string[] = [];
    const parts = pattern.split('/');
    const basePath = join(process.cwd(), baseDir);

    await collectFiles(basePath, parts, 0, results, recursive);
    return results;
}

async function collectFiles(dir: string, patternParts: string[], partIndex: number, results: string[], recursive: boolean): Promise<void> {
    if (partIndex >= patternParts.length) return;

    const currentPart = patternParts[partIndex];
    const isLastPart = partIndex === patternParts.length - 1;

    try {
        const { readdir } = await import("fs/promises");
        const items = await readdir(dir, { withFileTypes: true });

        for (const item of items) {
            const fullPath = join(dir, item.name);

            if (matchesPattern(item.name, currentPart)) {
                if (isLastPart) {
                    if (item.isFile()) {
                        results.push(fullPath);
                    }
                } else {
                    if (item.isDirectory()) {
                        await collectFiles(fullPath, patternParts, partIndex + 1, results, recursive);
                    }
                }
            } else if (currentPart === '**' && recursive && item.isDirectory()) {
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
    if (pattern === '*') return true;
    if (pattern === '**') return true;

    const regex = pattern
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.')
        .replace(/\./g, '\\.');

    return new RegExp(`^${regex}$`).test(filename);
}

// Process individual file operation
async function processFileOperation(
    filePath: string,
    operation: string,
    params: any,
    options: { create_backup: boolean, dry_run: boolean }
): Promise<any> {
    const { create_backup, dry_run } = options;

    // Check if file exists
    if (!existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }

    let backupCreated = false;
    let modified = false;
    let changes: any[] = [];

    // Create backup if requested
    if (create_backup && !dry_run) {
        const backupPath = `${filePath}.backup.${Date.now()}`;
        await copyFile(filePath, backupPath);
        backupCreated = true;
    }

    // Read current content
    const originalContent = await readFile(filePath, 'utf8');
    let newContent = originalContent;

    // Apply operation
    switch (operation) {
        case 'search_replace':
            ({ content: newContent, changes } = await applySearchReplace(originalContent, params.search_replace));
            break;

        case 'insert':
            ({ content: newContent, changes } = await applyInsert(originalContent, params.insert));
            break;

        case 'delete':
            ({ content: newContent, changes } = await applyDelete(originalContent));
            break;

        case 'transform':
            ({ content: newContent, changes } = await applyTransform(originalContent, params.transform));
            break;

        case 'rename':
            return await applyRename(filePath, params.rename, options);

        default:
            throw new Error(`Unknown operation: ${operation}`);
    }

    // Write changes if not dry run and content changed
    if (!dry_run && newContent !== originalContent) {
        await writeFile(filePath, newContent, 'utf8');
        modified = true;
    }

    return {
        file: filePath,
        operation,
        modified,
        backup_created: backupCreated,
        changes_count: changes.length,
        changes: dry_run ? changes : undefined, // Only include changes in dry run
        preview: dry_run && newContent !== originalContent ? {
            original_length: originalContent.length,
            new_length: newContent.length,
            diff_length: newContent.length - originalContent.length
        } : undefined
    };
}

// Search and replace implementation
async function applySearchReplace(content: string, params: any): Promise<{ content: string, changes: any[] }> {
    const { find, replace, use_regex = false, case_sensitive = true, whole_word = false } = params;

    let regex: RegExp;
    if (use_regex) {
        regex = new RegExp(find, case_sensitive ? 'g' : 'gi');
    } else {
        let pattern = find;
        if (whole_word) {
            pattern = `\\b${pattern}\\b`;
        }
        regex = new RegExp(pattern, case_sensitive ? 'g' : 'gi');
    }

    const changes: any[] = [];
    let match;
    let lastIndex = 0;

    // Find all matches for reporting
    while ((match = regex.exec(content)) !== null) {
        changes.push({
            position: match.index,
            length: match[0].length,
            original: match[0],
            replacement: replace
        });
        // Prevent infinite loop
        if (match.index === regex.lastIndex) {
            regex.lastIndex++;
        }
    }

    const newContent = content.replace(regex, replace);

    return { content: newContent, changes };
}

// Insert implementation
async function applyInsert(content: string, params: any): Promise<{ content: string, changes: any[] }> {
    const { position, content: insertContent, line_number, after_pattern } = params;

    const lines = content.split('\n');
    let insertIndex = 0;

    switch (position) {
        case 'beginning':
            insertIndex = 0;
            break;
        case 'end':
            insertIndex = lines.length;
            break;
        case 'at_line':
            insertIndex = Math.max(0, Math.min(line_number - 1, lines.length));
            break;
        case 'after_line':
            if (line_number) {
                insertIndex = Math.min(line_number, lines.length);
            }
            break;
        case 'before_line':
            if (line_number) {
                insertIndex = Math.max(0, line_number - 1);
            }
            break;
        default:
            throw new Error(`Unknown position: ${position}`);
    }

    if (after_pattern) {
        // Find line containing pattern
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(after_pattern)) {
                insertIndex = i + 1;
                break;
            }
        }
    }

    lines.splice(insertIndex, 0, insertContent);
    const newContent = lines.join('\n');

    return {
        content: newContent,
        changes: [{
            type: 'insert',
            position: insertIndex,
            content: insertContent
        }]
    };
}

// Delete implementation (placeholder - would need more specific params)
async function applyDelete(content: string): Promise<{ content: string, changes: any[] }> {
    // This would need specific delete parameters (range, pattern, etc.)
    // For now, return unchanged
    return { content, changes: [] };
}

// Transform implementation
async function applyTransform(content: string, params: any): Promise<{ content: string, changes: any[] }> {
    const { transformation_type, apply_to } = params;

    let newContent = content;

    switch (transformation_type) {
        case 'uppercase':
            newContent = apply_to === 'entire_file' ? content.toUpperCase() : content;
            break;
        case 'lowercase':
            newContent = apply_to === 'entire_file' ? content.toLowerCase() : content;
            break;
        case 'trim':
            newContent = content.trim();
            break;
        // Add more transformations as needed
    }

    return {
        content: newContent,
        changes: newContent !== content ? [{
            type: 'transform',
            transformation: transformation_type,
            applied_to: apply_to
        }] : []
    };
}

// Rename implementation
async function applyRename(filePath: string, params: any, options: any): Promise<any> {
    const { new_name_pattern, preserve_extension = true } = params;
    const { dry_run } = options;

    const dir = dirname(filePath);
    const filename = basename(filePath);
    const ext = filename.includes('.') ? filename.split('.').pop() : '';

    let newFilename = new_name_pattern
        .replace('{filename}', filename.replace(/\.[^/.]+$/, ""))
        .replace('{ext}', ext)
        .replace('{dirname}', basename(dir));

    if (preserve_extension && ext && !newFilename.includes('.')) {
        newFilename += `.${ext}`;
    }

    const newPath = join(dir, newFilename);

    if (!dry_run) {
        // Use fs.rename or copy+delete for cross-filesystem support
        await copyFile(filePath, newPath);
        // Note: In production, you might want to delete the old file
        // But for safety, we'll keep it for now
    }

    return {
        file: filePath,
        operation: 'rename',
        modified: !dry_run,
        new_path: newPath,
        changes: [{
            type: 'rename',
            original: filename,
            new: newFilename
        }]
    };
}