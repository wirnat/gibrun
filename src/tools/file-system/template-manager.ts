import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { readFile, writeFile, mkdir, readdir, stat } from "fs/promises";
import { join, dirname, basename, resolve } from "path";
import { existsSync } from "fs";
import { logError } from "@/services/logger-service.js";
import { validateFilePath } from "./validation.js";

export const FILE_TEMPLATE_MANAGER_TOOLS: Tool[] = [
    {
        name: "file_template_manager",
        description: "Manage and apply code templates within MCP workspace",
        inputSchema: {
            type: "object",
            properties: {
                operation: {
                    type: "string",
                    enum: ["list", "apply", "create", "validate"],
                    description: "Template management operation"
                },
                category: {
                    type: "string",
                    enum: ["api", "database", "test", "config"],
                    description: "Template category"
                },
                template: {
                    type: "string",
                    description: "Template name/path within workspace (.gibrun/templates/)"
                },
                variables: {
                    type: "object",
                    description: "Variable substitution values",
                    additionalProperties: true
                },
                output_path: {
                    type: "string",
                    description: "Output file path within workspace"
                },
                create_dirs: {
                    type: "boolean",
                    description: "Create parent directories if needed",
                    default: true
                }
            },
            required: ["operation"]
        },
    },
];

interface TemplateConfig {
    templates: {
        enabled: boolean;
        basePath: string;
        categories: {
            [category: string]: {
                description: string;
                variables: string[];
                defaultFramework?: string;
            };
        };
    };
    project: {
        name: string;
        framework: string;
        database: string;
    };
}

interface TemplateInfo {
    name: string;
    path: string;
    category: string;
    variables: string[];
    description?: string;
}

