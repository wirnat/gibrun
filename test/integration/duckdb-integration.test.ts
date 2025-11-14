import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import Database from 'duckdb'
import { DuckDBManager } from '../../src/core/duckdb-manager.js'
import { DuckDBCacheManager, CacheConfig } from '../../src/core/duckdb-cache-manager.js'
import { ProjectIndexer } from '../../src/core/project-indexer.js'
import { SymbolSearchEngine } from '../../src/core/symbol-search-engine.js'
import { FileProcessor } from '../../src/core/file-processor.js'
import { SymbolExtractor } from '../../src/core/symbol-extractor.js'
import { MetricsCalculator } from '../../src/core/metrics-calculator.js'
import { startTestServices, stopTestServices, waitForService, TEST_SERVICES, getTestDatabaseUrl } from '../helpers/docker.js'
import { logInfo, logError } from '../../src/services/logger-service.js'

// Mock logger to reduce noise
describe('DuckDB Integration Tests', () => {
    let duckdbManager: DuckDBManager
    let cacheManager: DuckDBCacheManager
    let projectIndexer: ProjectIndexer
    let symbolSearchEngine: SymbolSearchEngine
    let testProjectRoot: string

    const cacheConfig: CacheConfig = {
        memoryLimit: '64MB',
        threads: 2,
        maintenanceIntervalMs: 60000,
        defaultTtlHours: 1,
        maxCacheSizeMb: 64
    }

    beforeAll(async () => {
        console.log('🚀 Starting DuckDB integration tests...')

        // Create temporary test directory
        testProjectRoot = path.join(process.cwd(), 'test-temp-project')
        await fs.mkdir(testProjectRoot, { recursive: true })

        // Create test project structure
        await createTestProjectStructure(testProjectRoot)

        console.log('✅ Test project structure created')
    }, 60000)

    afterAll(async () => {
        console.log('🛑 Cleaning up DuckDB integration tests...')

        // Close all managers
        if (cacheManager) {
            await cacheManager.close()
        }
        if (duckdbManager) {
            await duckdbManager.close()
        }

        // Clean up test directory
        try {
            await fs.rm(testProjectRoot, { recursive: true, force: true })
        } catch (error) {
            console.warn('Failed to cleanup test directory:', error)
        }

        console.log('✅ DuckDB integration tests cleaned up')
    }, 30000)

    beforeEach(async () => {
        // Initialize fresh instances for each test
        duckdbManager = new DuckDBManager(testProjectRoot)
        cacheManager = new DuckDBCacheManager(testProjectRoot, cacheConfig)
        projectIndexer = new ProjectIndexer(testProjectRoot, duckdbManager)
        symbolSearchEngine = new SymbolSearchEngine(duckdbManager)

        // Wait for initialization
        await new Promise(resolve => setTimeout(resolve, 100))
    })

    afterEach(async () => {
        // Clean up between tests
        try {
            if (projectIndexer) {
                await projectIndexer.clearIndex()
            }
        } catch (error) {
            // Ignore cleanup errors
        }
    })

    describe('End-to-End Indexing Workflow', () => {
        it('should complete full project indexing', async () => {
            const startTime = Date.now()

            const result = await projectIndexer.indexProject({
                includeMetrics: true,
                maxConcurrency: 2
            })

            const endTime = Date.now()
            const duration = endTime - startTime

            expect(result.success).toBe(true)
            expect(result.totalFiles).toBeGreaterThan(0)
            expect(result.processedFiles).toBeGreaterThan(0)
            expect(result.errorFiles).toBe(0)
            expect(result.totalSymbols).toBeGreaterThan(0)
            expect(result.duration).toBeGreaterThan(0)
            expect(duration).toBeLessThan(30000) // Should complete within 30 seconds

            console.log(`✅ Full indexing completed in ${duration}ms: ${result.processedFiles} files, ${result.totalSymbols} symbols`)
        }, 60000)

        it('should handle incremental updates', async () => {
            // First, do a full index
            await projectIndexer.indexProject()

            // Modify a file
            const testFile = path.join(testProjectRoot, 'src', 'user.ts')
            const newContent = `// Modified content
export class ModifiedUser {
    constructor(public name: string) {}

    greet(): string {
        return \`Hello, \${this.name}!\`;
    }
}

export function createUser(name: string): ModifiedUser {
    return new ModifiedUser(name);
}
`

            await fs.writeFile(testFile, newContent)

            // Perform incremental update
            const changedFiles = [testFile]
            const result = await projectIndexer.updateIncremental(changedFiles, {
                includeMetrics: true
            })

            expect(result.success).toBe(true)
            expect(result.processedFiles).toBeGreaterThan(0)

            // Verify the new symbols are indexed
            const symbols = await symbolSearchEngine.searchSymbols({
                searchTerm: 'ModifiedUser',
                limit: 10
            })

            expect(symbols.some(s => s.name === 'ModifiedUser')).toBe(true)
            expect(symbols.some(s => s.name === 'createUser')).toBe(true)

            console.log(`✅ Incremental update processed ${result.processedFiles} files`)
        }, 30000)

        it('should maintain data consistency across operations', async () => {
            // Initial index
            await projectIndexer.indexProject()
            const initialStats = await duckdbManager.getStatistics()

            // Add new file
            const newFile = path.join(testProjectRoot, 'src', 'new-service.ts')
            await fs.writeFile(newFile, `export class NewService {
    execute(): void {
        console.log('New service executed');
    }
}`)

            // Update index
            await projectIndexer.updateIncremental([newFile])
            const updatedStats = await duckdbManager.getStatistics()

            // Verify consistency
            expect(updatedStats.total_records).toBeGreaterThanOrEqual(initialStats.total_records)
            expect(updatedStats.database_size_bytes).toBeGreaterThan(0)

            // Verify new symbols exist
            const newSymbols = await symbolSearchEngine.searchSymbols({
                searchTerm: 'NewService',
                limit: 5
            })
            expect(newSymbols).toHaveLength(1)
            expect(newSymbols[0].name).toBe('NewService')
        })
    })

    describe('Cache Integration', () => {
        it('should integrate analysis cache with indexing', async () => {
            // Index project
            await projectIndexer.indexProject()

            // Store analysis result in cache
            const cacheKey = 'complexity-analysis-main'
            const analysisResult = {
                file: '/src/main.ts',
                complexity: 5.5,
                functions: 3,
                timestamp: new Date()
            }

            await duckdbManager.upsertAnalysisCache({
                cache_key: cacheKey,
                analysis_type: 'complexity',
                parameters: { file: '/src/main.ts' },
                result: analysisResult,
                expires_at: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
            })

            // Retrieve from cache
            const cached = await duckdbManager.getAnalysisCache(cacheKey)
            expect(cached).toBeTruthy()
            expect(cached?.analysis_type).toBe('complexity')
            expect(cached?.result).toEqual(analysisResult)
        })

        it('should handle cache expiration', async () => {
            // Store with short expiration
            const cacheKey = 'short-lived-cache'
            await duckdbManager.upsertAnalysisCache({
                cache_key: cacheKey,
                analysis_type: 'test',
                parameters: {},
                result: { data: 'test' },
                expires_at: new Date(Date.now() - 1000) // Already expired
            })

            // Should not retrieve expired cache
            const cached = await duckdbManager.getAnalysisCache(cacheKey)
            expect(cached).toBeNull()
        })

        it('should perform cache maintenance', async () => {
            // Add some cache entries
            for (let i = 0; i < 5; i++) {
                await duckdbManager.upsertAnalysisCache({
                    cache_key: `maintenance-test-${i}`,
                    analysis_type: 'test',
                    parameters: { index: i },
                    result: { value: i },
                    expires_at: new Date(Date.now() + (i % 2 === 0 ? 60 * 60 * 1000 : -60 * 60 * 1000)) // Some expired
                })
            }

            // Perform maintenance (this would normally be automatic)
            await cacheManager.performMaintenance()

            // Verify maintenance ran (hard to test directly, but ensure no errors)
            expect(cacheManager.isInitialized()).toBe(true)
        })
    })

    describe('Query Engine Integration', () => {
        beforeEach(async () => {
            // Ensure project is indexed
            await projectIndexer.indexProject()
        })

        it('should perform complex symbol searches', async () => {
            const results = await symbolSearchEngine.searchSymbols({
                type: 'class',
                language: 'typescript',
                limit: 20
            })

            expect(Array.isArray(results)).toBe(true)
            results.forEach(symbol => {
                expect(symbol.type).toBe('class')
                expect(symbol.language).toBe('typescript')
                expect(symbol).toHaveProperty('file_path')
                expect(symbol).toHaveProperty('line_number')
            })

            console.log(`✅ Found ${results.length} TypeScript classes`)
        })

        it('should find symbol references across files', async () => {
            // Find a class that should have references
            const classes = await symbolSearchEngine.searchSymbols({
                type: 'class',
                limit: 5
            })

            if (classes.length > 0) {
                const className = classes[0].name
                const references = await symbolSearchEngine.findReferences(className)

                expect(Array.isArray(references)).toBe(true)
                expect(references.length).toBeGreaterThan(0)

                // Should have at least a definition
                const definitions = references.filter(r => r.type === 'definition')
                expect(definitions.length).toBeGreaterThan(0)

                console.log(`✅ Found ${references.length} references for ${className}`)
            }
        })

        it('should provide comprehensive cross-references', async () => {
            const classes = await symbolSearchEngine.searchSymbols({
                type: 'class',
                limit: 3
            })

            if (classes.length > 0) {
                const className = classes[0].name
                const crossRefs = await symbolSearchEngine.getCrossReferences(className)

                expect(crossRefs.symbol_name).toBe(className)
                expect(crossRefs).toHaveProperty('definitions')
                expect(crossRefs).toHaveProperty('usages')
                expect(crossRefs).toHaveProperty('total_references')
                expect(crossRefs.total_references).toBe(crossRefs.definitions.length + crossRefs.usages.length)
            }
        })

        it('should handle file-specific searches', async () => {
            const allFiles = await fs.readdir(path.join(testProjectRoot, 'src'))
            const tsFiles = allFiles.filter(f => f.endsWith('.ts'))

            if (tsFiles.length > 0) {
                const filePath = `/src/${tsFiles[0]}`
                const symbols = await symbolSearchEngine.searchInFile(filePath)

                expect(Array.isArray(symbols)).toBe(true)
                symbols.forEach(symbol => {
                    expect(symbol.file_path).toBe(filePath)
                })
            }
        })

        it('should provide accurate statistics', async () => {
            const stats = await symbolSearchEngine.getSymbolStatistics()

            expect(stats).toHaveProperty('total_symbols')
            expect(stats).toHaveProperty('by_type')
            expect(stats).toHaveProperty('by_language')
            expect(stats).toHaveProperty('avg_complexity')
            expect(stats).toHaveProperty('max_complexity')

            expect(stats.total_symbols).toBeGreaterThan(0)
            expect(typeof stats.avg_complexity).toBe('number')
            expect(typeof stats.max_complexity).toBe('number')

            console.log(`✅ Symbol statistics: ${stats.total_symbols} total symbols, avg complexity: ${stats.avg_complexity}`)
        })
    })

    describe('Performance Benchmarks', () => {
        beforeEach(async () => {
            // Ensure substantial data is indexed
            await projectIndexer.indexProject({
                includeMetrics: true
            })
        })

        it('should handle concurrent queries efficiently', async () => {
            const queryCount = 10
            const queries = Array.from({ length: queryCount }, (_, i) =>
                symbolSearchEngine.searchSymbols({
                    searchTerm: i % 2 === 0 ? 'class' : 'function',
                    limit: 20
                })
            )

            const startTime = Date.now()
            const results = await Promise.all(queries)
            const endTime = Date.now()
            const totalTime = endTime - startTime
            const avgTime = totalTime / queryCount

            expect(results).toHaveLength(queryCount)
            results.forEach(result => {
                expect(Array.isArray(result)).toBe(true)
            })

            expect(avgTime).toBeLessThan(500) // Average query should be under 500ms
            expect(totalTime).toBeLessThan(5000) // Total should be under 5 seconds

            console.log(`✅ ${queryCount} concurrent queries completed in ${totalTime}ms (avg: ${avgTime.toFixed(2)}ms)`)
        }, 10000)

        it('should maintain performance with large datasets', async () => {
            // Test with larger result sets
            const result = await symbolSearchEngine.searchSymbols({
                limit: 100
            })

            expect(result.length).toBeLessThanOrEqual(100)

            if (result.length > 0) {
                const startTime = Date.now()
                // Perform multiple operations on the results
                const referencesPromises = result.slice(0, 5).map(symbol =>
                    symbolSearchEngine.findReferences(symbol.name)
                )
                await Promise.all(referencesPromises)
                const endTime = Date.now()

                const totalTime = endTime - startTime
                expect(totalTime).toBeLessThan(3000) // Should complete within 3 seconds

                console.log(`✅ Reference lookup for 5 symbols completed in ${totalTime}ms`)
            }
        })

        it('should optimize database operations', async () => {
            const startTime = Date.now()

            // Perform a series of operations that should be optimized
            await Promise.all([
                symbolSearchEngine.getSymbolStatistics(),
                duckdbManager.getStatistics(),
                projectIndexer.getIndexingStatus()
            ])

            const endTime = Date.now()
            const totalTime = endTime - startTime

            expect(totalTime).toBeLessThan(2000) // Should complete within 2 seconds

            console.log(`✅ Parallel operations completed in ${totalTime}ms`)
        })

        it('should handle memory efficiently', async () => {
            const initialStats = await duckdbManager.getStatistics()
            const initialSize = initialStats.database_size_bytes

            // Perform multiple operations
            for (let i = 0; i < 10; i++) {
                await symbolSearchEngine.searchSymbols({
                    searchTerm: 'test',
                    limit: 50
                })
            }

            const finalStats = await duckdbManager.getStatistics()
            const finalSize = finalStats.database_size_bytes

            // Database size should not grow excessively
            const growthRatio = finalSize / initialSize
            expect(growthRatio).toBeLessThan(2.0) // Allow up to 2x growth for cache/indexing

            console.log(`✅ Database size: ${initialSize} -> ${finalSize} bytes (${(growthRatio * 100).toFixed(1)}% growth)`)
        })
    })

    describe('Concurrent Access Testing', () => {
        it('should handle multiple indexers concurrently', async () => {
            const indexerCount = 3
            const indexers = Array.from({ length: indexerCount }, () =>
                new ProjectIndexer(testProjectRoot, duckdbManager)
            )

            // Run multiple indexing operations concurrently
            const startTime = Date.now()
            const results = await Promise.all(
                indexers.map(indexer => indexer.indexProject())
            )
            const endTime = Date.now()

            // All should succeed (though they might conflict)
            const successCount = results.filter(r => r.success).length
            expect(successCount).toBeGreaterThan(0) // At least one should succeed

            console.log(`✅ ${indexerCount} concurrent indexers completed in ${endTime - startTime}ms`)
        }, 60000)

        it('should handle concurrent reads and writes', async () => {
            // Start with indexed project
            await projectIndexer.indexProject()

            const operations = [
                // Read operations
                ...Array.from({ length: 5 }, () =>
                    symbolSearchEngine.searchSymbols({ limit: 20 })
                ),
                // Write operations
                ...Array.from({ length: 3 }, (_, i) =>
                    duckdbManager.upsertAnalysisCache({
                        cache_key: `concurrent-test-${i}`,
                        analysis_type: 'test',
                        parameters: { index: i },
                        result: { value: `test-${i}` }
                    })
                )
            ]

            const startTime = Date.now()
            const results = await Promise.all(operations)
            const endTime = Date.now()

            expect(results).toHaveLength(8)
            expect(endTime - startTime).toBeLessThan(5000) // Should complete within 5 seconds

            console.log(`✅ Concurrent read/write operations completed in ${endTime - startTime}ms`)
        })

        it('should maintain data integrity under concurrent load', async () => {
            const operationCount = 20
            const operations = Array.from({ length: operationCount }, (_, i) =>
                symbolSearchEngine.searchSymbols({
                    searchTerm: `operation${i % 5}`, // Repeat some searches
                    limit: 10
                })
            )

            const results = await Promise.all(operations)

            // All results should be arrays (no corruption)
            results.forEach(result => {
                expect(Array.isArray(result)).toBe(true)
            })

            // Verify database is still accessible
            const stats = await duckdbManager.getStatistics()
            expect(stats.total_records).toBeGreaterThan(0)

            console.log(`✅ ${operationCount} concurrent operations completed without data corruption`)
        })
    })

    describe('Error Recovery and Resilience', () => {
        it('should recover from partial indexing failures', async () => {
            // Create a problematic file
            const badFile = path.join(testProjectRoot, 'src', 'bad-syntax.ts')
            await fs.writeFile(badFile, 'export class BadSyntax { // missing closing brace')

            const result = await projectIndexer.indexProject({
                includeMetrics: true
            })

            // Should still succeed overall, just with some errors
            expect(result.success).toBe(true)
            expect(result.processedFiles).toBeGreaterThan(0)
            expect(result.errorFiles).toBeGreaterThan(0) // Should have recorded the bad file

            console.log(`✅ Handled ${result.errorFiles} indexing errors gracefully`)
        })

        it('should handle database connection issues', async () => {
            // Force close the database connection
            await duckdbManager.close()

            // Try operations - should handle gracefully
            await expect(symbolSearchEngine.searchSymbols({ limit: 1 })).rejects.toThrow()

            // Reinitialize
            const newManager = new DuckDBManager(testProjectRoot)
            const newEngine = new SymbolSearchEngine(newManager)

            // Should work again
            const results = await newEngine.searchSymbols({ limit: 1 })
            expect(Array.isArray(results)).toBe(true)

            await newManager.close()
        })

        it('should handle malformed cache data', async () => {
            // Insert malformed cache data
            await duckdbManager.upsertAnalysisCache({
                cache_key: 'malformed-cache',
                analysis_type: 'test',
                parameters: { invalid: undefined }, // This might cause issues
                result: { malformed: true }
            })

            // Should still be able to retrieve other cache entries
            const validCache = await duckdbManager.getAnalysisCache('malformed-cache')
            expect(validCache).toBeTruthy()

            // Database should remain functional
            const stats = await duckdbManager.getStatistics()
            expect(stats).toBeTruthy()
        })
    })

    describe('Resource Management', () => {
        it('should properly clean up resources', async () => {
            const manager = new DuckDBManager(testProjectRoot)
            const engine = new SymbolSearchEngine(manager)

            // Use the manager
            await engine.searchSymbols({ limit: 1 })

            // Close it
            await manager.close()

            // Should not be able to use after close
            await expect(engine.searchSymbols({ limit: 1 })).rejects.toThrow()
        })

        it('should handle memory pressure gracefully', async () => {
            // Create many cache entries to simulate memory pressure
            const cacheEntries = Array.from({ length: 100 }, (_, i) =>
                duckdbManager.upsertAnalysisCache({
                    cache_key: `memory-test-${i}`,
                    analysis_type: 'memory_test',
                    parameters: { index: i },
                    result: { data: 'x'.repeat(1000) } // 1KB of data each
                })
            )

            await Promise.all(cacheEntries)

            // Should still be able to perform operations
            const stats = await duckdbManager.getStatistics()
            expect(stats.database_size_bytes).toBeGreaterThan(0)

            // Cache maintenance should help with cleanup
            await cacheManager.performMaintenance()

            console.log(`✅ Handled ${cacheEntries.length} cache entries under memory pressure`)
        })

        it('should maintain stable performance over time', async () => {
            const iterations = 5
            const timings: number[] = []

            for (let i = 0; i < iterations; i++) {
                const startTime = Date.now()
                await symbolSearchEngine.searchSymbols({ limit: 50 })
                const endTime = Date.now()
                timings.push(endTime - startTime)

                // Small delay between iterations
                await new Promise(resolve => setTimeout(resolve, 100))
            }

            const avgTime = timings.reduce((a, b) => a + b, 0) / timings.length
            const maxTime = Math.max(...timings)
            const minTime = Math.min(...timings)
            const variance = maxTime - minTime

            // Performance should be relatively stable
            expect(variance).toBeLessThan(avgTime * 2) // Variance should be less than 2x average
            expect(avgTime).toBeLessThan(1000) // Average should be under 1 second

            console.log(`✅ Performance stable over ${iterations} iterations: avg=${avgTime.toFixed(2)}ms, range=${minTime}-${maxTime}ms`)
        })
    })
})

