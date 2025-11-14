import { Pool } from "pg";
import { logError } from "./logger-service.js";

export class DatabaseService {
    private pools = new Map<string, Pool>();

    constructor() {}

    private getPool(connectionString: string): Pool {
        if (!this.pools.has(connectionString)) {
            const pool = new Pool({
                connectionString,
                max: 10,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 2000,
            });
            this.pools.set(connectionString, pool);
        }
        return this.pools.get(connectionString)!;
    }

    private resolveConnectionString(connectionString?: string): string {
        if (connectionString) {
            return connectionString;
        }

        const envConnectionString = process.env.POSTGRES_CONNECTION_STRING;
        if (envConnectionString) {
            return envConnectionString;
        }

        const host = process.env.POSTGRES_HOST || "localhost";
        const port = process.env.POSTGRES_PORT || "5432";
        const database = process.env.POSTGRES_DB || "postgres";
        const user = process.env.POSTGRES_USER || "postgres";
        const password = process.env.POSTGRES_PASSWORD;

        if (!password) {
            throw new Error(
                "PostgreSQL password not provided. Set POSTGRES_PASSWORD environment variable or provide connection_string."
            );
        }

        return `postgresql://${user}:${password}@${host}:${port}/${database}`;
    }

    async executeQuery(connectionString: string | undefined, query: string, params: any[] = []) {
        try {
            const connString = this.resolveConnectionString(connectionString);
            const pool = this.getPool(connString);
            const result = await pool.query(query, params);

            return {
                success: true,
                rowCount: result.rowCount,
                rows: result.rows,
                fields: result.fields.map((f) => ({
                    name: f.name,
                    dataTypeID: f.dataTypeID,
                })),
            };
        } catch (error: any) {
            logError("Database query failed", error, { query, params });
            return {
                success: false,
                error: error.message,
                code: error.code,
            };
        }
    }

    async closeAllPools(): Promise<void> {
        for (const pool of this.pools.values()) {
            await pool.end();
        }
        this.pools.clear();
    }
}