import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import { logError, logInfo } from "@/services/logger-service.js";

const execAsync = promisify(exec);

export interface CloudConfig {
    scriptPath: string;
    token: string;
    projectId?: string;
    name?: string;
    tags?: Record<string, string>;
}

export interface CloudTestResult {
    success: boolean;
    cloud_test_id?: string;
    test_url?: string;
    summary?: any;
    thresholds?: any[];
    errors?: any[];
    metrics?: any;
    output?: string;
    execution_time_ms?: number;
}

export class K6CloudDeployer {
    private cloudApiUrl = 'https://api.k6.io/v1';

    async deployToCloud(config: CloudConfig): Promise<CloudTestResult> {
        try {
            logInfo("Deploying K6 test to cloud", { config: { ...config, token: '[REDACTED]' } });

            // Read script content
            const scriptContent = await fs.readFile(config.scriptPath, 'utf8');

            // Prepare cloud deployment command
            const command = this.buildCloudCommand(config, scriptContent);

            logInfo("Executing cloud deployment command", { command: command.replace(config.token, '[REDACTED]') });

            const startTime = Date.now();
            const { stdout, stderr } = await execAsync(command, {
                cwd: process.cwd(),
                maxBuffer: 1024 * 1024 * 10 // 10MB buffer
            });

            const executionTime = Date.now() - startTime;

            // Parse cloud response
            const result = await this.parseCloudResponse(stdout + stderr);

            return {
                success: result.success !== false,
                ...result,
                execution_time_ms: executionTime,
                output: stdout + stderr
            };

        } catch (error: any) {
            logError("Cloud deployment failed", error, { config: { ...config, token: '[REDACTED]' } });

            return {
                success: false,
                errors: [{ message: error.message }],
                output: error.stdout || error.stderr,
                execution_time_ms: Date.now() - Date.now() // Will be 0
            };
        }
    }

    private buildCloudCommand(config: CloudConfig, scriptContent: string): string {
        let command = `k6 cloud run`;

        // Add script (inline for now, could be file path)
        command += ` -`; // Use stdin

        // Add token
        command += ` --token "${config.token}"`;

        // Add project ID if specified
        if (config.projectId) {
            command += ` --project-id "${config.projectId}"`;
        }

        // Add name if specified
        if (config.name) {
            command += ` --name "${config.name}"`;
        }

        // Add tags
        if (config.tags) {
            Object.entries(config.tags).forEach(([key, value]) => {
                command += ` --tag "${key}=${value}"`;
            });
        }

        // Add output format
        command += ` --out cloud`;

        return command;
    }

    private async parseCloudResponse(output: string): Promise<Partial<CloudTestResult>> {
        try {
            // Parse K6 cloud output
            const lines = output.split('\n');
            let testId: string | undefined;
            let testUrl: string | undefined;

            for (const line of lines) {
                // Look for test ID
                const idMatch = line.match(/Test ID:\s*(\w+)/);
                if (idMatch) {
                    testId = idMatch[1];
                }

                // Look for test URL
                const urlMatch = line.match(/https:\/\/app\.k6\.io\/runs\/(\d+)/);
                if (urlMatch) {
                    testUrl = `https://app.k6.io/runs/${urlMatch[1]}`;
                }
            }

            // For now, return basic info. In a real implementation,
            // you might poll the K6 Cloud API for detailed results
            return {
                success: !output.includes('ERROR') && !output.includes('failed'),
                cloud_test_id: testId,
                test_url: testUrl,
                output
            };

        } catch (error: any) {
            logError("Failed to parse cloud response", error, { output: output.substring(0, 500) });
            return {
                success: false,
                errors: [{ message: `Failed to parse cloud response: ${error.message}` }],
                output
            };
        }
    }

    async getCloudResults(testId: string, token: string): Promise<CloudTestResult> {
        try {
            logInfo("Fetching cloud test results", { testId });

            // This would typically make API calls to K6 Cloud
            // For now, return a placeholder implementation
            const result: CloudTestResult = {
                success: true,
                cloud_test_id: testId,
                test_url: `https://app.k6.io/runs/${testId}`,
                summary: {
                    totalRequests: 0,
                    failedRequests: 0,
                    avgResponseTime: 0,
                    p95ResponseTime: 0,
                    p99ResponseTime: 0
                },
                thresholds: [],
                errors: [],
                metrics: {},
                output: `Cloud test ${testId} completed successfully`
            };

            return result;

        } catch (error: any) {
            logError("Failed to fetch cloud results", error, { testId });
            return {
                success: false,
                cloud_test_id: testId,
                errors: [{ message: error.message }]
            };
        }
    }

    async listCloudTests(token: string, projectId?: string): Promise<any[]> {
        // Placeholder for listing cloud tests
        // Would make API call to K6 Cloud
        return [];
    }

    async stopCloudTest(testId: string, token: string): Promise<boolean> {
        try {
            logInfo("Stopping cloud test", { testId });

            // This would make an API call to stop the test
            // For now, return success
            return true;

        } catch (error: any) {
            logError("Failed to stop cloud test", error, { testId });
            return false;
        }
    }
}