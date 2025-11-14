import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { DAPService } from "@/services/dap-service.js";
import { resolveDAPServer } from "@/core/dap-handlers.js";
import * as fs from "fs/promises";
import * as path from "path";

// Multi-IDE DAP Support Tools

export const DAP_MULTI_IDE_TOOLS: Tool[] = [
    {
        name: "dap_detect_ide",
        description: "Detect the IDE type and configuration for the current debugging session. Supports VSCode, JetBrains IDEs, and other DAP-compatible debuggers.",
        inputSchema: {
            type: "object",
            properties: {
                project_path: {
                    type: "string",
                    description: "Path to the project directory to analyze for IDE configuration"
                },
                include_config_details: {
                    type: "boolean",
                    description: "Include detailed configuration information from IDE files",
                    default: true
                }
            }
        },
    },
    {
        name: "dap_configure_multi_ide",
        description: "Configure DAP settings for different IDE types. Helps set up proper debugging configuration across multiple IDEs.",
        inputSchema: {
            type: "object",
            properties: {
                ide_type: {
                    type: "string",
                    description: "Type of IDE to configure",
                    enum: ["vscode", "jetbrains", "visualstudio", "auto"]
                },
                project_path: {
                    type: "string",
                    description: "Path to the project directory"
                },
                dap_host: {
                    type: "string",
                    description: "DAP server host",
                    default: "127.0.0.1"
                },
                dap_port: {
                    type: "number",
                    description: "DAP server port"
                },
                generate_config: {
                    type: "boolean",
                    description: "Generate IDE-specific configuration files",
                    default: false
                }
            },
            required: ["ide_type", "project_path"]
        },
    },
    {
        name: "dap_validate_ide_setup",
        description: "Validate that the current IDE setup is properly configured for DAP debugging.",
        inputSchema: {
            type: "object",
            properties: {
                ide_type: {
                    type: "string",
                    description: "Type of IDE to validate",
                    enum: ["vscode", "jetbrains", "visualstudio", "auto"]
                },
                project_path: {
                    type: "string",
                    description: "Path to the project directory"
                },
                check_connectivity: {
                    type: "boolean",
                    description: "Test actual DAP server connectivity",
                    default: true
                }
            },
            required: ["project_path"]
        },
    }
];

// IDE Detection Patterns
const IDE_PATTERNS = {
    vscode: {
        configFiles: ['.vscode/launch.json', '.vscode/settings.json'],
        processPatterns: ['code', 'vscode'],
        markers: ['.vscode']
    },
    jetbrains: {
        configFiles: ['.idea/workspace.xml', '.idea/runConfigurations/'],
        processPatterns: ['idea', 'goland', 'intellij'],
        markers: ['.idea']
    },
    visualstudio: {
        configFiles: ['.vs/launch.vs.json', '.vs/settings.json'],
        processPatterns: ['devenv', 'vs'],
        markers: ['.vs']
    }
};

async function detectIDEType(projectPath: string): Promise<{
    ide: string;
    confidence: number;
    configFiles: string[];
    detectedConfigs: Record<string, any>;
}> {
    const results = {
        ide: 'unknown',
        confidence: 0,
        configFiles: [] as string[],
        detectedConfigs: {} as Record<string, any>
    };

    for (const [ideName, patterns] of Object.entries(IDE_PATTERNS)) {
        let score = 0;
        const foundConfigs: string[] = [];

        // Check for marker directories
        for (const marker of patterns.markers) {
            try {
                await fs.access(path.join(projectPath, marker));
                score += 30;
            } catch {
                // Marker not found
            }
        }

        // Check for configuration files
        for (const configFile of patterns.configFiles) {
            try {
                const configPath = path.join(projectPath, configFile);
                await fs.access(configPath);
                foundConfigs.push(configFile);
                score += 20;

                // Try to read and parse config
                try {
                    const content = await fs.readFile(configPath, 'utf8');
                    if (configFile.endsWith('.json')) {
                        results.detectedConfigs[configFile] = JSON.parse(content);
                    } else if (configFile.endsWith('.xml')) {
                        // Basic XML parsing for JetBrains
                        results.detectedConfigs[configFile] = parseJetBrainsXml(content);
                    }
                } catch (parseError) {
                    // Config file exists but can't be parsed
                    results.detectedConfigs[configFile] = { error: 'Parse failed' };
                }
            } catch {
                // Config file not found
            }
        }

        if (score > results.confidence) {
            results.ide = ideName;
            results.confidence = score;
            results.configFiles = foundConfigs;
        }
    }

    return results;
}

