import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { DatabaseService } from "@/services/database-service.js";

export const DATABASE_TOOLS: Tool[] = [
    {
        name: "postgres_query",
        description:
            "Execute a PostgreSQL query. Useful for getting UIDs, checking data, or verifying API results in database. Returns query results as JSON.",
        inputSchema: {
            type: "object",
            properties: {
                connection_string: {
                    type: "string",
                    description:
                        "PostgreSQL connection string (e.g., postgresql://user:password@localhost:5432/dbname). When omitted, the server will build one from POSTGRES_* environment variables or POSTGRES_CONNECTION_STRING.",
                },
                query: {
                    type: "string",
                    description: "SQL query to execute",
                },
                params: {
                    type: "array",
                    items: { type: "string" },
                    description: "Optional query parameters for parameterized queries",
                },
            },
            required: ["query"],
        },
    },
];

export async function handlePostgresQuery(databaseService: DatabaseService, args: any) {
    const { connection_string, query, params = [] } = args;

    const result = await databaseService.executeQuery(connection_string, query, params);

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