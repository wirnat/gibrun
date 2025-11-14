import { exec } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as fs from "fs/promises";
import { K6BinaryManager } from "./binary-manager.js";
import { K6ResultParser } from "./result-parser.js";
import { K6CloudDeployer } from "./cloud-deployer.js";
import { logError, logInfo } from "@/services/logger-service.js";

const execAsync = promisify(exec);

export interface K6TestConfig {
    script_type: 'http' | 'websocket' | 'browser' | 'custom';
    target_url?: string;
    scenarios?: any[];
    thresholds?: Record<string, string[]>;
    duration?: string;
    vus?: number;
    stages?: any[];
    environment?: Record<string, string>;
    output_format?: 'json' | 'html' | 'junit';
    script_path?: string;
    cloud?: boolean;
    cloud_token?: string;
}

export interface K6TestResult {
    success: boolean;
    summary?: {
        totalRequests: number;
        failedRequests: number;
        avgResponseTime: number;
        p95ResponseTime: number;
        p99ResponseTime: number;
    };
    thresholds?: any[];
    errors?: any[];
    metrics?: any;
    output?: string;
    execution_time_ms?: number;
    cloud_test_id?: string;
}

export class K6ToolManager {
    private binaryManager: K6BinaryManager;
    private resultParser: K6ResultParser;
    private cloudDeployer: K6CloudDeployer;

    constructor() {
        this.binaryManager = new K6BinaryManager();
        this.resultParser = new K6ResultParser();
        this.cloudDeployer = new K6CloudDeployer();
    }

    async executeTest(config: K6TestConfig): Promise<K6TestResult> {
        try {
            logInfo("Starting K6 test execution", { config });

            // Ensure K6 is installed
            const k6Path = await this.binaryManager.ensureK6Installed();

            let scriptPath: string;
            let scriptContent: string;

            if (config.script_type === 'custom' && config.script_path) {
                // Use existing script
                scriptPath = config.script_path;
                scriptContent = await fs.readFile(scriptPath, 'utf8');
            } else {
                // Generate script based on config
                scriptContent = this.generateInlineScript(config);
                scriptPath = await this.writeTempScript(scriptContent);
            }

            if (config.cloud) {
                // Execute on K6 Cloud
                return await this.executeCloudTest(scriptPath, config);
            } else {
                // Execute locally
                return await this.executeLocalTest(k6Path, scriptPath, config);
            }
        } catch (error: any) {
            logError("K6 test execution failed", error, { config });
            return {
                success: false,
                errors: [{ message: error.message }],
                output: error.stdout || error.stderr
            };
        }
    }

    private generateInlineScript(config: K6TestConfig): string {
        const options: any = {};

        if (config.scenarios) {
            options.scenarios = config.scenarios;
        } else if (config.stages) {
            options.stages = config.stages;
        } else {
            options.vus = config.vus || 10;
            options.duration = config.duration || '30s';
        }

        if (config.thresholds) {
            options.thresholds = config.thresholds;
        }

        let script = `
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = ${JSON.stringify(options, null, 2)};

const BASE_URL = '${config.target_url || 'http://localhost:3000'}';
`;

        // Add environment variables
        if (config.environment) {
            Object.entries(config.environment).forEach(([key, value]) => {
                script += `\nconst ${key} = '${value}';`;
            });
        }

        script += `

export default function () {
`;

        // Generate test logic based on script type
        switch (config.script_type) {
            case 'http':
                script += this.generateHTTPLoadTest();
                break;
            case 'websocket':
                script += this.generateWebSocketTest();
                break;
            case 'browser':
                script += this.generateBrowserTest();
                break;
            default:
                script += this.generateHTTPLoadTest();
        }

        script += `
    sleep(Math.random() * 2 + 1);
}
`;

        return script;
    }

    private generateHTTPLoadTest(): string {
        return `
    let response = http.get(\`\${BASE_URL}/api/health\`);
    check(response, {
        'status is 200': (r) => r.status === 200,
        'response time < 1000ms': (r) => r.timings.duration < 1000,
    });`;
    }

    private generateWebSocketTest(): string {
        return `
    // WebSocket test implementation would go here
    // For now, fallback to HTTP test
    let response = http.get(\`\${BASE_URL}/api/health\`);
    check(response, {
        'status is 200': (r) => r.status === 200,
    });`;
    }

    private generateBrowserTest(): string {
        return `
    // Browser test implementation would go here
    // For now, fallback to HTTP test
    let response = http.get(\`\${BASE_URL}/\`);
    check(response, {
        'status is 200': (r) => r.status === 200,
    });`;
    }

    private async writeTempScript(content: string): Promise<string> {
        const tempDir = path.join(process.cwd(), '.gibrun', 'temp');
        await fs.mkdir(tempDir, { recursive: true });

        const scriptPath = path.join(tempDir, `k6-test-${Date.now()}.js`);
        await fs.writeFile(scriptPath, content, 'utf8');

        return scriptPath;
    }

    private async executeLocalTest(k6Path: string, scriptPath: string, config: K6TestConfig): Promise<K6TestResult> {
        const startTime = Date.now();

        // Build K6 command
        let command = `"${k6Path}" run "${scriptPath}"`;

        // Add output format
        switch (config.output_format) {
            case 'json':
                command += ' --out json=results.json';
                break;
            case 'junit':
                command += ' --out junit=results.xml';
                break;
            case 'html':
                command += ' --out web-dashboard=report.html';
                break;
        }

        // Add environment variables
        if (config.environment) {
            Object.entries(config.environment).forEach(([key, value]) => {
                command += ` --env ${key}="${value}"`;
            });
        }

        logInfo("Executing K6 command", { command });

        try {
            const { stdout, stderr } = await execAsync(command, {
                cwd: process.cwd(),
                maxBuffer: 1024 * 1024 * 10 // 10MB buffer
            });

            const executionTime = Date.now() - startTime;

            // Parse results
            let parsedResult: any = {};
            if (config.output_format === 'json') {
                try {
                    const resultsContent = await fs.readFile('results.json', 'utf8');
                    parsedResult = JSON.parse(resultsContent);
                } catch (e) {
                    logError("Failed to read JSON results", e);
                }
            }

            const result: K6TestResult = {
                success: true,
                output: stdout + stderr,
                execution_time_ms: executionTime,
                ...this.resultParser.parseJSONResult(JSON.stringify(parsedResult))
            };

            return result;

        } catch (error: any) {
            const executionTime = Date.now() - startTime;

            return {
                success: false,
                output: error.stdout || error.stderr,
                execution_time_ms: executionTime,
                errors: [{ message: error.message }]
            };
        }
    }

    private async executeCloudTest(scriptPath: string, config: K6TestConfig): Promise<K6TestResult> {
        if (!config.cloud_token) {
            throw new Error("Cloud token is required for cloud execution");
        }

        return await this.cloudDeployer.deployToCloud({
            scriptPath,
            token: config.cloud_token,
            projectId: config.environment?.K6_CLOUD_PROJECT_ID
        });
    }
}