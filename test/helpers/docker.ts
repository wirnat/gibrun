/**
 * Test helpers for Docker-based testing
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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
        await execAsync('docker-compose --profile test up -d');
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
        await execAsync('docker-compose --profile test down');
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
    return 'postgresql://testuser:testpass@localhost:5434/testdb';
}

/**
 * Get HTTP mock server URL
 */
export function getHttpMockUrl(): string {
    return 'http://localhost:8081';
}

/**
 * Get DAP mock server address
 */
export function getDapMockAddress(): { host: string; port: number } {
    return { host: 'localhost', port: 49280 };
}

// Service definitions
export const TEST_SERVICES: DockerService[] = [
    {
        name: 'test-postgres',
        port: 5434,
        healthCheck: async () => {
            try {
                await execAsync('docker-compose --profile test exec -T test-postgres pg_isready -U testuser');
                return true;
            } catch {
                return false;
            }
        }
    },
    {
        name: 'http-mock',
        port: 8081,
        healthCheck: async () => {
            try {
                await execAsync('curl -f http://localhost:8081/__admin/health');
                return true;
            } catch {
                return false;
            }
        }
    },
    {
        name: 'dap-mock',
        port: 49280,
        healthCheck: async () => {
            try {
                await execAsync('nc -z localhost 49280');
                return true;
            } catch {
                return false;
            }
        }
    }
];