function parseJetBrainsXml(content: string): any {
    // Basic XML parsing for JetBrains config files
    const config: any = {};

    // Extract DAP-related configuration
    const runConfigMatch = content.match(/<configuration[^>]*name="([^"]*Go[^"]*)"[^>]*>/);
    if (runConfigMatch) {
        config.runConfiguration = runConfigMatch[1];
    }

    const portMatch = content.match(/<option[^>]*port[^>]*value="(\d+)"/);
    if (portMatch) {
        config.dapPort = parseInt(portMatch[1]);
    }

    return config;
}

export async function handleDAPDetectIDE(dapService: DAPService, args: any) {
    const { project_path, include_config_details = true } = args;

    try {
        if (!project_path) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: false,
                            error: "project_path is required",
                            tool: "dap_detect_ide"
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }

        const detection = await detectIDEType(project_path);

        const response: any = {
            success: true,
            tool: "dap_detect_ide",
            project_path,
            detected_ide: detection.ide,
            confidence_score: detection.confidence,
            config_files_found: detection.configFiles,
            ide_capabilities: getIDECapabilities(detection.ide)
        };

        if (include_config_details) {
            response.config_details = detection.detectedConfigs;
        }

        // Try to get current DAP server info
        try {
            const resolution = await resolveDAPServer();
            if (resolution.success) {
                response.current_dap_server = `${resolution.host}:${resolution.port}`;
            }
        } catch {
            // Ignore resolution errors
        }

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(response, null, 2),
                },
            ],
        };
    } catch (error: any) {
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: false,
                        tool: "dap_detect_ide",
                        project_path,
                        error: error.message
                    }, null, 2),
                },
            ],
            isError: true,
        };
    }
}

function getIDECapabilities(ide: string): any {
    const capabilities = {
        vscode: {
            supported_debuggers: ['go', 'node', 'python', 'cpp'],
            config_format: 'json',
            hot_reload: true,
            multi_target: true
        },
        jetbrains: {
            supported_debuggers: ['go', 'java', 'python', 'cpp'],
            config_format: 'xml',
            hot_reload: false,
            multi_target: true
        },
        visualstudio: {
            supported_debuggers: ['cpp', 'csharp', 'python'],
            config_format: 'json',
            hot_reload: false,
            multi_target: false
        }
    };

    return capabilities[ide as keyof typeof capabilities] || {
        supported_debuggers: ['unknown'],
        config_format: 'unknown',
        hot_reload: false,
        multi_target: false
    };
}

export async function handleDAPConfigureMultiIDE(dapService: DAPService, args: any) {
    const { ide_type, project_path, dap_host = '127.0.0.1', dap_port, generate_config = false } = args;

    try {
        let targetIDE = ide_type;
        if (ide_type === 'auto') {
            const detection = await detectIDEType(project_path);
            targetIDE = detection.ide;
        }

        const config: any = {
            ide: targetIDE,
            dap_host,
            dap_port,
            project_path,
            capabilities: getIDECapabilities(targetIDE)
        };

        // Generate configuration files if requested
        if (generate_config) {
            const generatedFiles = await generateIDEConfig(targetIDE, project_path, config);
            config.generated_files = generatedFiles;
        }

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        tool: "dap_configure_multi_ide",
                        configuration: config,
                        setup_instructions: getIDESetupInstructions(targetIDE)
                    }, null, 2),
                },
            ],
        };
    } catch (error: any) {
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: false,
                        tool: "dap_configure_multi_ide",
                        ide_type,
                        project_path,
                        error: error.message
                    }, null, 2),
                },
            ],
            isError: true,
        };
    }
}

async function generateIDEConfig(ide: string, projectPath: string, config: any): Promise<string[]> {
    const generatedFiles: string[] = [];

    if (ide === 'vscode') {
        const launchConfig = {
            version: "0.2.0",
            configurations: [
                {
                    name: "Go DAP Debug",
                    type: "go",
                    request: "launch",
                    mode: "debug",
                    program: "${workspaceFolder}",
                    env: {},
                    args: [],
                    dapServer: {
                        host: config.dap_host,
                        port: config.dap_port
                    }
                }
            ]
        };

        const configPath = path.join(projectPath, '.vscode', 'launch.json');
        await fs.mkdir(path.dirname(configPath), { recursive: true });
        await fs.writeFile(configPath, JSON.stringify(launchConfig, null, 2));
        generatedFiles.push('.vscode/launch.json');
    }

    return generatedFiles;
}

