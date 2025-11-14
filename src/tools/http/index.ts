import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { HttpService } from "@/services/http-service.js";

export const HTTP_TOOLS: Tool[] = [
    {
        name: "http_request",
        description:
            "Make HTTP request to test API endpoints (like curl). Supports GET, POST, PUT, PATCH, DELETE methods with headers and body.",
        inputSchema: {
            type: "object",
            properties: {
                url: {
                    type: "string",
                    description: "The URL to send request to",
                },
                method: {
                    type: "string",
                    enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
                    description: "HTTP method",
                    default: "GET",
                },
                headers: {
                    type: "object",
                    description: "HTTP headers as key-value pairs",
                },
                body: {
                    type: "object",
                    description: "Request body (will be sent as JSON)",
                },
                timeout: {
                    type: "number",
                    description: "Request timeout in milliseconds",
                    default: 30000,
                },
            },
            required: ["url"],
        },
    },
];

export async function handleHttpRequest(httpService: HttpService, args: any) {
    const { url, method = 'GET', headers, body, timeout = 30000 } = args;

    const result = await httpService.makeRequest(url, method, headers, body, timeout);

    return {
        content: [
            {
                type: "text",
                text: JSON.stringify(result, null, 2),
            },
        ],
        isError: !result.success,
    };
}