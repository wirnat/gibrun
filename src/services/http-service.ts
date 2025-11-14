import axios, { Method } from "axios";
import { logError } from "./logger-service.js";

export class HttpService {
    constructor() {}

    async makeRequest(url: string, method: Method = 'GET', headers?: Record<string, string>, body?: any, timeout: number = 30000) {
        try {
            const config: any = {
                url,
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...headers,
                },
                timeout,
            };

            if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
                config.data = body;
            }

            const response = await axios(config);

            return {
                success: true,
                status: response.status,
                statusText: response.statusText,
                headers: response.headers as Record<string, string>,
                data: response.data,
            };
        } catch (error: any) {
            logError("HTTP request failed", error, { url, method });

            if (error.response) {
                // Server responded with error status
                return {
                    success: false,
                    status: error.response.status,
                    statusText: error.response.statusText,
                    headers: error.response.headers as Record<string, string>,
                    data: error.response.data,
                    error: error.message,
                };
            } else if (error.request) {
                // Network error
                return {
                    success: false,
                    error: "Network error: " + error.message,
                };
            } else {
                // Other error
                return {
                    success: false,
                    error: error.message,
                };
            }
        }
    }
}