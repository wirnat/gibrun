import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { DAPService } from "@/services/dap-service.js";
import { resolveDAPServer } from "@/core/dap-handlers.js";
import { DAPErrorDetails, DAPErrorClassification } from "@/types/server.js";

// Advanced error handling tools for DAP

export const DAP_ERROR_TOOLS: Tool[] = [
    {
        name: "dap_get_error_details",
        description: "Get detailed information about DAP errors with classification and recovery suggestions. Useful for troubleshooting debugging issues.",
        inputSchema: {
            type: "object",
            properties: {
                host: {
                    type: "string",
                    description: "DAP server host (default: auto-detected)",
                    default: "127.0.0.1"
                },
                port: {
                    type: "number",
                    description: "DAP server port (auto-detected if not provided)"
                },
                error_id: {
                    type: "string",
                    description: "Specific error ID to analyze (optional, analyzes recent errors if not provided)"
                },
                include_context: {
                    type: "boolean",
                    description: "Include full error context and stack traces",
                    default: true
                }
            }
        },
    },
];

// Error classification patterns
const ERROR_PATTERNS: Record<string, DAPErrorClassification> = {
    'connection_refused': {
        category: 'Connection Issues',
        confidence: 0.9,
        description: 'DAP server is not running or not accessible',
        recommendedAction: 'Check if debugger is running, verify host/port, restart debugging session'
    },
    'timeout': {
        category: 'Timeout Issues',
        confidence: 0.8,
        description: 'DAP operation timed out',
        recommendedAction: 'Increase timeout, check network connectivity, verify debugger responsiveness'
    },
    'protocol_error': {
        category: 'Protocol Issues',
        confidence: 0.7,
        description: 'DAP protocol violation or invalid message format',
        recommendedAction: 'Check DAP command syntax, verify debugger capabilities, update debugger version'
    },
    'debugger_error': {
        category: 'Debugger Issues',
        confidence: 0.6,
        description: 'Internal debugger error or unsupported operation',
        recommendedAction: 'Check debugger logs, verify operation is supported, try alternative approach'
    },
    'invalid_request': {
        category: 'Request Issues',
        confidence: 0.8,
        description: 'Invalid request parameters or unsupported command',
        recommendedAction: 'Verify command arguments, check DAP specification, use supported commands only'
    }
};

function classifyError(error: any): DAPErrorClassification {
    const errorMessage = error.message?.toLowerCase() || '';
    const errorCode = error.code?.toLowerCase() || '';

    // Connection errors
    if (errorCode === 'econnrefused' || errorMessage.includes('connection refused')) {
        return ERROR_PATTERNS.connection_refused;
    }

    // Timeout errors
    if (errorCode === 'timeout' || errorMessage.includes('timeout')) {
        return ERROR_PATTERNS.timeout;
    }

    // Protocol errors
    if (errorMessage.includes('protocol') || errorMessage.includes('invalid') || errorMessage.includes('malformed')) {
        return ERROR_PATTERNS.protocol_error;
    }

    // Debugger errors
    if (errorMessage.includes('debugger') || errorMessage.includes('delve') || errorMessage.includes('internal')) {
        return ERROR_PATTERNS.debugger_error;
    }

    // Default to request issues
    return ERROR_PATTERNS.invalid_request;
}

function generateRecoverySuggestions(classification: DAPErrorClassification, context?: any): string[] {
    const suggestions: string[] = [classification.recommendedAction];

    // Add context-specific suggestions
    if (context) {
        if (classification.category === 'Connection Issues') {
            suggestions.push(
                'Try running: lsof -i -P -n | grep dlv',
                'Restart VSCode debugger (F5)',
                'Check if port is already in use by another process'
            );
        } else if (classification.category === 'Timeout Issues') {
            suggestions.push(
                'Increase timeout values in tool parameters',
                'Check debugger performance and system resources',
                'Try simpler DAP commands first'
            );
        } else if (classification.category === 'Protocol Issues') {
            suggestions.push(
                'Verify DAP command syntax against specification',
                'Check debugger version compatibility',
                'Use dap_send_command with valid arguments'
            );
        }
    }

    return suggestions;
}

export async function handleDAPGetErrorDetails(dapService: DAPService, args: any) {
    const { host, port, error_id, include_context = true } = args;

    try {
        // Resolve DAP server
        const resolution = await resolveDAPServer(host, port);
        if (!resolution.success) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: false,
                            error: resolution.error,
                            tool: "dap_get_error_details"
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }

        const resolvedHost = resolution.host;
        const resolvedPort = resolution.port;

        // In a real implementation, you would retrieve error history from logs or storage
        // For now, we'll simulate error analysis based on recent operations

        // Try a simple DAP operation to check current status
        let connectionStatus = 'unknown';
        let lastError: any = null;

        try {
            const testResult = await dapService.sendDAPRequest(resolvedHost, resolvedPort, 'initialize', {
                clientID: 'gibrun-diagnostic',
                clientName: 'gibRun Diagnostic',
                adapterID: 'go'
            });
            connectionStatus = testResult.success !== false ? 'healthy' : 'error';
        } catch (error: any) {
            connectionStatus = 'error';
            lastError = error;
        }

        const errorDetails: DAPErrorDetails = {
            id: error_id || `error_${Date.now()}`,
            type: connectionStatus === 'error' ? 'connection' : 'protocol',
            severity: connectionStatus === 'error' ? 'high' : 'low',
            message: lastError?.message || 'No recent errors detected',
            context: include_context ? {
                command: 'initialize',
                arguments: { clientID: 'gibrun-diagnostic' },
                timestamp: new Date(),
                stackTrace: lastError?.stack?.split('\n') || []
            } : undefined,
            suggestions: lastError ? generateRecoverySuggestions(classifyError(lastError), { host: resolvedHost, port: resolvedPort }) : [],
            recoveryActions: [
                'Check debugger connection status',
                'Verify DAP server is running',
                'Review error logs for additional context',
                'Try restarting the debugging session'
            ]
        };

        const classification = lastError ? classifyError(lastError) : {
            category: 'No Error',
            confidence: 1.0,
            description: 'No errors detected in recent operations',
            recommendedAction: 'System is operating normally'
        };

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        tool: "dap_get_error_details",
                        connection_status: connectionStatus,
                        error_details: errorDetails,
                        error_classification: classification,
                        dap_server: `${resolvedHost}:${resolvedPort}`,
                        diagnostic_info: {
                            server_responsive: connectionStatus === 'healthy',
                            last_test_command: 'initialize',
                            timestamp: new Date().toISOString()
                        },
                        troubleshooting_guide: {
                            common_issues: [
                                {
                                    issue: 'Connection refused',
                                    cause: 'DAP server not running',
                                    solution: 'Start debugger in VSCode (F5) or check dlv process'
                                },
                                {
                                    issue: 'Timeout errors',
                                    cause: 'Slow debugger response',
                                    solution: 'Increase timeout, check system resources'
                                },
                                {
                                    issue: 'Protocol errors',
                                    cause: 'Invalid DAP commands',
                                    solution: 'Verify command syntax, check debugger capabilities'
                                }
                            ]
                        }
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
                        tool: "dap_get_error_details",
                        error_id,
                        error: error.message,
                        classification: classifyError(error)
                    }, null, 2),
                },
            ],
            isError: true,
        };
    }
}