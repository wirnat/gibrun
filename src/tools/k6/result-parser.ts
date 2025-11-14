import { logError, logInfo } from "@/services/logger-service.js";

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

export class K6ResultParser {
    parseJSONResult(jsonOutput: string): Partial<K6TestResult> {
        try {
            if (!jsonOutput || jsonOutput.trim() === '') {
                return {};
            }

            const data = JSON.parse(jsonOutput);

            if (!data.metrics) {
                return { metrics: data };
            }

            const summary = this.extractSummary(data);
            const thresholds = this.parseThresholds(data.thresholds || []);
            const errors = data.errors || [];

            return {
                summary,
                thresholds,
                errors,
                metrics: data.metrics
            };

        } catch (error: any) {
            logError("Failed to parse K6 JSON result", error, { jsonOutput: jsonOutput.substring(0, 500) });
            return {
                errors: [{ message: `Failed to parse results: ${error.message}` }]
            };
        }
    }

    private extractSummary(data: any): K6TestResult['summary'] {
        const metrics = data.metrics || {};

        return {
            totalRequests: this.getMetricValue(metrics, 'http_reqs', 'count') || 0,
            failedRequests: this.getMetricValue(metrics, 'http_req_failed', 'rate') || 0,
            avgResponseTime: this.getMetricValue(metrics, 'http_req_duration', 'avg') || 0,
            p95ResponseTime: this.getMetricValue(metrics, 'http_req_duration', 'p(95)') || 0,
            p99ResponseTime: this.getMetricValue(metrics, 'http_req_duration', 'p(99)') || 0
        };
    }

    private getMetricValue(metrics: any, metricName: string, valueType: string): number | null {
        const metric = metrics[metricName];
        if (!metric || !metric.values) {
            return null;
        }

        if (valueType === 'rate') {
            return metric.values.rate || null;
        }

        return metric.values[valueType] || null;
    }

    private parseThresholds(thresholds: any): any[] {
        if (!thresholds || !Array.isArray(thresholds)) {
            return [];
        }

        return thresholds.map(threshold => ({
            name: threshold.name || 'unknown',
            ok: threshold.ok || false,
            value: threshold.value || 0
        }));
    }

    parseTextOutput(textOutput: string): Partial<K6TestResult> {
        try {
            // Parse text output for basic information
            const lines = textOutput.split('\n');
            const summary: any = {};
            const errors: any[] = [];

            for (const line of lines) {
                // Look for common patterns in K6 output
                if (line.includes('http_reqs:')) {
                    const match = line.match(/http_reqs:\s*(\d+)/);
                    if (match) summary.totalRequests = parseInt(match[1]);
                }

                if (line.includes('http_req_failed:')) {
                    const match = line.match(/http_req_failed:\s*([\d.]+)/);
                    if (match) summary.failedRequests = parseFloat(match[1]);
                }

                if (line.includes('http_req_duration')) {
                    const avgMatch = line.match(/avg=([\d.]+ms)/);
                    if (avgMatch) summary.avgResponseTime = this.parseDuration(avgMatch[1]);

                    const p95Match = line.match(/p\(95\)=([\d.]+ms)/);
                    if (p95Match) summary.p95ResponseTime = this.parseDuration(p95Match[1]);

                    const p99Match = line.match(/p\(99\)=([\d.]+ms)/);
                    if (p99Match) summary.p99ResponseTime = this.parseDuration(p99Match[1]);
                }

                // Collect errors
                if (line.includes('ERROR') || line.includes('error')) {
                    errors.push({ message: line.trim() });
                }
            }

            return {
                summary: Object.keys(summary).length > 0 ? summary : undefined,
                errors: errors.length > 0 ? errors : undefined,
                output: textOutput
            };

        } catch (error: any) {
            logError("Failed to parse K6 text output", error);
            return {
                errors: [{ message: `Failed to parse output: ${error.message}` }],
                output: textOutput
            };
        }
    }

    private parseDuration(durationStr: string): number {
        // Convert duration strings like "123.45ms" to numbers
        const match = durationStr.match(/([\d.]+)ms/);
        return match ? parseFloat(match[1]) : 0;
    }

    generateHTMLReport(result: K6TestResult): string {
        const summary = result.summary || {};
        const thresholds = result.thresholds || [];
        const errors = result.errors || [];

        return `
<!DOCTYPE html>
<html>
<head>
    <title>K6 Load Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .summary { background: #f0f0f0; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .metric { display: inline-block; margin: 10px; text-align: center; }
        .metric-value { font-size: 24px; font-weight: bold; color: #007acc; }
        .metric-label { font-size: 12px; color: #666; }
        .thresholds { margin-bottom: 20px; }
        .threshold { padding: 10px; margin: 5px 0; border-left: 4px solid #007acc; background: #f9f9f9; }
        .threshold.ok { border-left-color: #28a745; }
        .threshold.fail { border-left-color: #dc3545; }
        .errors { color: #dc3545; }
        .success { color: #28a745; }
    </style>
</head>
<body>
    <h1>K6 Load Test Report</h1>

    <div class="summary">
        <h2>Test Summary</h2>
        <div class="metric">
            <div class="metric-value">${(summary as any).totalRequests || 0}</div>
            <div class="metric-label">Total Requests</div>
        </div>
        <div class="metric">
            <div class="metric-value">${(summary as any).failedRequests ? ((summary as any).failedRequests * 100).toFixed(1) : 0}%</div>
            <div class="metric-label">Failed Requests</div>
        </div>
        <div class="metric">
            <div class="metric-value">${(summary as any).avgResponseTime ? (summary as any).avgResponseTime.toFixed(0) : 0}ms</div>
            <div class="metric-label">Avg Response Time</div>
        </div>
        <div class="metric">
            <div class="metric-value">${(summary as any).p95ResponseTime ? (summary as any).p95ResponseTime.toFixed(0) : 0}ms</div>
            <div class="metric-label">95th Percentile</div>
        </div>
        <div class="metric">
            <div class="metric-value">${(summary as any).p99ResponseTime ? (summary as any).p99ResponseTime.toFixed(0) : 0}ms</div>
            <div class="metric-label">99th Percentile</div>
        </div>
    </div>

    <div class="thresholds">
        <h2>Threshold Results</h2>
        ${thresholds.map(t => `
            <div class="threshold ${(t as any).ok ? 'ok' : 'fail'}">
                <strong>${(t as any).name}</strong>: ${(t as any).ok ? 'PASSED' : 'FAILED'} (value: ${(t as any).value})
            </div>
        `).join('')}
    </div>

    ${errors.length > 0 ? `
    <div class="errors">
        <h2>Errors</h2>
        <ul>
            ${errors.map(e => `<li>${(e as any).message}</li>`).join('')}
        </ul>
    </div>
    ` : ''}

    <div class="execution-info">
        <h2>Execution Info</h2>
        <p><strong>Status:</strong> <span class="${result.success ? 'success' : 'errors'}">${result.success ? 'SUCCESS' : 'FAILED'}</span></p>
        ${result.execution_time_ms ? `<p><strong>Execution Time:</strong> ${result.execution_time_ms}ms</p>` : ''}
        ${result.cloud_test_id ? `<p><strong>Cloud Test ID:</strong> ${result.cloud_test_id}</p>` : ''}
    </div>
</body>
</html>`;
    }
}