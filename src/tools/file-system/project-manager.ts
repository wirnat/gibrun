import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { readdir, stat, readFile } from "fs/promises";
import { join, extname, relative, resolve, dirname, basename } from "path";
import { logError } from "@/services/logger-service.js";

export const PROJECT_FILE_MANAGER_TOOLS: Tool[] = [
    {
        name: "project_file_manager",
        description: "Advanced project file management with workspace awareness, dependency analysis, and intelligent file operations",
        inputSchema: {
            type: "object",
            properties: {
                operation: {
                    type: "string",
                    enum: ["analyze", "organize", "sync", "backup", "restore", "search", "dependencies", "structure"],
                    description: "Type of project management operation"
                },
                analyze: {
                    type: "object",
                    properties: {
                        analysis_type: {
                            type: "string",
                            enum: ["structure", "dependencies", "duplicates", "unused", "complexity"],
                            description: "Type of analysis to perform"
                        },
                        include_patterns: {
                            type: "array",
                            items: { type: "string" },
                            description: "File patterns to include"
                        },
                        exclude_patterns: {
                            type: "array",
                            items: { type: "string" },
                            description: "File patterns to exclude"
                        }
                    }
                },
                organize: {
                    type: "object",
                    properties: {
                        organization_type: {
                            type: "string",
                            enum: ["by_type", "by_feature", "by_layer", "alphabetical"],
                            description: "How to organize files"
                        },
                        target_directory: {
                            type: "string",
                            description: "Target directory for organization"
                        },
                        create_folders: {
                            type: "boolean",
                            description: "Create folder structure",
                            default: true
                        }
                    }
                },
                sync: {
                    type: "object",
                    properties: {
                        source_directory: {
                            type: "string",
                            description: "Source directory to sync from"
                        },
                        target_directory: {
                            type: "string",
                            description: "Target directory to sync to"
                        },
                        sync_mode: {
                            type: "string",
                            enum: ["mirror", "update", "backup"],
                            description: "Synchronization mode"
                        },
                        exclude_patterns: {
                            type: "array",
                            items: { type: "string" },
                            description: "Patterns to exclude from sync"
                        }
                    }
                },
                search: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            description: "Search query"
                        },
                        search_in: {
                            type: "array",
                            items: {
                                type: "string",
                                enum: ["content", "filename", "path"]
                            },
                            description: "Where to search"
                        },
                        file_types: {
                            type: "array",
                            items: { type: "string" },
                            description: "File types to search in"
                        },
                        use_regex: {
                            type: "boolean",
                            description: "Use regular expressions",
                            default: false
                        },
                        case_sensitive: {
                            type: "boolean",
                            description: "Case sensitive search",
                            default: false
                        }
                    }
                },
                dependencies: {
                    type: "object",
                    properties: {
                        analysis_type: {
                            type: "string",
                            enum: ["imports", "exports", "circular", "unused"],
                            description: "Type of dependency analysis"
                        },
                        language: {
                            type: "string",
                            enum: ["typescript", "javascript", "python", "go", "java"],
                            description: "Programming language for analysis"
                        }
                    }
                }
            },
            required: ["operation"]
        },
    },
];

export async function handleProjectFileManager(args: any) {
    const { operation } = args;

    try {
        let result;

        switch (operation) {
            case 'analyze':
                result = await performAnalysis(args.analyze);
                break;
            case 'organize':
                result = await performOrganization(args.organize);
                break;
            case 'sync':
                result = await performSync(args.sync);
                break;
            case 'search':
                result = await performSearch(args.search);
                break;
            case 'dependencies':
                result = await performDependencyAnalysis(args.dependencies);
                break;
            case 'structure':
                result = await analyzeProjectStructure(args);
                break;
            default:
                throw new Error(`Unknown operation: ${operation}`);
        }

        return {
            content: [{
                type: "text",
                text: JSON.stringify(result, null, 2)
            }]
        };

    } catch (error: any) {
        logError("project_file_manager failed", error, args);
        return {
            content: [{
                type: "text",
                text: JSON.stringify({
                    success: false,
                    error: error.message,
                    operation
                }, null, 2)
            }],
            isError: true
        };
    }
}

