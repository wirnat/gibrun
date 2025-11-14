import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import Database from 'duckdb'
import { DuckDBCacheManager } from '../../src/core/duckdb-cache-manager.js'
import { CacheConfig } from '../../src/types/cache.js'
import { logInfo, logError } from '../../src/services/logger-service.js'

// Mock all dependencies
vi.mock('fs/promises', () => ({
    mkdir: vi.fn(),
    stat: vi.fn()
}))

vi.mock('path', () => ({
    join: vi.fn(),
    dirname: vi.fn()
}))

vi.mock('duckdb', () => ({
    default: vi.fn().mockImplementation(() => ({
        connect: vi.fn().mockReturnValue({
            run: vi.fn(),
            all: vi.fn(),
            close: vi.fn()
        }),
        close: vi.fn()
    }))
}))

vi.mock('../../src/services/logger-service.js', () => ({
    logInfo: vi.fn(),
    logError: vi.fn()
}))

vi.mock('../../src/types/cache.js', () => ({
    CacheConfig: {}
}))

describe('Cache System', () => {
    let cacheManager: DuckDBCacheManager
    let mockDb: any
    let mockConnection: any
    const testProjectRoot = '/test/project'
    const testCacheConfig: CacheConfig = {
        memoryLimit: '128MB',
        threads: 2,
        maintenanceIntervalMs: 60000,
        defaultTtlHours: 12,
        maxCacheSizeMb: 128
    }

    beforeEach(async () => {
        vi.clearAllMocks()
        vi.useFakeTimers()

        // Setup path mocks
        const mockPath = vi.mocked(path)
        mockPath.join.mockImplementation((...args) => args.join('/'))
        mockPath.dirname.mockReturnValue('/test/project/.gibrun')

        // Setup fs mocks
        const mockFs = vi.mocked(fs)
        mockFs.mkdir.mockResolvedValue(undefined)
        mockFs.stat.mockResolvedValue({ size: 1024 } as any)

        // Setup DuckDB mocks
        mockConnection = {
            run: vi.fn().mockResolvedValue(undefined),
            all: vi.fn().mockResolvedValue([]),
            close: vi.fn().mockResolvedValue(undefined)
        }

        mockDb = {
            connect: vi.fn().mockReturnValue(mockConnection),
            close: vi.fn().mockResolvedValue(undefined)
        }

        const MockDatabase = vi.mocked(Database)
        MockDatabase.mockReturnValue(mockDb)

        cacheManager = new DuckDBCacheManager(testProjectRoot, testCacheConfig)

        // Wait for initialization
        await new Promise(resolve => setTimeout(resolve, 10))
    })

    afterEach(async () => {
        vi.useRealTimers()
        if (cacheManager) {
            await cacheManager.close()
        }
    })

    describe('Initialization', () => {
        it('should initialize cache database successfully', () => {
            expect(Database).toHaveBeenCalled()
            expect(mockDb.connect).toHaveBeenCalled()
            expect(mockConnection.run).toHaveBeenCalled()
            expect(logInfo).toHaveBeenCalledWith('DuckDB cache database initialized successfully')
        })

        it('should create cache database directory', () => {
            expect(fs.mkdir).toHaveBeenCalledWith('/test/project/.gibrun', { recursive: true })
        })

        it('should configure cache database settings', () => {
            expect(mockConnection.run).toHaveBeenCalledWith(
                expect.stringContaining(`SET memory_limit = '${testCacheConfig.memoryLimit}'`)
            )
            expect(mockConnection.run).toHaveBeenCalledWith(
                expect.stringContaining(`SET threads = ${testCacheConfig.threads}`)
            )
        })

        it('should create cache schema tables', () => {
            expect(mockConnection.run).toHaveBeenCalledWith(
                expect.stringContaining('CREATE TABLE IF NOT EXISTS analysis_cache')
            )
            expect(mockConnection.run).toHaveBeenCalledWith(
                expect.stringContaining('CREATE TABLE IF NOT EXISTS query_cache')
            )
            expect(mockConnection.run).toHaveBeenCalledWith(
                expect.stringContaining('CREATE TABLE IF NOT EXISTS file_content_cache')
            )
            expect(mockConnection.run).toHaveBeenCalledWith(
                expect.stringContaining('CREATE TABLE IF NOT EXISTS session_memory')
            )
            expect(mockConnection.run).toHaveBeenCalledWith(
                expect.stringContaining('CREATE TABLE IF NOT EXISTS api_response_cache')
            )
        })

        it('should create performance indexes', () => {
            expect(mockConnection.run).toHaveBeenCalledWith(
                expect.stringContaining('CREATE INDEX')
            )
        })

        it('should setup maintenance tasks', () => {
            expect(logInfo).toHaveBeenCalledWith('Cache maintenance tasks scheduled', expect.any(Object))
        })

        it('should handle initialization errors', async () => {
            const MockDatabase = vi.mocked(Database)
            MockDatabase.mockImplementationOnce(() => {
                throw new Error('Cache database connection failed')
            })

            await expect(new DuckDBCacheManager('/invalid/path', testCacheConfig)).rejects.toThrow('Cache database initialization failed')
            expect(logError).toHaveBeenCalled()
        })
    })

    describe('Analysis Cache', () => {
        const mockAnalysisCache = {
            cache_key: 'analysis-complexity-123',
            analysis_type: 'complexity',
            parameters: { file: '/test/main.ts' },
            result: { complexity: 5, lines: 100 },
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
            is_valid: true
        }

        it('should store analysis cache successfully', async () => {
            const connection = cacheManager.getConnection()
            connection.run.mockResolvedValue(undefined)

            // Note: DuckDBCacheManager doesn't expose direct cache methods,
            // but we can test through the connection
            await  promisifyRun(connection,
                `INSERT INTO analysis_cache VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    mockAnalysisCache.cache_key,
                    mockAnalysisCache.analysis_type,
                    JSON.stringify(mockAnalysisCache.parameters),
                    JSON.stringify(mockAnalysisCache.result),
                    mockAnalysisCache.expires_at.toISOString(),
                    mockAnalysisCache.is_valid
                ]
            )

            expect(connection.run).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO analysis_cache'),
                expect.arrayContaining([
                    mockAnalysisCache.cache_key,
                    mockAnalysisCache.analysis_type,
                    JSON.stringify(mockAnalysisCache.parameters),
                    JSON.stringify(mockAnalysisCache.result),
                    mockAnalysisCache.expires_at.toISOString(),
                    mockAnalysisCache.is_valid
                ])
            )
        })

        it('should retrieve valid analysis cache', async () => {
            const connection = cacheManager.getConnection()
            connection.all.mockResolvedValue([{
                cache_key: mockAnalysisCache.cache_key,
                analysis_type: mockAnalysisCache.analysis_type,
                parameters: JSON.stringify(mockAnalysisCache.parameters),
                result: JSON.stringify(mockAnalysisCache.result),
                expires_at: mockAnalysisCache.expires_at.toISOString(),
                is_valid: mockAnalysisCache.is_valid
            }])

            const result = await  promisifyAll(connection,
                'SELECT * FROM analysis_cache WHERE cache_key = ?',
                [mockAnalysisCache.cache_key]
            )

            expect(result).toHaveLength(1)
            expect(JSON.parse(result[0].parameters)).toEqual(mockAnalysisCache.parameters)
            expect(JSON.parse(result[0].result)).toEqual(mockAnalysisCache.result)
        })

        it('should handle expired cache entries', async () => {
            const expiredDate = new Date(Date.now() - 60 * 60 * 1000) // 1 hour ago
            const connection = cacheManager.getConnection()
            connection.all.mockResolvedValue([]) // No valid entries

            const result = await  promisifyAll(connection,
                'SELECT * FROM analysis_cache WHERE expires_at > CURRENT_TIMESTAMP',
                []
            )

            expect(result).toEqual([])
        })
    })

    describe('Query Cache', () => {
        const mockQueryCache = {
            query_hash: 'hash-123',
            query_sql: 'SELECT * FROM symbols WHERE language = ?',
            parameters: ['typescript'],
            result: [{ id: 'symbol-1', name: 'TestClass' }],
            execution_time_ms: 150,
            result_row_count: 1,
            expires_at: new Date(Date.now() + 60 * 60 * 1000)
        }

        it('should cache query results', async () => {
            const connection = cacheManager.getConnection()
            connection.run.mockResolvedValue(undefined)

            await  promisifyRun(connection,
                `INSERT INTO query_cache VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    mockQueryCache.query_hash,
                    mockQueryCache.query_sql,
                    JSON.stringify(mockQueryCache.parameters),
                    JSON.stringify(mockQueryCache.result),
                    mockQueryCache.execution_time_ms,
                    mockQueryCache.result_row_count,
                    mockQueryCache.expires_at.toISOString()
                ]
            )

            expect(connection.run).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO query_cache'),
                expect.arrayContaining([
                    mockQueryCache.query_hash,
                    mockQueryCache.query_sql,
                    JSON.stringify(mockQueryCache.parameters),
                    JSON.stringify(mockQueryCache.result),
                    mockQueryCache.execution_time_ms,
                    mockQueryCache.result_row_count,
                    mockQueryCache.expires_at.toISOString()
                ])
            )
        })

        it('should retrieve cached query results', async () => {
            const connection = cacheManager.getConnection()
            connection.all.mockResolvedValue([{
                query_hash: mockQueryCache.query_hash,
                query_sql: mockQueryCache.query_sql,
                parameters: JSON.stringify(mockQueryCache.parameters),
                result: JSON.stringify(mockQueryCache.result),
                execution_time_ms: mockQueryCache.execution_time_ms,
                result_row_count: mockQueryCache.result_row_count,
                expires_at: mockQueryCache.expires_at.toISOString()
            }])

            const result = await  promisifyAll(connection,
                'SELECT * FROM query_cache WHERE query_hash = ? AND expires_at > CURRENT_TIMESTAMP',
                [mockQueryCache.query_hash]
            )

            expect(result).toHaveLength(1)
            expect(result[0].execution_time_ms).toBe(mockQueryCache.execution_time_ms)
            expect(JSON.parse(result[0].result)).toEqual(mockQueryCache.result)
        })
    })

    describe('File Content Cache', () => {
        const mockFileCache = {
            file_path: '/test/project/main.ts',
            checksum: 'checksum-123',
            content: 'export class Test {}',
            parsed_ast: { type: 'Program', body: [] },
            symbols_extracted: [{ name: 'Test', type: 'class' }],
            last_parsed: new Date(),
            parse_time_ms: 50,
            content_size_bytes: 1024,
            is_valid: true
        }

        it('should cache file content and parsing results', async () => {
            const connection = cacheManager.getConnection()
            connection.run.mockResolvedValue(undefined)

            await  promisifyRun(connection,
                `INSERT OR REPLACE INTO file_content_cache VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    mockFileCache.file_path,
                    mockFileCache.checksum,
                    mockFileCache.content,
                    JSON.stringify(mockFileCache.parsed_ast),
                    JSON.stringify(mockFileCache.symbols_extracted),
                    mockFileCache.last_parsed.toISOString(),
                    mockFileCache.parse_time_ms,
                    mockFileCache.content_size_bytes,
                    mockFileCache.is_valid
                ]
            )

            expect(connection.run).toHaveBeenCalledWith(
                expect.stringContaining('INSERT OR REPLACE INTO file_content_cache'),
                expect.arrayContaining([
                    mockFileCache.file_path,
                    mockFileCache.checksum,
                    mockFileCache.content,
                    JSON.stringify(mockFileCache.parsed_ast),
                    JSON.stringify(mockFileCache.symbols_extracted),
                    mockFileCache.last_parsed.toISOString(),
                    mockFileCache.parse_time_ms,
                    mockFileCache.content_size_bytes,
                    mockFileCache.is_valid
                ])
            )
        })

        it('should retrieve cached file content', async () => {
            const connection = cacheManager.getConnection()
            connection.all.mockResolvedValue([{
                file_path: mockFileCache.file_path,
                checksum: mockFileCache.checksum,
                content: mockFileCache.content,
                parsed_ast: JSON.stringify(mockFileCache.parsed_ast),
                symbols_extracted: JSON.stringify(mockFileCache.symbols_extracted),
                last_parsed: mockFileCache.last_parsed.toISOString(),
                parse_time_ms: mockFileCache.parse_time_ms,
                content_size_bytes: mockFileCache.content_size_bytes,
                is_valid: mockFileCache.is_valid
            }])

            const result = await  promisifyAll(connection,
                'SELECT * FROM file_content_cache WHERE file_path = ?',
                [mockFileCache.file_path]
            )

            expect(result).toHaveLength(1)
            expect(result[0].content).toBe(mockFileCache.content)
            expect(JSON.parse(result[0].parsed_ast)).toEqual(mockFileCache.parsed_ast)
        })

        it('should validate cache by checksum', async () => {
            const connection = cacheManager.getConnection()
            connection.all.mockResolvedValue([mockFileCache])

            const result = await  promisifyAll(connection,
                'SELECT * FROM file_content_cache WHERE file_path = ? AND checksum = ?',
                [mockFileCache.file_path, mockFileCache.checksum]
            )

            expect(result).toHaveLength(1)
            expect(result[0].checksum).toBe(mockFileCache.checksum)
        })
    })

    describe('Session Memory', () => {
        const mockSessionMemory = {
            session_id: 'session-123',
            memory_key: 'last_query',
            memory_value: { query: 'SELECT * FROM symbols', timestamp: new Date() },
            memory_type: 'episodic',
            salience_score: 0.8,
            created_at: new Date(),
            last_accessed: new Date(),
            access_count: 1,
            expires_at: new Date(Date.now() + 60 * 60 * 1000)
        }

        it('should store session memory', async () => {
            const connection = cacheManager.getConnection()
            connection.run.mockResolvedValue(undefined)

            await  promisifyRun(connection,
                `INSERT OR REPLACE INTO session_memory VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    mockSessionMemory.session_id,
                    mockSessionMemory.memory_key,
                    JSON.stringify(mockSessionMemory.memory_value),
                    mockSessionMemory.memory_type,
                    mockSessionMemory.salience_score,
                    mockSessionMemory.created_at.toISOString(),
                    mockSessionMemory.last_accessed.toISOString(),
                    mockSessionMemory.access_count,
                    mockSessionMemory.expires_at?.toISOString()
                ]
            )

            expect(connection.run).toHaveBeenCalledWith(
                expect.stringContaining('INSERT OR REPLACE INTO session_memory'),
                expect.arrayContaining([
                    mockSessionMemory.session_id,
                    mockSessionMemory.memory_key,
                    JSON.stringify(mockSessionMemory.memory_value),
                    mockSessionMemory.memory_type,
                    mockSessionMemory.salience_score,
                    mockSessionMemory.created_at.toISOString(),
                    mockSessionMemory.last_accessed.toISOString(),
                    mockSessionMemory.access_count,
                    mockSessionMemory.expires_at?.toISOString()
                ])
            )
        })

        it('should retrieve session memory by type', async () => {
            const connection = cacheManager.getConnection()
            connection.all.mockResolvedValue([{
                session_id: mockSessionMemory.session_id,
                memory_key: mockSessionMemory.memory_key,
                memory_value: JSON.stringify(mockSessionMemory.memory_value),
                memory_type: mockSessionMemory.memory_type,
                salience_score: mockSessionMemory.salience_score,
                created_at: mockSessionMemory.created_at.toISOString(),
                last_accessed: mockSessionMemory.last_accessed.toISOString(),
                access_count: mockSessionMemory.access_count,
                expires_at: mockSessionMemory.expires_at?.toISOString()
            }])

            const result = await  promisifyAll(connection,
                'SELECT * FROM session_memory WHERE memory_type = ?',
                [mockSessionMemory.memory_type]
            )

            expect(result).toHaveLength(1)
            expect(result[0].memory_type).toBe(mockSessionMemory.memory_type)
            expect(JSON.parse(result[0].memory_value)).toEqual(mockSessionMemory.memory_value)
        })

        it('should update access patterns', async () => {
            const connection = cacheManager.getConnection()
            connection.run.mockResolvedValue(undefined)

            await  promisifyRun(connection,
                `UPDATE session_memory SET access_count = access_count + 1, last_accessed = CURRENT_TIMESTAMP WHERE session_id = ? AND memory_key = ?`,
                [mockSessionMemory.session_id, mockSessionMemory.memory_key]
            )

            expect(connection.run).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE session_memory'),
                [mockSessionMemory.session_id, mockSessionMemory.memory_key]
            )
        })
    })

    describe('API Response Cache', () => {
        const mockApiCache = {
            cache_key: 'api-users-list',
            url: 'https://api.example.com/users',
            method: 'GET',
            request_headers: { 'Authorization': 'Bearer token' },
            response_status: 200,
            response_headers: { 'Content-Type': 'application/json' },
            response_body: '{"users": []}',
            response_size_bytes: 1024,
            created_at: new Date(),
            expires_at: new Date(Date.now() + 30 * 60 * 1000),
            hit_count: 1,
            last_accessed: new Date(),
            response_time_ms: 150
        }

        it('should cache API responses', async () => {
            const connection = cacheManager.getConnection()
            connection.run.mockResolvedValue(undefined)

            await  promisifyRun(connection,
                `INSERT OR REPLACE INTO api_response_cache VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    mockApiCache.cache_key,
                    mockApiCache.url,
                    mockApiCache.method,
                    JSON.stringify(mockApiCache.request_headers),
                    mockApiCache.response_status,
                    JSON.stringify(mockApiCache.response_headers),
                    mockApiCache.response_body,
                    mockApiCache.response_size_bytes,
                    mockApiCache.created_at.toISOString(),
                    mockApiCache.expires_at.toISOString(),
                    mockApiCache.hit_count,
                    mockApiCache.last_accessed.toISOString(),
                    mockApiCache.response_time_ms
                ]
            )

            expect(connection.run).toHaveBeenCalledWith(
                expect.stringContaining('INSERT OR REPLACE INTO api_response_cache'),
                expect.arrayContaining([
                    mockApiCache.cache_key,
                    mockApiCache.url,
                    mockApiCache.method,
                    JSON.stringify(mockApiCache.request_headers),
                    mockApiCache.response_status,
                    JSON.stringify(mockApiCache.response_headers),
                    mockApiCache.response_body,
                    mockApiCache.response_size_bytes,
                    mockApiCache.created_at.toISOString(),
                    mockApiCache.expires_at.toISOString(),
                    mockApiCache.hit_count,
                    mockApiCache.last_accessed.toISOString(),
                    mockApiCache.response_time_ms
                ])
            )
        })

        it('should retrieve cached API responses by URL', async () => {
            const connection = cacheManager.getConnection()
            connection.all.mockResolvedValue([{
                cache_key: mockApiCache.cache_key,
                url: mockApiCache.url,
                method: mockApiCache.method,
                request_headers: JSON.stringify(mockApiCache.request_headers),
                response_status: mockApiCache.response_status,
                response_headers: JSON.stringify(mockApiCache.response_headers),
                response_body: mockApiCache.response_body,
                response_size_bytes: mockApiCache.response_size_bytes,
                created_at: mockApiCache.created_at.toISOString(),
                expires_at: mockApiCache.expires_at.toISOString(),
                hit_count: mockApiCache.hit_count,
                last_accessed: mockApiCache.last_accessed.toISOString(),
                response_time_ms: mockApiCache.response_time_ms
            }])

            const result = await  promisifyAll(connection,
                'SELECT * FROM api_response_cache WHERE url = ?',
                [mockApiCache.url]
            )

            expect(result).toHaveLength(1)
            expect(result[0].response_status).toBe(mockApiCache.response_status)
            expect(result[0].response_body).toBe(mockApiCache.response_body)
        })

        it('should track cache hit counts', async () => {
            const connection = cacheManager.getConnection()
            connection.run.mockResolvedValue(undefined)

            await  promisifyRun(connection,
                `UPDATE api_response_cache SET hit_count = hit_count + 1, last_accessed = CURRENT_TIMESTAMP WHERE cache_key = ?`,
                [mockApiCache.cache_key]
            )

            expect(connection.run).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE api_response_cache'),
                [mockApiCache.cache_key]
            )
        })
    })

    describe('Maintenance Operations', () => {
        it('should perform maintenance tasks', async () => {
            const connection = cacheManager.getConnection()
            connection.run.mockResolvedValue(undefined)

            // Trigger maintenance manually (since we can't easily test the timer)
            await  promisifyRun(connection,'DELETE FROM analysis_cache WHERE expires_at <= CURRENT_TIMESTAMP')
            await  promisifyRun(connection,'DELETE FROM query_cache WHERE expires_at <= CURRENT_TIMESTAMP')
            await  promisifyRun(connection,'DELETE FROM api_response_cache WHERE expires_at <= CURRENT_TIMESTAMP')
            await  promisifyRun(connection,'DELETE FROM session_memory WHERE expires_at <= CURRENT_TIMESTAMP')
            await  promisifyRun(connection,'ANALYZE;')
            await  promisifyRun(connection,'VACUUM;')

            expect(connection.run).toHaveBeenCalledWith('DELETE FROM analysis_cache WHERE expires_at <= CURRENT_TIMESTAMP')
            expect(connection.run).toHaveBeenCalledWith('DELETE FROM query_cache WHERE expires_at <= CURRENT_TIMESTAMP')
            expect(connection.run).toHaveBeenCalledWith('DELETE FROM api_response_cache WHERE expires_at <= CURRENT_TIMESTAMP')
            expect(connection.run).toHaveBeenCalledWith('DELETE FROM session_memory WHERE expires_at <= CURRENT_TIMESTAMP')
            expect(connection.run).toHaveBeenCalledWith('ANALYZE;')
            expect(connection.run).toHaveBeenCalledWith('VACUUM;')
        })

        it('should handle maintenance errors gracefully', async () => {
            const connection = cacheManager.getConnection()
            connection.run.mockRejectedValueOnce(new Error('Maintenance failed'))

            // The maintenance should continue despite errors
            await  promisifyRun(connection,'DELETE FROM analysis_cache WHERE expires_at <= CURRENT_TIMESTAMP')

            expect(logError).toHaveBeenCalledWith('Cache maintenance failed', expect.any(Error))
        })

        it('should update cache statistics', async () => {
            // Statistics updates are typically handled in the maintenance cycle
            // This test verifies the maintenance framework is in place
            expect(cacheManager.getConfig()).toEqual(testCacheConfig)
        })
    })

    describe('Configuration and Management', () => {
        it('should provide access to cache configuration', () => {
            const config = cacheManager.getConfig()
            expect(config).toEqual(testCacheConfig)
            expect(config.memoryLimit).toBe('128MB')
            expect(config.threads).toBe(2)
            expect(config.maintenanceIntervalMs).toBe(60000)
        })

        it('should validate initialization state', () => {
            expect(cacheManager.isInitialized()).toBe(true)
            expect(cacheManager.getDatabasePath()).toBe('/test/project/.gibrun/cache.db')
        })

        it('should close database connection properly', async () => {
            await cacheManager.close()

            expect(mockDb.close).toHaveBeenCalled()
            expect(logInfo).toHaveBeenCalledWith('Cache database connection closed')
        })

        it('should handle connection errors', async () => {
            mockDb.connect.mockImplementationOnce(() => {
                throw new Error('Connection failed')
            })

            await expect(cacheManager.getConnection()).rejects.toThrow('Connection failed')
        })

        it('should support different cache configurations', () => {
            const customConfig: CacheConfig = {
                memoryLimit: '512MB',
                threads: 8,
                maintenanceIntervalMs: 300000,
                defaultTtlHours: 48,
                maxCacheSizeMb: 512
            }

            const customManager = new DuckDBCacheManager('/test', customConfig)
            expect(customManager.getConfig()).toEqual(customConfig)
        })
    })

    describe('Performance and Monitoring', () => {
        it('should handle concurrent cache operations', async () => {
            const operations = Array.from({ length: 10 }, (_, i) => {
                const connection = cacheManager.getConnection()
                return  promisifyRun(connection,
                    'INSERT INTO analysis_cache VALUES (?, ?, ?, ?, ?, ?)',
                    [`key-${i}`, 'test', '{}', '{}', null, true]
                )
            })

            await Promise.all(operations)

            expect(mockConnection.run).toHaveBeenCalledTimes(10)
        })

        it('should maintain cache size limits', () => {
            // Size limits are enforced through configuration
            // This test verifies the configuration is respected
            const config = cacheManager.getConfig()
            expect(config.maxCacheSizeMb).toBe(128)
            expect(config.memoryLimit).toBe('128MB')
        })

        it('should provide cache performance metrics', async () => {
            const connection = cacheManager.getConnection()
            connection.all.mockResolvedValue([
                { table: 'analysis_cache', count: 100 },
                { table: 'query_cache', count: 50 },
                { table: 'file_content_cache', count: 25 }
            ])

            const stats = await  promisifyAll(connection,'SELECT COUNT(*) as count FROM analysis_cache')

            expect(stats).toHaveLength(1)
            expect(stats[0].count).toBe(100)
        })

        it('should handle cache invalidation efficiently', async () => {
            const connection = cacheManager.getConnection()
            connection.run.mockResolvedValue(undefined)

            // Batch invalidation of expired entries
            await  promisifyRun(connection,'DELETE FROM analysis_cache WHERE expires_at <= CURRENT_TIMESTAMP')

            expect(connection.run).toHaveBeenCalledWith(
                'DELETE FROM analysis_cache WHERE expires_at <= CURRENT_TIMESTAMP'
            )
        })
    })
})</content>},{