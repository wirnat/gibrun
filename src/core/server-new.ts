import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    Tool,
} from "@modelcontextprotocol/sdk/types.js";

import { GoDebuggerProxy, DAPService } from "@/services/dap-service.js";
import { logError, logInfo } from "@/services/logger-service.js";
import { DatabaseService } from "@/services/database-service.js";
import { HttpService } from "@/services/http-service.js";

// Import modular components
import { mergeToolLists, createErrorResult } from "./server-utils.js";
import { dbPools } from "./database-legacy.js";
import {
    handlePostgresQuery,
    handleHttpRequest,
    handleReadSourceFile,
    handleWriteSourceFile,
    handleExecuteShellCommand
} from "./tool-handlers.js";
import {
    handleDAPRestart,
    handleDAPSendCommand,
    // Breakpoint tools
    handleDAPSetBreakpoints,
    handleDAPGetBreakpoints,
    handleDAPClearBreakpoints,
    // Execution control tools
    handleDAPContinue,
    handleDAPStepOver,
    handleDAPStepInto,
    handleDAPStepOut,
    handleDAPPause,
    // Variable inspection tools
    handleDAPEvaluate,
    handleDAPVariables,
    handleDAPStackTrace
} from "@/tools/dap/index.js";

// Import tool definitions
import { DATABASE_TOOLS } from "@/tools/database/index.js";
import { HTTP_TOOLS } from "@/tools/http/index.js";
import { FILE_SYSTEM_TOOLS } from "@/tools/file-system/index.js";
import { DAP_TOOLS } from "@/tools/dap/index.js";

const goDebuggerProxy = new GoDebuggerProxy(process.cwd());

// Service instances
const databaseService = new DatabaseService();
const httpService = new HttpService();
const dapService = new DAPService();

// Tool definitions
const LOCAL_TOOLS: Tool[] = mergeToolLists(
    mergeToolLists(
        mergeToolLists(DATABASE_TOOLS, HTTP_TOOLS),
        FILE_SYSTEM_TOOLS
    ),
    DAP_TOOLS
);

async function main() {
    const server = new Server(
        {
            name: "gibRun-mcp-server",
            version: "1.0.0",
        },
        {}
    );

    // Get legacy tools
    const LEGACY_TOOLS = await goDebuggerProxy.listTools();

    // Register request handlers
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        const allTools = mergeToolLists(LOCAL_TOOLS, LEGACY_TOOLS);
        return { tools: allTools };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;

        try {
            switch (name) {
                // Database tools
                case "postgres_query":
                    return await handlePostgresQuery(databaseService, args);

                // HTTP tools
                case "http_request":
                    return await handleHttpRequest(httpService, args);

                // File system tools
                case "read_source_file":
                    return await handleReadSourceFile(args);
                case "write_source_file":
                    return await handleWriteSourceFile(args);
                case "execute_shell_command":
                    return await handleExecuteShellCommand(args);

                // DAP tools
                case "dap_restart":
                    return await handleDAPRestart(dapService, args);
                case "dap_send_command":
                    return await handleDAPSendCommand(dapService, args);

                // Breakpoint management tools
                case "dap_set_breakpoints":
                    return await handleDAPSetBreakpoints(dapService, args);
                case "dap_get_breakpoints":
                    return await handleDAPGetBreakpoints(dapService, args);
                case "dap_clear_breakpoints":
                    return await handleDAPClearBreakpoints(dapService, args);

                // Execution control tools
                case "dap_continue":
                    return await handleDAPContinue(dapService, args);
                case "dap_step_over":
                    return await handleDAPStepOver(dapService, args);
                case "dap_step_into":
                    return await handleDAPStepInto(dapService, args);
                case "dap_step_out":
                    return await handleDAPStepOut(dapService, args);
                case "dap_pause":
                    return await handleDAPPause(dapService, args);

                // Variable inspection tools
                case "dap_evaluate":
                    return await handleDAPEvaluate(dapService, args);
                case "dap_variables":
                    return await handleDAPVariables(dapService, args);
                case "dap_stack_trace":
                    return await handleDAPStackTrace(dapService, args);

                // Legacy tools (delegate to GoDebuggerProxy)
                default:
                    try {
                        return await goDebuggerProxy.callTool(name, args);
                    } catch (legacyError) {
                        logError("Tool not found", new Error(`Unknown tool: ${name}`), { requestedTool: name });
                        return createErrorResult(`Tool '${name}' not found`);
                    }
            }
        } catch (error: any) {
            logError("Tool execution failed", error, { tool: name, args });
            return createErrorResult(`Tool execution failed: ${error.message}`);
        }
    });

    const transport = new StdioServerTransport();

    try {
        logInfo("Starting gibRun MCP Server");
        await server.connect(transport);
        logInfo("gibRun MCP Server connected and ready");
    } catch (error) {
        logError("Failed to start MCP server", error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGINT', async () => {
    logInfo("Shutting down gibRun MCP Server");

    // Close database pools
    for (const pool of dbPools.values()) {
        await pool.end();
    }

    // Close DAP connections
    await goDebuggerProxy.shutdown();

    process.exit(0);
});

main().catch((error) => {
    logError("Fatal error in main", error);
    process.exit(1);
});