// Analysis operations
async function performAnalysis(params: any) {
    const { analysis_type, include_patterns = [], exclude_patterns = [] } = params;

    const projectRoot = process.cwd();
    const allFiles = await collectProjectFiles(projectRoot, include_patterns, exclude_patterns);

    switch (analysis_type) {
        case 'structure':
            return await analyzeProjectStructureInternal(allFiles, projectRoot);
        case 'dependencies':
            return await analyzeDependencies(allFiles);
        case 'duplicates':
            return await findDuplicateFiles(allFiles);
        case 'unused':
            return await findUnusedFiles(allFiles);
        case 'complexity':
            return await analyzeComplexity(allFiles);
        default:
            throw new Error(`Unknown analysis type: ${analysis_type}`);
    }
}

async function performOrganization(params: any) {
    const { organization_type, target_directory, create_folders = true } = params;

    const projectRoot = process.cwd();
    const allFiles = await collectProjectFiles(projectRoot, [], []);

    const organizationPlan = generateOrganizationPlan(allFiles, organization_type, target_directory);

    if (create_folders) {
        await createOrganizationFolders(organizationPlan, target_directory);
    }

    return {
        operation: 'organize',
        organization_type,
        target_directory,
        plan: organizationPlan,
        folders_created: create_folders,
        note: create_folders ? 'Folders created. Manual file movement required.' : 'Organization plan generated. No files moved.'
    };
}

async function performSync(params: any) {
    const { source_directory, target_directory, sync_mode, exclude_patterns = [] } = params;

    const sourceFiles = await collectProjectFiles(source_directory, [], exclude_patterns);
    const targetFiles = await collectProjectFiles(target_directory, [], exclude_patterns);

    const syncPlan = generateSyncPlan(sourceFiles, targetFiles, sync_mode);

    // For safety, we only generate the plan without executing
    return {
        operation: 'sync',
        source_directory,
        target_directory,
        sync_mode,
        plan: syncPlan,
        note: 'Sync plan generated. Use file operations to execute.'
    };
}

async function performSearch(params: any) {
    const { query, search_in = ['content'], file_types = [], use_regex = false, case_sensitive = false } = params;

    const projectRoot = process.cwd();
    const allFiles = await collectProjectFiles(projectRoot, [], []);

    const filteredFiles = file_types.length > 0
        ? allFiles.filter(file => file_types.includes(getFileType(file)))
        : allFiles;

    const results = [];

    for (const filePath of filteredFiles) {
        try {
            const matches = await searchInFile(filePath, query, search_in, use_regex, case_sensitive);
            if (matches.length > 0) {
                results.push({
                    file: relative(projectRoot, filePath),
                    matches
                });
            }
        } catch (error) {
            // Skip files that can't be read
        }
    }

    return {
        operation: 'search',
        query,
        search_in,
        file_types,
        total_matches: results.reduce((sum, r) => sum + r.matches.length, 0),
        files_with_matches: results.length,
        results
    };
}

async function performDependencyAnalysis(params: any) {
    const { analysis_type, language } = params;

    const projectRoot = process.cwd();
    const allFiles = await collectProjectFiles(projectRoot, [], []);

    const languageFiles = allFiles.filter(file => getFileType(file) === language);

    switch (analysis_type) {
        case 'imports':
            return await analyzeImports(languageFiles, language);
        case 'exports':
            return await analyzeExports(languageFiles, language);
        case 'circular':
            return await detectCircularDependencies(languageFiles, language);
        case 'unused':
            return await findUnusedImports(languageFiles, language);
        default:
            throw new Error(`Unknown dependency analysis type: ${analysis_type}`);
    }
}