export async function handleFileTemplateManager(args: any) {
    const { operation } = args;

    try {
        switch (operation) {
            case 'list':
                return await handleListTemplates(args);
            case 'apply':
                return await handleApplyTemplate(args);
            case 'create':
                return await handleCreateTemplate(args);
            case 'validate':
                return await handleValidateTemplate(args);
            default:
                throw new Error(`Unknown operation: ${operation}`);
        }
    } catch (error: any) {
        logError("file_template_manager failed", error, args);
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

async function handleListTemplates(args: any) {
    const { category } = args;
    const workspaceRoot = process.cwd();

    // Load config
    const config = await loadTemplateConfig(workspaceRoot);

    if (!config.templates.enabled) {
        return {
            content: [{
                type: "text",
                text: JSON.stringify({
                    success: false,
                    error: "Templates are disabled in configuration"
                }, null, 2)
            }],
            isError: true
        };
    }

    const templatesDir = join(workspaceRoot, config.templates.basePath);

    // Ensure templates directory exists
    if (!existsSync(templatesDir)) {
        await mkdir(templatesDir, { recursive: true });
    }

    const categories = category ? [category] : Object.keys(config.templates.categories);
    const templates: TemplateInfo[] = [];

    for (const cat of categories) {
        const categoryDir = join(templatesDir, cat);
        if (!existsSync(categoryDir)) continue;

        const files = await readdir(categoryDir);
        for (const file of files) {
            if (file.endsWith('.template')) {
                const templatePath = join(categoryDir, file);
                const variables = await extractTemplateVariables(templatePath);
                const categoryConfig = config.templates.categories[cat];

                templates.push({
                    name: file.replace('.template', ''),
                    path: templatePath,
                    category: cat,
                    variables,
                    description: categoryConfig?.description
                });
            }
        }
    }

    return {
        content: [{
            type: "text",
            text: JSON.stringify({
                success: true,
                operation: 'list',
                category: category || 'all',
                templates,
                config: {
                    basePath: config.templates.basePath,
                    categories: Object.keys(config.templates.categories)
                }
            }, null, 2)
        }]
    };
}

async function handleApplyTemplate(args: any) {
    const { template, variables = {}, output_path, create_dirs = true } = args;
    const workspaceRoot = process.cwd();

    if (!template) {
        throw new Error("template parameter is required for apply operation");
    }
    if (!output_path) {
        throw new Error("output_path parameter is required for apply operation");
    }

    // Validate output path is within workspace
    const outputValidation = await validateFilePath(output_path, workspaceRoot);
    if (!outputValidation.valid) {
        return {
            content: [{
                type: "text",
                text: JSON.stringify({
                    success: false,
                    error: outputValidation.error
                }, null, 2)
            }],
            isError: true
        };
    }

    // Load config
    const config = await loadTemplateConfig(workspaceRoot);
    const templatesDir = join(workspaceRoot, config.templates.basePath);

    // Find template
    const templatePath = join(templatesDir, template);
    if (!existsSync(templatePath)) {
        // Try with .template extension
        const templateWithExt = template.endsWith('.template') ? template : `${template}.template`;
        const altPath = join(templatesDir, templateWithExt);
        if (!existsSync(altPath)) {
            throw new Error(`Template not found: ${template}`);
        }
    }

    // Read template content
    const templateContent = await readFile(templatePath, 'utf8');

    // Extract required variables from template
    const requiredVars = await extractTemplateVariables(templatePath);

    // Merge with provided variables and context
    const contextVars = await loadContextVariables(workspaceRoot);
    const finalVars = { ...contextVars, ...variables };

    // Check for missing required variables
    const missingVars = requiredVars.filter((v: string) => !(v in finalVars));
    if (missingVars.length > 0) {
        return {
            content: [{
                type: "text",
                text: JSON.stringify({
                    success: false,
                    error: `Missing required variables: ${missingVars.join(', ')}`,
                    required_variables: requiredVars,
                    provided_variables: Object.keys(finalVars)
                }, null, 2)
            }],
            isError: true
        };
    }

    // Apply variable substitution
    const processedContent = substituteVariables(templateContent, finalVars);

    // Create output directory if needed
    if (create_dirs) {
        const outputDir = dirname(outputValidation.sanitizedPath!);
        if (!existsSync(outputDir)) {
            await mkdir(outputDir, { recursive: true });
        }
    }

    // Write output file
    await writeFile(outputValidation.sanitizedPath!, processedContent, 'utf8');

    return {
        content: [{
            type: "text",
            text: JSON.stringify({
                success: true,
                operation: 'apply',
                template,
                output_path,
                variables_used: Object.keys(finalVars),
                variables_provided: Object.keys(variables),
                variables_from_context: Object.keys(contextVars)
            }, null, 2)
        }]
    };
}

async function handleCreateTemplate(args: any) {
    const { category, template, content } = args;
    const workspaceRoot = process.cwd();

    if (!category) {
        throw new Error("category parameter is required for create operation");
    }
    if (!template) {
        throw new Error("template parameter is required for create operation");
    }
    if (!content) {
        throw new Error("content parameter is required for create operation");
    }

    // Load config
    const config = await loadTemplateConfig(workspaceRoot);
    const templatesDir = join(workspaceRoot, config.templates.basePath);
    const categoryDir = join(templatesDir, category);

    // Ensure category directory exists
    if (!existsSync(categoryDir)) {
        await mkdir(categoryDir, { recursive: true });
    }

    // Create template file
    const templatePath = join(categoryDir, `${template}.template`);
    await writeFile(templatePath, content, 'utf8');

    // Extract variables for validation
    const variables = await extractTemplateVariables(templatePath);

    return {
        content: [{
            type: "text",
            text: JSON.stringify({
                success: true,
                operation: 'create',
                template: `${category}/${template}`,
                path: templatePath,
                variables_detected: variables
            }, null, 2)
        }]
    };
}

async function handleValidateTemplate(args: any) {
    const { template } = args;
    const workspaceRoot = process.cwd();

    if (!template) {
        throw new Error("template parameter is required for validate operation");
    }

    // Load config
    const config = await loadTemplateConfig(workspaceRoot);
    const templatesDir = join(workspaceRoot, config.templates.basePath);

    // Find template
    const templatePath = join(templatesDir, template);
    if (!existsSync(templatePath)) {
        const templateWithExt = template.endsWith('.template') ? template : `${template}.template`;
        const altPath = join(templatesDir, templateWithExt);
        if (!existsSync(altPath)) {
            throw new Error(`Template not found: ${template}`);
        }
    }

    // Validate template
    const stats = await stat(templatePath);
    const content = await readFile(templatePath, 'utf8');
    const variables = await extractTemplateVariables(templatePath);

    // Check for syntax issues (basic)
    const issues: string[] = [];
    if (content.includes('${}') || content.includes('${')) {
        // Check for unclosed variables
        const openCount = (content.match(/\$\{/g) || []).length;
        const closeCount = (content.match(/\}/g) || []).length;
        if (openCount !== closeCount) {
            issues.push("Unmatched variable braces");
        }
    }

    return {
        content: [{
            type: "text",
            text: JSON.stringify({
                success: true,
                operation: 'validate',
                template,
                path: templatePath,
                size: stats.size,
                variables_required: variables,
                issues: issues.length > 0 ? issues : undefined,
                valid: issues.length === 0
            }, null, 2)
        }]
    };
}

async function loadTemplateConfig(workspaceRoot: string): Promise<TemplateConfig> {
    const configPath = join(workspaceRoot, '.gibrun', 'config.json');

    const defaultConfig: TemplateConfig = {
        templates: {
            enabled: true,
            basePath: ".gibrun/templates",
            categories: {
                api: {
                    description: "API endpoint templates",
                    variables: ["endpointName", "method", "path", "framework"],
                    defaultFramework: "express"
                },
                database: {
                    description: "Database model templates",
                    variables: ["modelName", "tableName", "fields"]
                },
                test: {
                    description: "Test file templates",
                    variables: ["testName", "targetFile"]
                },
                config: {
                    description: "Configuration file templates",
                    variables: ["configName", "environment"]
                }
            }
        },
        project: {
            name: "my-project",
            framework: "express",
            database: "postgresql"
        }
    };

    if (!existsSync(configPath)) {
        // Create default config
        const configDir = dirname(configPath);
        if (!existsSync(configDir)) {
            await mkdir(configDir, { recursive: true });
        }
        await writeFile(configPath, JSON.stringify(defaultConfig, null, 2), 'utf8');
        return defaultConfig;
    }

    try {
        const configContent = await readFile(configPath, 'utf8');
        const config = JSON.parse(configContent);
        return { ...defaultConfig, ...config };
    } catch (error) {
        logError("Failed to load template config", error, { configPath });
        return defaultConfig;
    }
}

async function extractTemplateVariables(templatePath: string): Promise<string[]> {
    try {
        const content = await readFile(templatePath, 'utf8');
        const variableRegex = /\$\{([^}]+)\}/g;
        const variables = new Set<string>();

        let match;
        while ((match = variableRegex.exec(content)) !== null) {
            variables.add(match[1]);
        }

        return Array.from(variables);
    } catch (error) {
        return [];
    }
}

async function loadContextVariables(workspaceRoot: string): Promise<Record<string, any>> {
    const context: Record<string, any> = {};

    // Load from package.json
    try {
        const packagePath = join(workspaceRoot, 'package.json');
        if (existsSync(packagePath)) {
            const packageContent = await readFile(packagePath, 'utf8');
            const packageJson = JSON.parse(packageContent);
            context.projectName = packageJson.name;
            context.version = packageJson.version;
            context.description = packageJson.description;
        }
    } catch (error) {
        // Ignore errors
    }

    // Load from tsconfig.json
    try {
        const tsconfigPath = join(workspaceRoot, 'tsconfig.json');
        if (existsSync(tsconfigPath)) {
            const tsconfigContent = await readFile(tsconfigPath, 'utf8');
            const tsconfig = JSON.parse(tsconfigContent);
            context.target = tsconfig.compilerOptions?.target;
            context.module = tsconfig.compilerOptions?.module;
        }
    } catch (error) {
        // Ignore errors
    }

    // Add current date/time
    context.currentDate = new Date().toISOString().split('T')[0];
    context.currentYear = new Date().getFullYear().toString();

    return context;
}

function substituteVariables(content: string, variables: Record<string, any>): string {
    let result = content;

    for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`\\$\\{${key}\\}`, 'g');
        result = result.replace(regex, String(value));
    }

    return result;
}