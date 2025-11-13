import { Tool } from "@modelcontextprotocol/sdk/types.js";

// Utility functions for server operations

export function mergeToolLists(primary: Tool[], secondary: Tool[]): Tool[] {
    const merged = [...primary];
    const primaryNames = new Set(primary.map(tool => tool.name));

    for (const tool of secondary) {
        if (!primaryNames.has(tool.name)) {
            merged.push(tool);
        }
    }

    return merged;
}

export function createErrorResult(message: string, meta?: Record<string, unknown>) {
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    success: false,
                    error: message,
                    ...(meta ? { meta } : {})
                }, null, 2),
            },
        ],
        isError: true,
    };
}