// Helper functions
async function collectProjectFiles(rootDir: string, includePatterns: string[], excludePatterns: string[]): Promise<string[]> {
    const files: string[] = [];

    async function walk(dir: string): Promise<void> {
        const items = await readdir(dir, { withFileTypes: true });

        for (const item of items) {
            const fullPath = join(dir, item.name);

            if (item.isDirectory()) {
                // Skip common exclude directories
                if (!['node_modules', '.git', 'dist', 'build', '.next'].includes(item.name)) {
                    await walk(fullPath);
                }
            } else if (item.isFile()) {
                const relativePath = relative(rootDir, fullPath);

                // Check exclude patterns
                const shouldExclude = excludePatterns.some(pattern =>
                    relativePath.includes(pattern) || matchesPattern(relativePath, pattern)
                );

                if (!shouldExclude) {
                    // Check include patterns (if specified)
                    const shouldInclude = includePatterns.length === 0 ||
                        includePatterns.some(pattern => matchesPattern(relativePath, pattern));

                    if (shouldInclude) {
                        files.push(fullPath);
                    }
                }
            }
        }
    }

    await walk(rootDir);
    return files;
}

function matchesPattern(filename: string, pattern: string): boolean {
    const regex = pattern
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.')
        .replace(/\./g, '\\.');

    return new RegExp(`^${regex}$`).test(filename);
}

function getFileType(filePath: string): string {
    const ext = extname(filePath).toLowerCase();

    const typeMap: { [key: string]: string } = {
        '.ts': 'typescript',
        '.tsx': 'typescript',
        '.js': 'javascript',
        '.jsx': 'javascript',
        '.json': 'json',
        '.py': 'python',
        '.go': 'go',
        '.java': 'java'
    };

    return typeMap[ext] || 'unknown';
}

async function analyzeProjectStructureInternal(files: string[], projectRoot: string) {
    const structure: any = {
        directories: {},
        file_types: {},
        total_files: files.length,
        total_size: 0
    };

    for (const file of files) {
        const relativePath = relative(projectRoot, file);
        const stats = await stat(file);
        const fileType = getFileType(file);

        structure.total_size += stats.size;

        // Count file types
        structure.file_types[fileType] = (structure.file_types[fileType] || 0) + 1;

        // Build directory structure
        const dir = dirname(relativePath);
        if (dir !== '.') {
            structure.directories[dir] = (structure.directories[dir] || 0) + 1;
        }
    }

    return {
        analysis_type: 'structure',
        ...structure
    };
}

async function analyzeDependencies(files: string[]): Promise<any> {
    // Basic dependency analysis - could be expanded
    const dependencies = {
        total_files: files.length,
        by_type: {} as { [key: string]: number }
    };

    for (const file of files) {
        const fileType = getFileType(file);
        dependencies.by_type[fileType] = (dependencies.by_type[fileType] || 0) + 1;
    }

    return {
        analysis_type: 'dependencies',
        ...dependencies
    };
}

async function findDuplicateFiles(files: string[]): Promise<any> {
    const fileHashes: { [key: string]: string[] } = {};
    const duplicates: any[] = [];

    // This is a simplified implementation
    // In practice, you'd calculate file hashes
    for (const file of files) {
        const stats = await stat(file);
        const key = `${stats.size}`;

        if (!fileHashes[key]) {
            fileHashes[key] = [];
        }
        fileHashes[key].push(file);
    }

    for (const [size, fileList] of Object.entries(fileHashes)) {
        if (fileList.length > 1) {
            duplicates.push({
                size: parseInt(size),
                files: fileList.map(f => relative(process.cwd(), f))
            });
        }
    }

    return {
        analysis_type: 'duplicates',
        duplicate_groups: duplicates,
        total_duplicate_groups: duplicates.length
    };
}

async function findUnusedFiles(files: string[]): Promise<any> {
    // Simplified unused file detection
    // In practice, this would analyze imports/usage
    const unused = [];

    for (const file of files) {
        const relativePath = relative(process.cwd(), file);
        // Simple heuristic: files in certain directories might be unused
        if (relativePath.includes('old') || relativePath.includes('temp')) {
            unused.push(relativePath);
        }
    }

    return {
        analysis_type: 'unused',
        potentially_unused_files: unused,
        note: 'This is a basic heuristic. Manual review recommended.'
    };
}

