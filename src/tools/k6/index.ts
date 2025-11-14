import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { handleK6LoadTestExecute, handleK6ScriptGenerate } from "./handlers.js";
export { K6ToolManager } from "./manager.js";
export { K6ScriptGenerator } from "./generator.js";

export const K6_TOOLS: Tool[] = [
    {
        name: "k6_load_test/execute",
        description: "Execute load testing and stress testing using K6 with advanced scenarios. Supports HTTP, WebSocket, and browser-based testing with comprehensive metrics and threshold validation.",
        inputSchema: {
            type: "object",
            properties: {
                script_type: {
                    type: "string",
                    enum: ["http", "websocket", "browser", "custom"],
                    description: "Type of test script to execute",
                    default: "http"
                },
                target_url: {
                    type: "string",
                    description: "Base URL for the application under test"
                },
                scenarios: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            name: { type: "string" },
                            executor: { type: "string", enum: ["constant-vus", "ramping-vus", "constant-arrival-rate", "ramping-arrival-rate", "externally-controlled"] },
                            vus: { type: "number" },
                            duration: { type: "string" },
                            stages: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        duration: { type: "string" },
                                        target: { type: "number" }
                                    },
                                    required: ["duration", "target"]
                                }
                            }
                        },
                        required: ["name"]
                    },
                    description: "K6 scenario definitions for load testing"
                },
                thresholds: {
                    type: "object",
                    description: "K6 threshold definitions for performance validation",
                    additionalProperties: {
                        type: "array",
                        items: { type: "string" }
                    }
                },
                duration: {
                    type: "string",
                    description: "Test duration (e.g., '30s', '5m')",
                    default: "1m"
                },
                vus: {
                    type: "number",
                    description: "Number of virtual users",
                    default: 10
                },
                stages: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            duration: { type: "string" },
                            target: { type: "number" }
                        },
                        required: ["duration", "target"]
                    },
                    description: "Ramp-up/ramp-down stages for the test"
                },
                environment: {
                    type: "object",
                    description: "Environment variables for the test",
                    additionalProperties: { type: "string" }
                },
                output_format: {
                    type: "string",
                    enum: ["json", "html", "junit"],
                    description: "Output format for test results",
                    default: "json"
                },
                script_path: {
                    type: "string",
                    description: "Path to custom K6 script file (for script_type: 'custom')"
                },
                cloud: {
                    type: "boolean",
                    description: "Execute test on K6 Cloud instead of locally",
                    default: false
                },
                cloud_token: {
                    type: "string",
                    description: "K6 Cloud API token (required for cloud execution)"
                }
            },
            required: ["script_type"]
        }
    },
    {
        name: "k6_script/generate",
        description: "Generate K6 test scripts from API specifications, recorded sessions, or manual configuration. Supports OpenAPI, Postman, HAR files, and custom scenarios.",
        inputSchema: {
            type: "object",
            properties: {
                source_type: {
                    type: "string",
                    enum: ["openapi", "postman", "har", "manual", "recording"],
                    description: "Source type for script generation"
                },
                source_file: {
                    type: "string",
                    description: "Path to source file (OpenAPI spec, Postman collection, HAR file)"
                },
                scenario_template: {
                    type: "string",
                    enum: ["load", "stress", "spike", "volume", "smoke"],
                    description: "Predefined scenario template",
                    default: "load"
                },
                custom_checks: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            name: { type: "string" },
                            condition: { type: "string" },
                            response_id: { type: "string" }
                        }
                    },
                    description: "Custom validation checks for responses"
                },
                authentication: {
                    type: "object",
                    properties: {
                        type: { type: "string", enum: ["bearer", "basic", "api_key", "oauth2"] },
                        token: { type: "string" },
                        username: { type: "string" },
                        password: { type: "string" },
                        api_key: { type: "string" },
                        header_name: { type: "string" }
                    },
                    description: "Authentication configuration"
                },
                output_path: {
                    type: "string",
                    description: "Path where to save the generated script",
                    default: "./k6-test.js"
                },
                base_url: {
                    type: "string",
                    description: "Base URL to override in the generated script"
                },
                include_checks: {
                    type: "boolean",
                    description: "Include response validation checks",
                    default: true
                },
                include_metrics: {
                    type: "boolean",
                    description: "Include custom metrics collection",
                    default: true
                }
            },
            required: ["source_type"]
        }
    }
];

export { handleK6LoadTestExecute, handleK6ScriptGenerate };