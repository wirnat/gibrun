import { K6ToolManager } from "./manager.js";
import { K6ScriptGenerator } from "./generator.js";
import { logError, logInfo } from "@/services/logger-service.js";

const k6ToolManager = new K6ToolManager();
const k6ScriptGenerator = new K6ScriptGenerator();

export async function handleK6LoadTestExecute(args: any) {
    try {
        logInfo("Executing K6 load test", { args });

        const result = await k6ToolManager.executeTest(args);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2),
                },
            ],
        };
    } catch (error: any) {
        logError("K6 load test execution failed", error, { args });
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(
                        {
                            success: false,
                            error: error.message,
                            args,
                        },
                        null,
                        2
                    ),
                },
            ],
            isError: true,
        };
    }
}

export async function handleK6ScriptGenerate(args: any) {
    try {
        logInfo("Generating K6 script", { args });

        const script = await k6ScriptGenerator.generateScript(args);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(
                        {
                            success: true,
                            script_path: args.output_path,
                            script_preview: script.substring(0, 500) + (script.length > 500 ? "..." : ""),
                            full_script_length: script.length,
                        },
                        null,
                        2
                    ),
                },
            ],
        };
    } catch (error: any) {
        logError("K6 script generation failed", error, { args });
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(
                        {
                            success: false,
                            error: error.message,
                            args,
                        },
                        null,
                        2
                    ),
                },
            ],
            isError: true,
        };
    }
}