async function analyzeComplexity(files: string[]): Promise<any> {
    const complexity = {
        total_files: files.length,
        average_complexity: 0,
        files_by_complexity: {
            low: 0,
            medium: 0,
            high: 0
        }
    };

    // Simplified complexity analysis
    for (const file of files) {
        try {
            const content = await readFile(file, 'utf8');
            const lines = content.split('\n').length;
            const functions = (content.match(/function\s+\w+/g) || []).length;

            const score = lines + functions * 10;

            if (score < 100) complexity.files_by_complexity.low++;
            else if (score < 500) complexity.files_by_complexity.medium++;
            else complexity.files_by_complexity.high++;
        } catch (error) {
            // Skip files that can't be read
        }
    }

    return {
        analysis_type: 'complexity',
        ...complexity
    };
}

function generateOrganizationPlan(files: string[], type: string, targetDir: string): any {
    const plan: any = {
        moves: [],
        folders_to_create: []
    };

    for (const file of files) {
        const relativePath = relative(process.cwd(), file);
        let newPath = relativePath;

        switch (type) {
            case 'by_type':
                const ext = extname(file).slice(1) || 'noext';
                newPath = join(targetDir, ext, relativePath);
                plan.folders_to_create.push(join(targetDir, ext));
                break;
            case 'alphabetical':
                const firstLetter = relativePath.charAt(0).toUpperCase();
                newPath = join(targetDir, firstLetter, relativePath);
                plan.folders_to_create.push(join(targetDir, firstLetter));
                break;
        }

        plan.moves.push({
            from: relativePath,
            to: newPath
        });
    }

    // Remove duplicate folders
    plan.folders_to_create = [...new Set(plan.folders_to_create)];

    return plan;
}

async function createOrganizationFolders(plan: any, targetDir: string): Promise<void> {
    const { mkdir } = await import("fs/promises");

    for (const folder of plan.folders_to_create) {
        try {
            await mkdir(folder, { recursive: true });
        } catch (error) {
            // Folder might already exist
        }
    }
}

function generateSyncPlan(sourceFiles: string[], targetFiles: string[], mode: string): any {
    const plan = {
        to_copy: [] as string[],
        to_update: [] as string[],
        to_delete: [] as string[],
        conflicts: [] as any[]
    };

    // Simplified sync planning
    const sourceMap = new Map(sourceFiles.map(f => [relative(process.cwd(), f), f]));
    const targetMap = new Map(targetFiles.map(f => [relative(process.cwd(), f), f]));

    for (const [relPath, sourcePath] of sourceMap) {
        const targetPath = targetMap.get(relPath);

        if (!targetPath) {
            plan.to_copy.push(relPath);
        } else {
            // Check if needs update
            plan.to_update.push(relPath);
        }
    }

    return plan;
}

async function searchInFile(filePath: string, query: string, searchIn: string[], useRegex: boolean, caseSensitive: boolean): Promise<any[]> {
    const content = await readFile(filePath, 'utf8');
    const matches: any[] = [];

    for (const location of searchIn) {
        if (location === 'content') {
            const lines = content.split('\n');
            lines.forEach((line, index) => {
                if (matchesQuery(line, query, useRegex, caseSensitive)) {
                    matches.push({
                        line: index + 1,
                        content: line.trim(),
                        type: 'content'
                    });
                }
            });
        } else if (location === 'filename') {
            const filename = basename(filePath);
            if (matchesQuery(filename, query, useRegex, caseSensitive)) {
                matches.push({
                    content: filename,
                    type: 'filename'
                });
            }
        }
    }

    return matches;
}

function matchesQuery(text: string, query: string, useRegex: boolean, caseSensitive: boolean): boolean {
    if (useRegex) {
        const flags = caseSensitive ? 'g' : 'gi';
        return new RegExp(query, flags).test(text);
    } else {
        const searchText = caseSensitive ? text : text.toLowerCase();
        const searchQuery = caseSensitive ? query : query.toLowerCase();
        return searchText.includes(searchQuery);
    }
}

