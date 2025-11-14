/**
 * Test helpers for Docker-based testing
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Generate unique test session ID and ports
const TEST_SESSION_ID = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
const TEST_POSTGRES_PORT = 50000 + Math.floor(Math.random() * 1000);
const TEST_HTTP_PORT = 40000 + Math.floor(Math.random() * 1000);
const TEST_DAP_PORT = 30000 + Math.floor(Math.random() * 1000);

export interface DockerService {
    name: string;
    port: number;
    healthCheck: () => Promise<boolean>;
}

/**
 * Check if a Docker service is healthy
 */
export async function isServiceHealthy(service: DockerService): Promise<boolean> {
    try {
        return await service.healthCheck();
    } catch (error) {
        return false;
    }
}

/**
 * Wait for a service to be healthy with timeout
 */
export async function waitForService(
    service: DockerService,
    timeoutMs: number = 30000,
    intervalMs: number = 1000
): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        if (await isServiceHealthy(service)) {
            return;
        }
        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    throw new Error(`Service ${service.name} did not become healthy within ${timeoutMs}ms`);
}

/**
 * Start Docker services for testing
 */
export async function startTestServices(): Promise<void> {
    try {
        console.log('Starting test Docker services...');
        // Set environment variables for unique container names and ports
        const env = {
            ...process.env,
            TEST_CONTAINER_PREFIX: TEST_SESSION_ID,
            TEST_POSTGRES_PORT: TEST_POSTGRES_PORT.toString(),
            TEST_HTTP_PORT: TEST_HTTP_PORT.toString(),
            TEST_DAP_PORT: TEST_DAP_PORT.toString()
        };

        await execAsync('docker-compose --profile test up -d', { env });
        console.log('Test services started successfully');
    } catch (error) {
        console.error('Failed to start test services:', error);
        throw error;
    }
}

/**
 * Stop Docker services for testing
 */
export async function stopTestServices(): Promise<void> {
    try {
        console.log('Stopping test Docker services...');
        // Set environment variables for unique container names
        const env = {
            ...process.env,
            TEST_CONTAINER_PREFIX: TEST_SESSION_ID,
            TEST_POSTGRES_PORT: TEST_POSTGRES_PORT.toString(),
            TEST_HTTP_PORT: TEST_HTTP_PORT.toString(),
            TEST_DAP_PORT: TEST_DAP_PORT.toString()
        };

        await execAsync('docker-compose --profile test down --volumes --remove-orphans', { env });
        // Also clean up any orphaned containers
        await execAsync('docker container prune -f');
        console.log('Test services stopped successfully');
    } catch (error) {
        console.error('Failed to stop test services:', error);
        throw error;
    }
}

/**
 * Get test database connection string
 */
export function getTestDatabaseUrl(): string {
    return `postgresql://testuser:testpass@localhost:${TEST_POSTGRES_PORT}/testdb`;
}

/**
 * Get HTTP mock server URL
 */
export function getHttpMockUrl(): string {
    return `http://localhost:${TEST_HTTP_PORT}`;
}

/**
 * Get DAP mock server address
 */
export function getDapMockAddress(): { host: string; port: number } {
    return { host: 'localhost', port: TEST_DAP_PORT };
}

// Service definitions
export const TEST_SERVICES: DockerService[] = [
    {
        name: 'test-postgres',
        port: TEST_POSTGRES_PORT,
        healthCheck: async () => {
            try {
                const containerName = `${TEST_SESSION_ID}-test-postgres`;
                await execAsync(`docker exec ${containerName} pg_isready -U testuser`);
                return true;
            } catch {
                return false;
            }
        }
    },
    {
        name: 'http-mock',
        port: TEST_HTTP_PORT,
        healthCheck: async () => {
            try {
                await execAsync(`curl -f http://localhost:${TEST_HTTP_PORT}/__admin/health`);
                return true;
            } catch {
                return false;
            }
        }
    },
    {
        name: 'dap-mock',
        port: TEST_DAP_PORT,
        healthCheck: async () => {
            try {
                await execAsync(`nc -z localhost ${TEST_DAP_PORT}`);
                return true;
            } catch {
                return false;
            }
        }
    }
];