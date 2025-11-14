import { Pool } from "pg";
import { DatabaseService } from "@/services/database-service.js";

export class DatabaseOperations {
  private static dbPools = new Map<string, Pool>();

  static parseMemoryLimit(limit: string): number {
    const match = limit.match(/^(\d+)([KMGT]?)B?$/i);
    if (!match) return 256 * 1024 * 1024; // Default 256MB

    const value = parseInt(match[1]);
    const unit = match[2].toUpperCase();

    const multipliers: { [key: string]: number } = {
      '': 1,
      'K': 1024,
      'M': 1024 * 1024,
      'G': 1024 * 1024 * 1024,
      'T': 1024 * 1024 * 1024 * 1024
    };

    return value * multipliers[unit];
  }

  static getPool(connectionString: string): Pool {
    if (!DatabaseOperations.dbPools.has(connectionString)) {
      const pool = new Pool({
        connectionString,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      DatabaseOperations.dbPools.set(connectionString, pool);
    }

    return DatabaseOperations.dbPools.get(connectionString)!;
  }

  static resolveConnectionString(connectionString?: string): string {
    if (connectionString) return connectionString;

    // Try environment variables
    const host = process.env.PGHOST || 'localhost';
    const port = process.env.PGPORT || '5432';
    const database = process.env.PGDATABASE || 'postgres';
    const user = process.env.PGUSER || 'postgres';
    const password = process.env.PGPASSWORD;

    if (password) {
      return `postgresql://${user}:${password}@${host}:${port}/${database}`;
    } else {
      return `postgresql://${user}@${host}:${port}/${database}`;
    }
  }

  static buildGoProjectHints(projectPath: string): any {
    // This function would analyze Go project structure
    // For now, return basic hints
    return {
      go_version: "1.21",
      module_name: "example",
      dependencies: [],
      build_tags: []
    };
  }

  static async handlePostgresQuery(args: any) {
    const { connection_string, query, params = [] } = args;

    const databaseService = new DatabaseService();
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
}