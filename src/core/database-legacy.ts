import { Pool } from "pg";

// Legacy database functions - to be removed after full migration to DatabaseService

// PostgreSQL connection pools - LEGACY: will be removed after migration
export const dbPools = new Map<string, Pool>();

export function getPool(connectionString: string): Pool {
    if (!dbPools.has(connectionString)) {
        // This is legacy code - should use DatabaseService instead
        const pool = new Pool({ connectionString });
        dbPools.set(connectionString, pool);
    }
    return dbPools.get(connectionString)!;
}

export function resolveConnectionString(connectionString?: string): string {
    if (connectionString) {
        return connectionString;
    }

    // Build from environment variables (legacy approach)
    const host = process.env.POSTGRES_HOST || 'localhost';
    const port = process.env.POSTGRES_PORT || '5432';
    const database = process.env.POSTGRES_DB || 'postgres';
    const user = process.env.POSTGRES_USER || 'postgres';
    const password = process.env.POSTGRES_PASSWORD;

    if (!password) {
        throw new Error('PostgreSQL password not provided. Set POSTGRES_PASSWORD environment variable.');
    }

    return `postgresql://${user}:${password}@${host}:${port}/${database}`;
}