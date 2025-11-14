import * as fs from "fs/promises";
import * as path from "path";
import { logError, logInfo } from "@/services/logger-service.js";

export interface ScriptGenerationConfig {
    source_type: 'openapi' | 'postman' | 'har' | 'manual' | 'recording';
    source_file?: string;
    scenario_template?: 'load' | 'stress' | 'spike' | 'volume' | 'smoke';
    custom_checks?: any[];
    authentication?: {
        type: 'bearer' | 'basic' | 'api_key' | 'oauth2';
        token?: string;
        username?: string;
        password?: string;
        api_key?: string;
        header_name?: string;
    };
    output_path?: string;
    base_url?: string;
    include_checks?: boolean;
    include_metrics?: boolean;
    requests?: any[]; // For manual configuration
}

export class K6ScriptGenerator {
    async generateScript(config: ScriptGenerationConfig): Promise<string> {
        try {
            logInfo("Generating K6 script", { config });

            let script = '';

            switch (config.source_type) {
                case 'openapi':
                    script = await this.generateFromOpenAPI(config);
                    break;
                case 'postman':
                    script = await this.generateFromPostman(config);
                    break;
                case 'har':
                    script = await this.generateFromHAR(config);
                    break;
                case 'manual':
                    script = this.generateManualScript(config);
                    break;
                case 'recording':
                    script = await this.generateFromRecording(config);
                    break;
                default:
                    throw new Error(`Unsupported source type: ${config.source_type}`);
            }

            // Save script if output path is specified
            if (config.output_path) {
                await fs.writeFile(config.output_path, script, 'utf8');
                logInfo("Script saved", { path: config.output_path });
            }

            return script;

        } catch (error: any) {
            logError("Script generation failed", error, { config });
            throw new Error(`Failed to generate script: ${error.message}`);
        }
    }

    private async generateFromOpenAPI(config: ScriptGenerationConfig): Promise<string> {
        if (!config.source_file) {
            throw new Error("source_file is required for OpenAPI generation");
        }

        // Read OpenAPI spec
        const specContent = await fs.readFile(config.source_file, 'utf8');
        const spec = JSON.parse(specContent);

        // Extract base URL
        const baseUrl = config.base_url || this.extractBaseUrlFromSpec(spec);

        // Extract endpoints
        const endpoints = this.extractEndpointsFromSpec(spec);

        return this.buildScriptFromEndpoints(endpoints, baseUrl, config);
    }

    private async generateFromPostman(config: ScriptGenerationConfig): Promise<string> {
        if (!config.source_file) {
            throw new Error("source_file is required for Postman generation");
        }

        // Read Postman collection
        const collectionContent = await fs.readFile(config.source_file, 'utf8');
        const collection = JSON.parse(collectionContent);

        // Extract base URL and requests
        const baseUrl = config.base_url || collection.variable?.find((v: any) => v.key === 'baseUrl')?.value;
        const requests = this.extractRequestsFromPostman(collection);

        return this.buildScriptFromRequests(requests, baseUrl, config);
    }

    private async generateFromHAR(config: ScriptGenerationConfig): Promise<string> {
        if (!config.source_file) {
            throw new Error("source_file is required for HAR generation");
        }

        // Read HAR file
        const harContent = await fs.readFile(config.source_file, 'utf8');
        const har = JSON.parse(harContent);

        // Extract requests from HAR
        const requests = this.extractRequestsFromHAR(har);

        return this.buildScriptFromRequests(requests, config.base_url, config);
    }

    private generateManualScript(config: ScriptGenerationConfig): string {
        const requests = config.requests || [{
            method: 'GET',
            url: '/api/health',
            description: 'Health check endpoint'
        }];

        return this.buildScriptFromRequests(requests, config.base_url || 'http://localhost:3000', config);
    }

    private async generateFromRecording(config: ScriptGenerationConfig): Promise<string> {
        // Placeholder for browser recording integration
        // This would typically integrate with a browser automation tool
        throw new Error("Recording generation not yet implemented");
    }

    private extractBaseUrlFromSpec(spec: any): string {
        const servers = spec.servers || [];
        if (servers.length > 0) {
            return servers[0].url;
        }
        return 'http://localhost:3000';
    }

    private extractEndpointsFromSpec(spec: any): any[] {
        const endpoints: any[] = [];

        if (!spec.paths) return endpoints;

        for (const [path, methods] of Object.entries(spec.paths as any)) {
            for (const [method, operation] of Object.entries(methods as any)) {
                if (typeof operation === 'object' && operation !== null) {
                    endpoints.push({
                        method: method.toUpperCase(),
                        path,
                        operation
                    });
                }
            }
        }

        return endpoints;
    }