function getIDESetupInstructions(ide: string): any {
    const instructions = {
        vscode: {
            steps: [
                "Install Go extension",
                "Configure launch.json with DAP server settings",
                "Start debugging with F5"
            ],
            docs: "https://code.visualstudio.com/docs/editor/debugging"
        },
        jetbrains: {
            steps: [
                "Install Go plugin",
                "Create Go run configuration",
                "Configure debugger settings in Run/Debug Configurations",
                "Start debugging"
            ],
            docs: "https://www.jetbrains.com/help/go/debugging-code.html"
        },
        visualstudio: {
            steps: [
                "Create launch.vs.json configuration",
                "Configure debugger settings",
                "Start debugging with F5"
            ],
            docs: "https://docs.microsoft.com/en-us/visualstudio/debugger/"
        }
    };

    return instructions[ide as keyof typeof instructions] || {
        steps: ["Configure DAP server settings in IDE", "Start debugging session"],
        docs: "Check IDE documentation for DAP configuration"
    };
}

export async function handleDAPValidateIDESetup(dapService: DAPService, args: any) {
    const { ide_type, project_path, check_connectivity = true } = args;

    try {
        let targetIDE = ide_type;
        if (!ide_type || ide_type === 'auto') {
            const detection = await detectIDEType(project_path);
            targetIDE = detection.ide;
        }

        const validation = {
            ide_type: targetIDE,
            project_path,
            config_validation: await validateIDEConfig(targetIDE, project_path),
            connectivity_test: check_connectivity ? await testDAPConnectivity(dapService) : null
        };

        const isValid = validation.config_validation.valid &&
                       (!check_connectivity || validation.connectivity_test?.connected);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        tool: "dap_validate_ide_setup",
                        validation_result: isValid ? 'valid' : 'invalid',
                        details: validation,
                        recommendations: generateValidationRecommendations(validation)
                    }, null, 2),
                },
            ],
        };
    } catch (error: any) {
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: false,
                        tool: "dap_validate_ide_setup",
                        ide_type,
                        project_path,
                        error: error.message
                    }, null, 2),
                },
            ],
            isError: true,
        };
    }
}

async function validateIDEConfig(ide: string, projectPath: string): Promise<{
    valid: boolean;
    issues: string[];
    recommendations: string[];
}> {
    const result = {
        valid: true,
        issues: [] as string[],
        recommendations: [] as string[]
    };

    const patterns = IDE_PATTERNS[ide as keyof typeof IDE_PATTERNS];
    if (!patterns) {
        result.valid = false;
        result.issues.push(`Unknown IDE type: ${ide}`);
        return result;
    }

    // Check for required config files
    let configFound = false;
    for (const configFile of patterns.configFiles) {
        try {
            await fs.access(path.join(projectPath, configFile));
            configFound = true;
            break;
        } catch {
            // Config file not found
        }
    }

    if (!configFound) {
        result.valid = false;
        result.issues.push(`No configuration files found for ${ide}`);
        result.recommendations.push(`Create ${patterns.configFiles[0]} with proper DAP configuration`);
    }

    return result;
}

async function testDAPConnectivity(dapService: DAPService): Promise<{
    connected: boolean;
    response_time_ms?: number;
    error?: string;
}> {
    const startTime = Date.now();

    try {
        const resolution = await resolveDAPServer();
        if (!resolution.success) {
            return { connected: false, error: resolution.error };
        }

        // Test with a simple initialize command
        await dapService.sendDAPRequest(resolution.host, resolution.port, 'initialize', {
            clientID: 'gibrun-validator',
            clientName: 'gibRun IDE Validator',
            adapterID: 'go'
        });

        return {
            connected: true,
            response_time_ms: Date.now() - startTime
        };
    } catch (error: any) {
        return {
            connected: false,
            response_time_ms: Date.now() - startTime,
            error: error.message
        };
    }
}

function generateValidationRecommendations(validation: any): string[] {
    const recommendations: string[] = [];

    if (!validation.config_validation.valid) {
        recommendations.push(...validation.config_validation.recommendations);
    }

    if (validation.connectivity_test && !validation.connectivity_test.connected) {
        recommendations.push("Start DAP debugger in your IDE");
        recommendations.push("Check that DAP server is listening on the correct port");
        recommendations.push("Verify firewall settings allow DAP connections");
    }

    return recommendations;
}