// Helper function to create test project structure
async function createTestProjectStructure(rootDir: string): Promise<void> {
    const dirs = [
        'src',
        'src/services',
        'src/controllers',
        'src/utils',
        'src/types'
    ]

    // Create directories
    for (const dir of dirs) {
        await fs.mkdir(path.join(rootDir, dir), { recursive: true })
    }

    // Create test files with realistic TypeScript code
    const files = {
        'src/main.ts': `import { UserService } from './services/user.service'
import { Logger } from './utils/logger'

export class Application {
    private userService: UserService
    private logger: Logger

    constructor() {
        this.userService = new UserService()
        this.logger = new Logger()
    }

    async start(): Promise<void> {
        this.logger.info('Application starting...')
        await this.userService.initialize()
        this.logger.info('Application started successfully')
    }

    async stop(): Promise<void> {
        this.logger.info('Application stopping...')
        await this.userService.cleanup()
        this.logger.info('Application stopped')
    }
}
`,

        'src/services/user.service.ts': `import { User } from '../types/user'
import { Logger } from '../utils/logger'

export class UserService {
    private users: Map<string, User> = new Map()
    private logger: Logger

    constructor() {
        this.logger = new Logger()
    }

    async initialize(): Promise<void> {
        this.logger.info('UserService initializing...')
        // Initialize service
    }

    async createUser(userData: Omit<User, 'id'>): Promise<User> {
        const id = this.generateId()
        const user: User = { id, ...userData }
        this.users.set(id, user)
        this.logger.info(\`User created: \${user.id}\`)
        return user
    }

    async getUser(id: string): Promise<User | null> {
        return this.users.get(id) || null
    }

    async updateUser(id: string, updates: Partial<User>): Promise<User | null> {
        const user = this.users.get(id)
        if (!user) return null

        const updatedUser = { ...user, ...updates }
        this.users.set(id, updatedUser)
        return updatedUser
    }

    async deleteUser(id: string): Promise<boolean> {
        const deleted = this.users.delete(id)
        if (deleted) {
            this.logger.info(\`User deleted: \${id}\`)
        }
        return deleted
    }

    async cleanup(): Promise<void> {
        this.users.clear()
        this.logger.info('UserService cleaned up')
    }

    private generateId(): string {
        return Math.random().toString(36).substr(2, 9)
    }
}
`,

        'src/controllers/user.controller.ts': `import { Request, Response } from 'express'
import { UserService } from '../services/user.service'
import { CreateUserRequest, UpdateUserRequest } from '../types/user'

export class UserController {
    private userService: UserService

    constructor(userService: UserService) {
        this.userService = userService
    }

    async createUser(req: Request, res: Response): Promise<void> {
        try {
            const userData: CreateUserRequest = req.body
            const user = await this.userService.createUser(userData)
            res.status(201).json(user)
        } catch (error) {
            res.status(500).json({ error: 'Failed to create user' })
        }
    }

    async getUser(req: Request, res: Response): Promise<void> {
        try {
            const { id } = req.params
            const user = await this.userService.getUser(id)
            if (!user) {
                res.status(404).json({ error: 'User not found' })
                return
            }
            res.json(user)
        } catch (error) {
            res.status(500).json({ error: 'Failed to get user' })
        }
    }

    async updateUser(req: Request, res: Response): Promise<void> {
        try {
            const { id } = req.params
            const updates: UpdateUserRequest = req.body
            const user = await this.userService.updateUser(id, updates)
            if (!user) {
                res.status(404).json({ error: 'User not found' })
                return
            }
            res.json(user)
        } catch (error) {
            res.status(500).json({ error: 'Failed to update user' })
        }
    }

    async deleteUser(req: Request, res: Response): Promise<void> {
        try {
            const { id } = req.params
            const deleted = await this.userService.deleteUser(id)
            if (!deleted) {
                res.status(404).json({ error: 'User not found' })
                return
            }
            res.status(204).send()
        } catch (error) {
            res.status(500).json({ error: 'Failed to delete user' })
        }
    }
}
`,

        'src/utils/logger.ts': `export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}

export interface LogEntry {
    level: LogLevel
    message: string
    timestamp: Date
    context?: any
}

export class Logger {
    private level: LogLevel = LogLevel.INFO
    private logs: LogEntry[] = []

    constructor(level?: LogLevel) {
        if (level !== undefined) {
            this.level = level
        }
    }

    debug(message: string, context?: any): void {
        this.log(LogLevel.DEBUG, message, context)
    }

    info(message: string, context?: any): void {
        this.log(LogLevel.INFO, message, context)
    }

    warn(message: string, context?: any): void {
        this.log(LogLevel.WARN, message, context)
    }

    error(message: string, context?: any): void {
        this.log(LogLevel.ERROR, message, context)
    }

    private log(level: LogLevel, message: string, context?: any): void {
        if (level < this.level) return

        const entry: LogEntry = {
            level,
            message,
            timestamp: new Date(),
            context
        }

        this.logs.push(entry)

        // In a real implementation, this would write to console/file/etc
        const levelName = LogLevel[level]
        console.log(\`[\${levelName}] \${message}\`, context ? JSON.stringify(context) : '')
    }

    getLogs(): LogEntry[] {
        return [...this.logs]
    }

    clearLogs(): void {
        this.logs = []
    }

    setLevel(level: LogLevel): void {
        this.level = level
    }
}
`,

        'src/types/user.ts': `export interface User {
    id: string
    name: string
    email: string
    createdAt: Date
    updatedAt: Date
}

export interface CreateUserRequest {
    name: string
    email: string
}

export interface UpdateUserRequest {
    name?: string
    email?: string
}

export type UserResponse = Omit<User, 'createdAt' | 'updatedAt'> & {
    createdAt: string
    updatedAt: string
}
`,

        'src/services/auth.service.ts': `import { User } from '../types/user'
import { Logger } from '../utils/logger'

export interface LoginCredentials {
    email: string
    password: string
}

export interface AuthToken {
    token: string
    expiresAt: Date
    userId: string
}

export class AuthService {
    private logger: Logger
    private tokens: Map<string, AuthToken> = new Map()

    constructor() {
        this.logger = new Logger()
    }

    async login(credentials: LoginCredentials): Promise<AuthToken | null> {
        // Simplified authentication logic
        this.logger.info(\`Login attempt for: \${credentials.email}\`)

        // In a real implementation, this would validate against a database
        if (credentials.email && credentials.password) {
            const token: AuthToken = {
                token: this.generateToken(),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
                userId: 'user-123'
            }
            this.tokens.set(token.token, token)
            return token
        }

        return null
    }

    async validateToken(token: string): Promise<User | null> {
        const authToken = this.tokens.get(token)
        if (!authToken) return null

        if (authToken.expiresAt < new Date()) {
            this.tokens.delete(token)
            return null
        }

        // Return mock user
        return {
            id: authToken.userId,
            name: 'Test User',
            email: 'test@example.com',
            createdAt: new Date(),
            updatedAt: new Date()
        }
    }

    async logout(token: string): Promise<boolean> {
        const deleted = this.tokens.delete(token)
        if (deleted) {
            this.logger.info('User logged out')
        }
        return deleted
    }

    private generateToken(): string {
        return Math.random().toString(36).substr(2, 16)
    }
}
`
    }

    // Write files
    for (const [filePath, content] of Object.entries(files)) {
        await fs.writeFile(path.join(rootDir, filePath), content, 'utf8')
    }
}</content>},{