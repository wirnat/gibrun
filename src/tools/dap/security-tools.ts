import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { DAPService } from "@/services/dap-service.js";
import { resolveDAPServer } from "@core/dap-handlers.js";

// Security Hardening Tools for DAP

export const DAP_SECURITY_TOOLS: Tool[] = [
    {
        name: "dap_validate_input",
        description: "Validate and sanitize DAP command inputs to prevent injection attacks and ensure safe execution.",
        inputSchema: {
            type: "object",
            properties: {
                command: {
                    type: "string",
                    description: "DAP command to validate"
                },
                arguments: {
                    type: "object",
                    description: "Command arguments to validate"
                },
                strict_mode: {
                    type: "boolean",
                    description: "Enable strict validation mode",
                    default: true
                }
            },
            required: ["command"]
        },
    },
    {
        name: "dap_set_security_limits",
        description: "Configure security limits and timeouts for DAP operations to prevent resource exhaustion and DoS attacks.",
        inputSchema: {
            type: "object",
            properties: {
                max_execution_time_ms: {
                    type: "number",
                    description: "Maximum execution time for DAP operations",
                    default: 30000,
                    minimum: 1000,
                    maximum: 300000
                },
                max_memory_mb: {
                    type: "number",
                    description: "Maximum memory usage limit",
                    default: 100,
                    minimum: 10,
                    maximum: 1000
                },
                max_concurrent_requests: {
                    type: "number",
                    description: "Maximum concurrent DAP requests",
                    default: 5,
                    minimum: 1,
                    maximum: 50
                },
                rate_limit_per_minute: {
                    type: "number",
                    description: "Rate limit for DAP requests per minute",
                    default: 60,
                    minimum: 10,
                    maximum: 1000
                },
                allowed_commands: {
                    type: "array",
                    description: "Whitelist of allowed DAP commands",
                    items: {
                        type: "string"
                    },
                    default: ["initialize", "launch", "attach", "disconnect", "restart", "setBreakpoints", "getBreakpoints", "clearBreakpoints", "continue", "next", "stepIn", "stepOut", "pause", "stackTrace", "variables", "evaluate", "threads"]
                }
            }
        },
    },
    {
        name: "dap_security_audit",
        description: "Perform security audit on DAP configuration and recent operations to identify potential vulnerabilities.",
        inputSchema: {
            type: "object",
            properties: {
                audit_scope: {
                    type: "string",
                    description: "Scope of security audit",
                    enum: ["configuration", "operations", "full"],
                    default: "full"
                },
                include_history: {
                    type: "boolean",
                    description: "Include analysis of recent DAP operations",
                    default: true
                },
                generate_report: {
                    type: "boolean",
                    description: "Generate detailed security report",
                    default: true
                }
            }
        },
    },
    {
        name: "dap_sanitize_expression",
        description: "Sanitize and validate expressions before evaluation to prevent code injection and unsafe operations.",
        inputSchema: {
            type: "object",
            properties: {
                expression: {
                    type: "string",
                    description: "Expression to sanitize and validate"
                },
                context: {
                    type: "string",
                    description: "Evaluation context",
                    enum: ["watch", "repl", "hover", "clipboard"],
                    default: "repl"
                },
                strict_validation: {
                    type: "boolean",
                    description: "Enable strict validation that blocks potentially unsafe expressions",
                    default: true
                }
            },
            required: ["expression"]
        },
    }
];

// Security configuration storage (in production, this would be persisted)
let securityConfig = {
    maxExecutionTimeMs: 30000,
    maxMemoryMb: 100,
    maxConcurrentRequests: 5,
    rateLimitPerMinute: 60,
    allowedCommands: [
        "initialize", "launch", "attach", "disconnect", "restart",
        "setBreakpoints", "getBreakpoints", "clearBreakpoints",
        "continue", "next", "stepIn", "stepOut", "pause",
        "stackTrace", "variables", "evaluate", "threads"
    ]
};

// Rate limiting storage
const requestHistory: number[] = [];
let activeRequests = 0;

function validateDAPCommand(command: string, args: any, strictMode = true): {
    valid: boolean;
    sanitizedArgs?: any;
    warnings: string[];
    errors: string[];
} {
    const result = {
        valid: true,
        sanitizedArgs: { ...args },
        warnings: [] as string[],
        errors: [] as string[]
    };

    // Check if command is allowed
    if (!securityConfig.allowedCommands.includes(command)) {
        result.valid = false;
        result.errors.push(`Command '${command}' is not in the allowed commands list`);
        return result;
    }

    // Validate command-specific arguments
    switch (command) {
        case 'evaluate':
            if (args.expression) {
                const exprValidation = validateExpression(args.expression, strictMode);
                if (!exprValidation.valid) {
                    result.valid = false;
                    result.errors.push(...exprValidation.errors);
                }
                result.warnings.push(...exprValidation.warnings);
            }
            break;

        case 'setBreakpoints':
            if (args.breakpoints) {
                for (const bp of args.breakpoints) {
                    if (bp.condition) {
                        const condValidation = validateExpression(bp.condition, strictMode);
                        if (!condValidation.valid) {
                            result.valid = false;
                            result.errors.push(`Invalid breakpoint condition: ${bp.condition}`);
                        }
                    }
                }
            }
            break;

        case 'variables':
            if (args.count && args.count > 1000) {
                result.warnings.push('Large variable count requested, consider reducing for performance');
            }
            break;
    }

    // Sanitize arguments
    result.sanitizedArgs = sanitizeArguments(args);

    return result;
}