    private extractRequestsFromPostman(collection: any): any[] {
        const requests: any[] = [];

        const extractFromItem = (item: any) => {
            if (item.request) {
                requests.push({
                    method: item.request.method,
                    url: item.request.url.raw || item.request.url,
                    headers: item.request.header,
                    body: item.request.body,
                    description: item.name
                });
            } else if (item.item) {
                item.item.forEach(extractFromItem);
            }
        };

        if (collection.item) {
            collection.item.forEach(extractFromItem);
        }

        return requests;
    }

    private extractRequestsFromHAR(har: any): any[] {
        const requests: any[] = [];

        if (har.log && har.log.entries) {
            har.log.entries.forEach((entry: any) => {
                const request = entry.request;
                requests.push({
                    method: request.method,
                    url: request.url,
                    headers: request.headers,
                    body: request.postData?.text,
                    description: `${request.method} ${request.url}`
                });
            });
        }

        return requests;
    }

    private buildScriptFromEndpoints(endpoints: any[], baseUrl: string, config: ScriptGenerationConfig): string {
        const requests = endpoints.map(endpoint => ({
            method: endpoint.method,
            url: endpoint.path,
            description: endpoint.operation.summary || endpoint.operation.description || endpoint.path
        }));

        return this.buildScriptFromRequests(requests, baseUrl, config);
    }

    private buildScriptFromRequests(requests: any[], baseUrl: string | undefined, config: ScriptGenerationConfig): string {
        const scenario = this.getScenarioConfig(config.scenario_template || 'load');
        const authConfig = this.buildAuthConfig(config.authentication);

        let script = `import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = ${JSON.stringify(scenario, null, 2)};

const BASE_URL = '${baseUrl || 'http://localhost:3000'}';
`;

        // Add authentication setup
        if (authConfig) {
            script += authConfig;
        }

        script += `

export default function () {
`;

        // Add requests
        requests.forEach((req, index) => {
            const varName = `response${index}`;
            const url = req.url.startsWith('http') ? req.url : `\${BASE_URL}${req.url}`;

            script += `    // ${req.description || req.url}
    let ${varName} = http.${req.method.toLowerCase()}('${url}'${this.buildRequestOptions(req, config)});
`;

            // Add checks if enabled
            if (config.include_checks !== false) {
                script += `    check(${varName}, {
        'status is 2xx': (r) => r.status >= 200 && r.status < 300,
        'response time < 1000ms': (r) => r.timings.duration < 1000
    });
`;
            }
        });

        script += `
    sleep(Math.random() * 2 + 1);
}
`;

        // Add custom checks if provided
        if (config.custom_checks && config.custom_checks.length > 0) {
            script += `
// Custom checks
${config.custom_checks.map(check => `
check(response${check.response_id || 0}, {
    '${check.name}': ${check.condition}
});`).join('\n')}
`;
        }

        return script;
    }

    private getScenarioConfig(template: string): any {
        const scenarios: Record<string, any> = {
            smoke: {
                vus: 1,
                duration: '10s'
            },
            load: {
                stages: [
                    { duration: '2m', target: 100 },
                    { duration: '5m', target: 100 },
                    { duration: '2m', target: 0 }
                ],
                thresholds: {
                    http_req_duration: ['p(99)<1500'],
                    http_req_failed: ['rate<0.1']
                }
            },
            stress: {
                stages: [
                    { duration: '2m', target: 100 },
                    { duration: '5m', target: 100 },
                    { duration: '2m', target: 200 },
                    { duration: '5m', target: 200 },
                    { duration: '2m', target: 0 }
                ]
            },
            spike: {
                stages: [
                    { duration: '10s', target: 10 },
                    { duration: '10s', target: 1000 },
                    { duration: '10s', target: 10 }
                ]
            },
            volume: {
                stages: [
                    { duration: '1m', target: 10 },
                    { duration: '2m', target: 50 },
                    { duration: '1m', target: 100 },
                    { duration: '2m', target: 100 },
                    { duration: '1m', target: 0 }
                ]
            }
        };

        return scenarios[template] || scenarios.load;
    }

    private buildAuthConfig(auth?: any): string {
        if (!auth) return '';

        switch (auth.type) {
            case 'bearer':
                return `
const TOKEN = '${auth.token}';
const headers = { 'Authorization': \`Bearer \${TOKEN}\` };
`;
            case 'basic':
                return `
const USERNAME = '${auth.username}';
const PASSWORD = '${auth.password}';
const credentials = btoa(\`\${USERNAME}:\${PASSWORD}\`);
const headers = { 'Authorization': \`Basic \${credentials}\` };
`;
            case 'api_key':
                const headerName = auth.header_name || 'X-API-Key';
                return `
const API_KEY = '${auth.api_key}';
const headers = { '${headerName}': API_KEY };
`;
            default:
                return '';
        }
    }

    private buildRequestOptions(req: any, config: ScriptGenerationConfig): string {
        const options: any = {};

        if (req.headers) {
            options.headers = req.headers;
        }

        if (req.body) {
            options.body = req.body;
        }

        if (Object.keys(options).length === 0) {
            return '';
        }

        return `, ${JSON.stringify(options)}`;
    }
}