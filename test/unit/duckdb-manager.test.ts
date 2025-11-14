import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import Database from 'duckdb'
import { DuckDBManager, FileInfo, SymbolInfo, MetricData, DependencyInfo, GitHistoryInfo, TodoInfo, AnalysisCacheInfo } from '../../src/core/duckdb-manager.js'
import { logInfo, logError } from '../../src/services/logger-service.js'

// Mock all dependencies
vi.mock('fs/promises', () => ({
    mkdir: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    stat: vi.fn(),
    access: vi.fn(),
    unlink: vi.fn()
}))

vi.mock('path', () => ({
    join: vi.fn(),
    dirname: vi.fn(),
    basename: vi.fn(),
    extname: vi.fn(),
    relative: vi.fn()
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

describe('DuckDBManager', () => {
    let duckdbManager: DuckDBManager
    let mockDb: any
    let mockConnection: any
    const testProjectRoot = '/test/project'
    const testDbPath = path.join(testProjectRoot, '.gibrun', 'project_index.db')

    beforeEach(async () => {
        vi.clearAllMocks()

        // Setup path mocks
        const mockPath = vi.mocked(path)
        mockPath.join.mockImplementation((...args) => args.join('/'))
        mockPath.dirname.mockReturnValue('/test/project/.gibrun')
        mockPath.basename.mockReturnValue('test.db')
        mockPath.extname.mockReturnValue('.db')

        // Setup fs mocks
        const mockFs = vi.mocked(fs)
        mockFs.mkdir.mockResolvedValue(undefined)
        mockFs.stat.mockResolvedValue({ size: 1024 } as any)
        mockFs.access.mockResolvedValue(undefined)

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

        // Create manager instance
        duckdbManager = new DuckDBManager(testProjectRoot)

        // Wait for initialization
        await new Promise(resolve => setTimeout(resolve, 10))
    })

    afterEach(async () => {
        if (duckdbManager) {
            await duckdbManager.close()
        }
    })

    describe('Initialization', () => {
        it('should initialize database successfully', async () => {
            expect(Database).toHaveBeenCalledWith(testDbPath)
            expect(mockDb.connect).toHaveBeenCalled()
            expect(mockConnection.run).toHaveBeenCalled()
            expect(logInfo).toHaveBeenCalledWith('DuckDB database initialized successfully')
        })

        it('should create database directory if it does not exist', () => {
            expect(fs.mkdir).toHaveBeenCalledWith('/test/project/.gibrun', { recursive: true })
        })

        it('should configure database performance settings', () => {
            expect(mockConnection.run).toHaveBeenCalledWith(
                expect.stringContaining('SET memory_limit')
            )
        })

        it('should create database schema', () => {
            expect(mockConnection.run).toHaveBeenCalledWith(
                expect.stringContaining('CREATE TABLE IF NOT EXISTS files')
            )
        })

        it('should create performance indexes', () => {
            expect(mockConnection.run).toHaveBeenCalledWith(
                expect.stringContaining('CREATE INDEX')
            )
        })

        it('should handle initialization errors', async () => {
            const MockDatabase = vi.mocked(Database)
            MockDatabase.mockImplementationOnce(() => {
                throw new Error('Database connection failed')
            })

            await expect(new DuckDBManager('/invalid/path')).rejects.toThrow('Database initialization failed')
            expect(logError).toHaveBeenCalled()
        })
    })

    describe('CRUD Operations', () => {
        describe('File Operations', () => {
            const testFileInfo: FileInfo = {
                file_path: '/test/project/src/main.ts',
                file_name: 'main.ts',
                directory: '/test/project/src',
                extension: '.ts',
                language: 'typescript',
                size_bytes: 1024,
                lines_count: 50,
                last_modified: new Date('2024-01-01'),
                checksum: 'abc123',
                is_binary: false
            }

            it('should upsert file information', async () => {
                mockConnection.run.mockResolvedValue(undefined)

                await duckdbManager.upsertFile(testFileInfo)

                expect(mockConnection.run).toHaveBeenCalledWith(
                    expect.stringContaining('INSERT OR REPLACE INTO files'),
                    expect.arrayContaining([
                        testFileInfo.file_path,
                        testFileInfo.file_name,
                        testFileInfo.directory,
                        testFileInfo.extension,
                        testFileInfo.language,
                        testFileInfo.size_bytes,
                        testFileInfo.lines_count,
                        testFileInfo.last_modified.toISOString(),
                        testFileInfo.checksum,
                        testFileInfo.is_binary
                    ])
                )
                expect(logInfo).toHaveBeenCalledWith('File information upserted', { filePath: testFileInfo.file_path })
            })

            it('should handle file upsert errors', async () => {
                mockConnection.run.mockRejectedValue(new Error('Database error'))

                await expect(duckdbManager.upsertFile(testFileInfo)).rejects.toThrow('Database error')
                expect(logError).toHaveBeenCalled()
            })
        })

        describe('Symbol Operations', () => {
            const testSymbolInfo: SymbolInfo = {
                id: 'symbol-123',
                name: 'MyClass',
                type: 'class',
                file_path: '/test/project/src/main.ts',
                line_number: 10,
                signature: 'class MyClass {}',
                visibility: 'public',
                complexity: 5,
                language: 'typescript',
                metadata: { extends: 'BaseClass' }
            }

            it('should upsert symbol information', async () => {
                mockConnection.run.mockResolvedValue(undefined)

                await duckdbManager.upsertSymbol(testSymbolInfo)

                expect(mockConnection.run).toHaveBeenCalledWith(
                    expect.stringContaining('INSERT OR REPLACE INTO symbols'),
                    expect.arrayContaining([
                        testSymbolInfo.id,
                        testSymbolInfo.name,
                        testSymbolInfo.type,
                        testSymbolInfo.file_path,
                        testSymbolInfo.line_number,
                        testSymbolInfo.signature,
                        testSymbolInfo.visibility,
                        testSymbolInfo.complexity,
                        testSymbolInfo.language,
                        JSON.stringify(testSymbolInfo.metadata)
                    ])
                )
                expect(logInfo).toHaveBeenCalledWith('Symbol information upserted', { symbolId: testSymbolInfo.id })
            })
        })

        describe('Metrics Operations', () => {
            const testMetricData: MetricData = {
                id: 'metric-123',
                file_path: '/test/project/src/main.ts',
                symbol_id: 'symbol-123',
                metric_type: 'complexity',
                metric_name: 'cyclomatic_complexity',
                metric_value: 5.5,
                recorded_at: new Date('2024-01-01'),
                analysis_version: '1.0.0'
            }

            it('should insert metric data', async () => {
                mockConnection.run.mockResolvedValue(undefined)

                await duckdbManager.insertMetric(testMetricData)

                expect(mockConnection.run).toHaveBeenCalledWith(
                    expect.stringContaining('INSERT INTO metrics'),
                    expect.arrayContaining([
                        testMetricData.id,
                        testMetricData.file_path,
                        testMetricData.symbol_id,
                        testMetricData.metric_type,
                        testMetricData.metric_name,
                        testMetricData.metric_value,
                        testMetricData.recorded_at?.toISOString(),
                        testMetricData.analysis_version
                    ])
                )
                expect(logInfo).toHaveBeenCalledWith('Metric data inserted', { metricId: testMetricData.id })
            })
        })

        describe('Dependency Operations', () => {
            const testDependencyInfo: DependencyInfo = {
                id: 'dep-123',
                from_file: '/test/project/src/main.ts',
                to_file: '/test/project/src/utils.ts',
                dependency_type: 'import',
                symbol_name: 'helper',
                is_external: false,
                package_name: undefined,
                version: undefined
            }

            it('should insert dependency information', async () => {
                mockConnection.run.mockResolvedValue(undefined)

                await duckdbManager.insertDependency(testDependencyInfo)

                expect(mockConnection.run).toHaveBeenCalledWith(
                    expect.stringContaining('INSERT INTO dependencies'),
                    expect.arrayContaining([
                        testDependencyInfo.id,
                        testDependencyInfo.from_file,
                        testDependencyInfo.to_file,
                        testDependencyInfo.dependency_type,
                        testDependencyInfo.symbol_name,
                        testDependencyInfo.is_external,
                        testDependencyInfo.package_name,
                        testDependencyInfo.version
                    ])
                )
                expect(logInfo).toHaveBeenCalledWith('Dependency information inserted', { dependencyId: testDependencyInfo.id })
            })
        })

        describe('Git History Operations', () => {
            const testGitInfo: GitHistoryInfo = {
                commit_hash: 'abc123',
                author: 'John Doe',
                email: 'john@example.com',
                date: new Date('2024-01-01'),
                message: 'Initial commit',
                files_changed: 5,
                insertions: 100,
                deletions: 0,
                commit_type: 'feat',
                branch: 'main',
                tags: ['v1.0.0']
            }

            it('should insert git history information', async () => {
                mockConnection.run.mockResolvedValue(undefined)

                await duckdbManager.insertGitHistory(testGitInfo)

                expect(mockConnection.run).toHaveBeenCalledWith(
                    expect.stringContaining('INSERT OR REPLACE INTO git_history'),
                    expect.arrayContaining([
                        testGitInfo.commit_hash,
                        testGitInfo.author,
                        testGitInfo.email,
                        testGitInfo.date.toISOString(),
                        testGitInfo.message,
                        testGitInfo.files_changed,
                        testGitInfo.insertions,
                        testGitInfo.deletions,
                        testGitInfo.commit_type,
                        testGitInfo.branch,
                        JSON.stringify(testGitInfo.tags)
                    ])
                )
                expect(logInfo).toHaveBeenCalledWith('Git history inserted', { commitHash: testGitInfo.commit_hash })
            })
        })

        describe('TODO Operations', () => {
            const testTodoInfo: TodoInfo = {
                id: 'todo-123',
                text: 'Implement feature X',
                type: 'feature',
                category: 'enhancement',
                file_path: '/test/project/src/main.ts',
                line_number: 25,
                priority: 'high',
                status: 'open',
                assignee: 'john.doe',
                completed_at: undefined
            }

            it('should upsert TODO information', async () => {
                mockConnection.run.mockResolvedValue(undefined)

                await duckdbManager.upsertTodo(testTodoInfo)

                expect(mockConnection.run).toHaveBeenCalledWith(
                    expect.stringContaining('INSERT OR REPLACE INTO todos'),
                    expect.arrayContaining([
                        testTodoInfo.id,
                        testTodoInfo.text,
                        testTodoInfo.type,
                        testTodoInfo.category,
                        testTodoInfo.file_path,
                        testTodoInfo.line_number,
                        testTodoInfo.priority,
                        testTodoInfo.status,
                        testTodoInfo.assignee,
                        null
                    ])
                )
                expect(logInfo).toHaveBeenCalledWith('TODO information upserted', { todoId: testTodoInfo.id })
            })
        })

        describe('Analysis Cache Operations', () => {
            const testCacheInfo: AnalysisCacheInfo = {
                cache_key: 'cache-123',
                analysis_type: 'complexity',
                parameters: { file: '/test/main.ts' },
                result: { complexity: 5 },
                expires_at: new Date('2024-01-02'),
                is_valid: true
            }

            it('should upsert analysis cache', async () => {
                mockConnection.run.mockResolvedValue(undefined)

                await duckdbManager.upsertAnalysisCache(testCacheInfo)

                expect(mockConnection.run).toHaveBeenCalledWith(
                    expect.stringContaining('INSERT OR REPLACE INTO analysis_cache'),
                    expect.arrayContaining([
                        testCacheInfo.cache_key,
                        testCacheInfo.analysis_type,
                        JSON.stringify(testCacheInfo.parameters),
                        JSON.stringify(testCacheInfo.result),
                        testCacheInfo.expires_at?.toISOString(),
                        testCacheInfo.is_valid
                    ])
                )
                expect(logInfo).toHaveBeenCalledWith('Analysis cache upserted', { cacheKey: testCacheInfo.cache_key })
            })
        })
    })

    describe('Query Operations', () => {
        describe('Symbol Queries', () => {
            it('should query symbols with filters', async () => {
                const mockResults = [
                    {
                        id: 'symbol-1',
                        name: 'MyClass',
                        type: 'class',
                        file_path: '/test/main.ts',
                        line_number: 10,
                        signature: 'class MyClass {}',
                        visibility: 'public',
                        complexity: 5,
                        language: 'typescript',
                        metadata: null
                    }
                ]

                mockConnection.all.mockResolvedValue(mockResults)

                const results = await duckdbManager.querySymbols({
                    type: 'class',
                    language: 'typescript',
                    limit: 10
                })

                expect(mockConnection.all).toHaveBeenCalledWith(
                    expect.stringContaining('SELECT'),
                    expect.arrayContaining(['class', 'typescript', 10])
                )
                expect(results).toHaveLength(1)
                expect(results[0].name).toBe('MyClass')
            })

            it('should handle query errors', async () => {
                mockConnection.all.mockRejectedValue(new Error('Query failed'))

                await expect(duckdbManager.querySymbols()).rejects.toThrow('Query failed')
                expect(logError).toHaveBeenCalled()
            })
        })

        describe('Metrics Queries', () => {
            it('should get metrics over time', async () => {
                const mockResults = [
                    { period: '2024-01-01', avg_value: 5.5, min_value: 3, max_value: 8, sample_count: 10, std_dev: 1.2 }
                ]

                mockConnection.all.mockResolvedValue(mockResults)

                const results = await duckdbManager.getMetricsOverTime({
                    metricType: 'complexity',
                    days: 7
                })

                expect(mockConnection.all).toHaveBeenCalledWith(
                    expect.stringContaining('DATE_TRUNC'),
                    expect.arrayContaining(['complexity', 'day'])
                )
                expect(results).toEqual(mockResults)
            })
        })

        describe('Analysis Cache Queries', () => {
            it('should get valid analysis cache', async () => {
                const mockResult = {
                    cache_key: 'cache-123',
                    analysis_type: 'complexity',
                    parameters: '{"file":"main.ts"}',
                    result: '{"complexity":5}',
                    expires_at: null,
                    is_valid: true
                }

                mockConnection.all.mockResolvedValue([mockResult])

                const result = await duckdbManager.getAnalysisCache('cache-123')

                expect(result).toEqual({
                    cache_key: 'cache-123',
                    analysis_type: 'complexity',
                    parameters: { file: 'main.ts' },
                    result: { complexity: 5 },
                    expires_at: undefined,
                    is_valid: true
                })
            })

            it('should return null for non-existent cache', async () => {
                mockConnection.all.mockResolvedValue([])

                const result = await duckdbManager.getAnalysisCache('non-existent')

                expect(result).toBeNull()
            })
        })
    })

    describe('Migration Support', () => {
        it('should migrate from JSON index successfully', async () => {
            const jsonIndexPath = '/test/json-index'

            // Mock file existence and content
            const mockFs = vi.mocked(fs)
            mockFs.access.mockResolvedValue(undefined)
            mockFs.readFile.mockResolvedValue(JSON.stringify({
                files: {
                    '/test/main.ts': {
                        file_name: 'main.ts',
                        directory: '/test',
                        extension: '.ts',
                        language: 'typescript',
                        size_bytes: 1024,
                        lines_count: 50,
                        last_modified: new Date().toISOString(),
                        checksum: 'abc123',
                        is_binary: false
                    }
                },
                symbols: {},
                metrics: {},
                dependencies: {},
                todos: {}
            }))

            await duckdbManager.migrateFromJSON(jsonIndexPath)

            expect(mockConnection.run).toHaveBeenCalledWith(
                expect.stringContaining('INSERT OR REPLACE INTO files')
            )
            expect(logInfo).toHaveBeenCalledWith('Migration from JSON to DuckDB completed successfully')
        })

        it('should skip migration if no JSON index exists', async () => {
            const mockFs = vi.mocked(fs)
            mockFs.access.mockRejectedValue(new Error('File not found'))

            await duckdbManager.migrateFromJSON('/non-existent')

            expect(logInfo).toHaveBeenCalledWith('No JSON index found, skipping migration')
        })

        it('should handle migration errors', async () => {
            const mockFs = vi.mocked(fs)
            mockFs.access.mockResolvedValue(undefined)
            mockFs.readFile.mockRejectedValue(new Error('Read failed'))

            await expect(duckdbManager.migrateFromJSON('/test')).rejects.toThrow('Migration failed')
            expect(logError).toHaveBeenCalled()
        })
    })

    describe('Statistics and Utilities', () => {
        it('should get database statistics', async () => {
            const mockStats = [
                { table_name: 'files', count: 10 },
                { table_name: 'symbols', count: 25 },
                { table_name: 'metrics', count: 50 }
            ]

            mockConnection.all.mockResolvedValue(mockStats)

            const stats = await duckdbManager.getStatistics()

            expect(stats.tables).toEqual(mockStats)
            expect(stats.total_records).toBe(85)
            expect(stats.database_size_bytes).toBe(1024)
        })

        it('should optimize database performance', async () => {
            mockConnection.run.mockResolvedValue(undefined)

            await duckdbManager.optimize()

            expect(mockConnection.run).toHaveBeenCalledWith('ANALYZE;')
            expect(mockConnection.run).toHaveBeenCalledWith('VACUUM;')
            expect(logInfo).toHaveBeenCalledWith('Database optimization completed')
        })

        it('should close database connection', async () => {
            await duckdbManager.close()

            expect(mockDb.close).toHaveBeenCalled()
            expect(logInfo).toHaveBeenCalledWith('Database connection closed')
        })
    })

    describe('Metadata Operations', () => {
        it('should set and get metadata', async () => {
            const testData = { version: '1.0.0', last_sync: new Date() }

            mockConnection.run.mockResolvedValue(undefined)
            mockConnection.all.mockResolvedValue([{ value: JSON.stringify(testData) }])

            await duckdbManager.setMetadata('config', testData)
            const result = await duckdbManager.getMetadata('config')

            expect(mockConnection.run).toHaveBeenCalledWith(
                expect.stringContaining('INSERT OR REPLACE INTO metadata'),
                ['config', JSON.stringify(testData)]
            )
            expect(result).toEqual(testData)
        })

        it('should return null for non-existent metadata', async () => {
            mockConnection.all.mockResolvedValue([])

            const result = await duckdbManager.getMetadata('non-existent')

            expect(result).toBeNull()
        })
    })

    describe('Performance and Error Handling', () => {
        it('should handle concurrent operations', async () => {
            const operations = Array.from({ length: 5 }, (_, i) =>
                duckdbManager.upsertFile({
                    file_path: `/test/file${i}.ts`,
                    file_name: `file${i}.ts`,
                    directory: '/test',
                    extension: '.ts',
                    language: 'typescript',
                    size_bytes: 100,
                    lines_count: 10,
                    last_modified: new Date(),
                    checksum: `checksum${i}`
                })
            )

            await Promise.all(operations)

            expect(mockConnection.run).toHaveBeenCalledTimes(5)
        })

        it('should validate initialization state', () => {
            expect(duckdbManager.isInitialized()).toBe(true)
            expect(duckdbManager.getDatabasePath()).toBe(testDbPath)
        })

        it('should handle connection errors gracefully', async () => {
            mockDb.connect.mockImplementationOnce(() => {
                throw new Error('Connection failed')
            })

            await expect(duckdbManager.getConnection()).rejects.toThrow('Connection failed')
        })
    })
})</content>},{