function validateExpression(expression: string, strictMode = true): {
    valid: boolean;
    warnings: string[];
    errors: string[];
} {
    const result = {
        valid: true,
        warnings: [] as string[],
        errors: [] as string[]
    };

    // Basic length check
    if (expression.length > 10000) {
        result.valid = false;
        result.errors.push('Expression too long (max 10000 characters)');
        return result;
    }

    if (strictMode) {
        // Block potentially dangerous patterns
        const dangerousPatterns = [
            /\b(import|require|exec|eval|spawn|fork|process|child_process|fs|path|os|net|http|https)\b/i,
            /\b(__dirname|__filename|global|window|document)\b/i,
            /[`$]/,  // Template literals and shell commands
            /\b(delete|void|typeof|instanceof|in)\b.*\b(function|class|constructor)\b/i
        ];

        for (const pattern of dangerousPatterns) {
            if (pattern.test(expression)) {
                result.valid = false;
                result.errors.push(`Potentially unsafe expression pattern detected: ${pattern.source}`);
            }
        }
    }

    // Check for unbalanced brackets
    const brackets: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
    const openingBrackets = Object.keys(brackets);
    const closingBrackets = Object.values(brackets);
    const stack: string[] = [];

    for (const char of expression) {
        if (openingBrackets.includes(char)) {
            stack.push(char);
        } else if (closingBrackets.includes(char)) {
            const last = stack.pop();
            if (!last || brackets[last] !== char) {
                result.warnings.push('Unbalanced brackets detected');
                break;
            }
        }
    }

    if (stack.length > 0) {
        result.warnings.push('Unclosed brackets detected');
    }

    return result;
}

function sanitizeArguments(args: any): any {
    if (!args || typeof args !== 'object') {
        return args;
    }

    const sanitized = { ...args };

    // Sanitize string values
    for (const [key, value] of Object.entries(sanitized)) {
        if (typeof value === 'string') {
            // Remove null bytes and other potentially problematic characters
            sanitized[key] = value.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
        } else if (typeof value === 'object' && value !== null) {
            sanitized[key] = sanitizeArguments(value);
        }
    }

    return sanitized;
}

function checkRateLimit(): { allowed: boolean; waitTimeMs?: number } {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Clean old requests
    while (requestHistory.length > 0 && requestHistory[0] < oneMinuteAgo) {
        requestHistory.shift();
    }

    if (requestHistory.length >= securityConfig.rateLimitPerMinute) {
        const oldestRequest = requestHistory[0];
        const waitTime = 60000 - (now - oldestRequest);
        return { allowed: false, waitTimeMs: waitTime };
    }

    return { allowed: true };
}

function recordRequest(): void {
    requestHistory.push(Date.now());
    activeRequests++;
}

function releaseRequest(): void {
    activeRequests = Math.max(0, activeRequests - 1);
}

export async function handleDAPValidateInput(dapService: DAPService, args: any) {
    const { command, arguments: cmdArgs, strict_mode = true } = args;

    try {
        const validation = validateDAPCommand(command, cmdArgs, strict_mode);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        tool: "dap_validate_input",
                        command,
                        validation_result: validation.valid ? 'valid' : 'invalid',
                        sanitized_arguments: validation.sanitizedArgs,
                        warnings: validation.warnings,
                        errors: validation.errors,
                        security_level: strict_mode ? 'strict' : 'permissive'
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
                        tool: "dap_validate_input",
                        command,
                        error: error.message
                    }, null, 2),
                },
            ],
            isError: true,
        };
    }
}

export async function handleDAPSetSecurityLimits(dapService: DAPService, args: any) {
    const {
        max_execution_time_ms = 30000,
        max_memory_mb = 100,
        max_concurrent_requests = 5,
        rate_limit_per_minute = 60,
        allowed_commands
    } = args;

    try {
        // Update security configuration
        securityConfig = {
            maxExecutionTimeMs: max_execution_time_ms,
            maxMemoryMb: max_memory_mb,
            maxConcurrentRequests: max_concurrent_requests,
            rateLimitPerMinute: rate_limit_per_minute,
            allowedCommands: allowed_commands || securityConfig.allowedCommands
        };

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        tool: "dap_set_security_limits",
                        security_configuration: securityConfig,
                        status: "Security limits updated successfully",
                        recommendations: [
                            "Monitor resource usage after applying limits",
                            "Test DAP operations to ensure they still work within limits",
                            "Consider adjusting limits based on your environment"
                        ]
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
                        tool: "dap_set_security_limits",
                        error: error.message
                    }, null, 2),
                },
            ],
            isError: true,
        };
    }
}

export async function handleDAPSecurityAudit(dapService: DAPService, args: any) {
    const { audit_scope = 'full', include_history = true, generate_report = true } = args;

    try {
        const audit = {
            timestamp: new Date().toISOString(),
            scope: audit_scope,
            findings: [] as any[],
            recommendations: [] as string[],
            risk_level: 'low' as 'low' | 'medium' | 'high'
        };

        // Audit configuration
        if (audit_scope === 'configuration' || audit_scope === 'full') {
            // Check security limits
            if (securityConfig.maxExecutionTimeMs > 120000) {
                audit.findings.push({
                    type: 'configuration',
                    severity: 'medium',
                    issue: 'Execution timeout too high',
                    description: 'Long execution timeouts increase DoS vulnerability',
                    recommendation: 'Consider reducing max_execution_time_ms to <= 120000ms'
                });
            }

            if (securityConfig.allowedCommands.length === 0) {
                audit.findings.push({
                    type: 'configuration',
                    severity: 'high',
                    issue: 'No command restrictions',
                    description: 'All DAP commands are allowed, increasing attack surface',
                    recommendation: 'Define allowed_commands whitelist'
                });
                audit.risk_level = 'high';
            }

            // Check rate limiting
            if (securityConfig.rateLimitPerMinute > 200) {
                audit.findings.push({
                    type: 'configuration',
                    severity: 'low',
                    issue: 'High rate limit',
                    description: 'Rate limit may allow abuse',
                    recommendation: 'Consider reducing rate_limit_per_minute'
                });
            }
        }

        // Audit operations history
        if ((audit_scope === 'operations' || audit_scope === 'full') && include_history) {
            const recentRequests = requestHistory.filter(time => Date.now() - time < 3600000); // Last hour

            if (recentRequests.length > securityConfig.rateLimitPerMinute * 2) {
                audit.findings.push({
                    type: 'operations',
                    severity: 'medium',
                    issue: 'High request volume',
                    description: `High number of requests in last hour: ${recentRequests.length}`,
                    recommendation: 'Monitor for potential abuse patterns'
                });
            }

            if (activeRequests > securityConfig.maxConcurrentRequests * 0.8) {
                audit.findings.push({
                    type: 'operations',
                    severity: 'low',
                    issue: 'High concurrent requests',
                    description: `Active requests near limit: ${activeRequests}/${securityConfig.maxConcurrentRequests}`,
                    recommendation: 'Monitor concurrent request usage'
                });
            }
        }

        // Generate recommendations
        if (audit.findings.length === 0) {
            audit.recommendations.push('Security configuration appears adequate');
            audit.recommendations.push('Continue monitoring for unusual activity');
        } else {
            audit.recommendations.push('Review and address security findings');
            audit.recommendations.push('Consider implementing additional monitoring');
            audit.recommendations.push('Regular security audits recommended');
        }

        // Determine overall risk level
        const highSeverity = audit.findings.filter(f => f.severity === 'high').length;
        const mediumSeverity = audit.findings.filter(f => f.severity === 'medium').length;

        if (highSeverity > 0) {
            audit.risk_level = 'high';
        } else if (mediumSeverity > 0) {
            audit.risk_level = 'medium';
        }

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        tool: "dap_security_audit",
                        audit_report: generate_report ? audit : { summary: `${audit.findings.length} findings, risk level: ${audit.risk_level}` },
                        summary: {
                            total_findings: audit.findings.length,
                            high_severity: audit.findings.filter(f => f.severity === 'high').length,
                            medium_severity: audit.findings.filter(f => f.severity === 'medium').length,
                            low_severity: audit.findings.filter(f => f.severity === 'low').length,
                            risk_level: audit.risk_level
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
                        tool: "dap_security_audit",
                        audit_scope,
                        error: error.message
                    }, null, 2),
                },
            ],
            isError: true,
        };
    }
}

export async function handleDAPSanitizeExpression(dapService: DAPService, args: any) {
    const { expression, context = 'repl', strict_validation = true } = args;

    try {
        const validation = validateExpression(expression, strict_validation);

        let sanitizedExpression = expression;
        if (validation.valid) {
            // Basic sanitization
            sanitizedExpression = expression.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
        }

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        tool: "dap_sanitize_expression",
                        original_expression: expression,
                        sanitized_expression: sanitizedExpression,
                        context,
                        validation_result: validation.valid ? 'valid' : 'invalid',
                        warnings: validation.warnings,
                        errors: validation.errors,
                        validation_mode: strict_validation ? 'strict' : 'permissive',
                        safe_to_evaluate: validation.valid
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
                        tool: "dap_sanitize_expression",
                        expression,
                        error: error.message
                    }, null, 2),
                },
            ],
            isError: true,
        };
    }
}

// Export security utilities for use by other components
export {
    validateDAPCommand,
    validateExpression,
    sanitizeArguments,
    checkRateLimit,
    recordRequest,
    releaseRequest,
    securityConfig
};