async function analyzeImports(files: string[], language: string): Promise<any> {
    const imports: any = {
        total_imports: 0,
        by_module: {} as { [key: string]: number },
        external_dependencies: [] as string[],
        internal_dependencies: [] as string[]
    };

    for (const file of files) {
        try {
            const content = await readFile(file, 'utf8');
            const fileImports = extractImports(content, language);

            imports.total_imports += fileImports.length;

            for (const imp of fileImports) {
                imports.by_module[imp] = (imports.by_module[imp] || 0) + 1;

                if (imp.startsWith('.') || imp.startsWith('/')) {
                    imports.internal_dependencies.push(imp);
                } else {
                    imports.external_dependencies.push(imp);
                }
            }
        } catch (error) {
            // Skip files that can't be read
        }
    }

    // Remove duplicates
    imports.external_dependencies = [...new Set(imports.external_dependencies)];
    imports.internal_dependencies = [...new Set(imports.internal_dependencies)];

    return {
        analysis_type: 'imports',
        language,
        ...imports
    };
}

function extractImports(content: string, language: string): string[] {
    const imports: string[] = [];

    if (language === 'typescript' || language === 'javascript') {
        // Match import statements
        const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
        let match;
        while ((match = importRegex.exec(content)) !== null) {
            imports.push(match[1]);
        }

        // Match require statements
        const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
        while ((match = requireRegex.exec(content)) !== null) {
            imports.push(match[1]);
        }
    }

    return imports;
}

async function analyzeExports(files: string[], language: string): Promise<any> {
    const exports: any = {
        total_exports: 0,
        by_type: {
            named: 0,
            default: 0,
            all: 0
        },
        exported_symbols: []
    };

    // Simplified export analysis
    for (const file of files) {
        try {
            const content = await readFile(file, 'utf8');

            if (language === 'typescript' || language === 'javascript') {
                if (content.includes('export default')) exports.by_type.default++;
                if (content.includes('export {')) exports.by_type.named++;
                if (content.includes('export *')) exports.by_type.all++;

                exports.total_exports++;
            }
        } catch (error) {
            // Skip files that can't be read
        }
    }

    return {
        analysis_type: 'exports',
        language,
        ...exports
    };
}

async function detectCircularDependencies(files: string[], language: string): Promise<any> {
    // Simplified circular dependency detection
    const dependencies: { [key: string]: string[] } = {};

    for (const file of files) {
        try {
            const content = await readFile(file, 'utf8');
            const imports = extractImports(content, language);
            const relativePath = relative(process.cwd(), file);
            dependencies[relativePath] = imports.filter(imp => imp.startsWith('./') || imp.startsWith('../'));
        } catch (error) {
            // Skip files that can't be read
        }
    }

    // Simple cycle detection (very basic)
    const circular_deps: string[][] = [];

    for (const [file, deps] of Object.entries(dependencies)) {
        for (const dep of deps) {
            // Check if dependency imports back
            const resolvedDep = resolve(dirname(file), dep);
            if (dependencies[resolvedDep]?.includes(file)) {
                circular_deps.push([file, resolvedDep]);
            }
        }
    }

    return {
        analysis_type: 'circular',
        language,
        circular_dependencies: circular_deps,
        total_circular_groups: circular_deps.length
    };
}

async function findUnusedImports(files: string[], language: string): Promise<any> {
    // Simplified unused import detection
    const unused: any[] = [];

    for (const file of files) {
        try {
            const content = await readFile(file, 'utf8');
            const imports = extractImports(content, language);

            for (const imp of imports) {
                // Simple heuristic: check if import is used in file
                const importName = imp.split('/').pop()?.split('.')[0];
                if (importName && !content.includes(importName)) {
                    unused.push({
                        file: relative(process.cwd(), file),
                        import: imp,
                        suspected_unused: importName
                    });
                }
            }
        } catch (error) {
            // Skip files that can't be read
        }
    }

    return {
        analysis_type: 'unused_imports',
        language,
        potentially_unused: unused,
        note: 'This uses simple heuristics. Manual verification recommended.'
    };
}

async function analyzeProjectStructure(args: any) {
    const projectRoot = process.cwd();
    const allFiles = await collectProjectFiles(projectRoot, [], []);

    return await analyzeProjectStructureInternal(allFiles, projectRoot);
}