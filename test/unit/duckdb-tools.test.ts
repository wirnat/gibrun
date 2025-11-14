import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DUCKDB_TOOLS, handleIndexInitialize, handleIndexUpdate, handleIndexQuery, handleIndexSearchSymbols, handleIndexFindReferences, handleIndexAnalyticsTrends, handleIndexAnalyticsCorrelation, handleIndexValidate, handleIndexCleanup, handleCacheGetOverview, handleCacheInvalidateEntries, handleCacheCleanupMaintenance, handleCacheAnalyzePerformance, handleMemoryStoreValue, handleMemoryRetrieveValue, handleMemoryFindRelated } from '../../src/tools/duckdb/index.js'
import { DuckDBManager } from '../../src/core/duckdb-manager.js'
import { DuckDBCacheManager } from '../../src/core/duckdb-cache-manager.js'
import { ProjectIndexer } from '../../src/core/project-indexer.js'
import { SymbolSearchEngine } from '../../src/core/symbol-search-engine.js'
import { logError, logInfo } from '../../src/services/logger-service.js'

// Mock all dependencies
vi.mock('../../src/core/duckdb-manager.js', () => ({
    DuckDBManager: vi.fn()
}))

vi.mock('../../src/core/duckdb-cache-manager.js', () => ({
    DuckDBCacheManager: vi.fn()
}))

vi.mock('../../src/core/project-indexer.js', () => ({
    ProjectIndexer: vi.fn()
}))

vi.mock('../../src/core/symbol-search-engine.js', () => ({
    SymbolSearchEngine: vi.fn()
}))

vi.mock('../../src/services/logger-service.js', () => ({
    logInfo: vi.fn(),
    logError: vi.fn()
}))

describe('MCP Tools', () => {
    let mockDuckDBManager: any
    let mockCacheManager: any
    let mockProjectIndexer: any
    let mockSymbolSearchEngine: any

    beforeEach(() => {
        vi.clearAllMocks()

        mockDuckDBManager = {
            getStatistics: vi.fn(),
            clearIndex: vi.fn(),
            getMetadata: vi.fn(),
            setMetadata: vi.fn()
        }

        mockCacheManager = {
            getConfig: vi.fn(),
            performMaintenance: vi.fn(),
            close: vi.fn()
        }

        mockProjectIndexer = {
            indexProject: vi.fn(),
            updateIncremental: vi.fn(),
            getIndexingStatus: vi.fn(),
            clearIndex: vi.fn()
        }

        mockSymbolSearchEngine = {
            searchSymbols: vi.fn(),
            findReferences: vi.fn(),
            getSymbolStatistics: vi.fn()
        }

        const MockDuckDBManager = vi.mocked(DuckDBManager)
        MockDuckDBManager.mockReturnValue(mockDuckDBManager)

        const MockDuckDBCacheManager = vi.mocked(DuckDBCacheManager)
        MockDuckDBCacheManager.mockReturnValue(mockCacheManager)

        const MockProjectIndexer = vi.mocked(ProjectIndexer)
        MockProjectIndexer.mockReturnValue(mockProjectIndexer)

        const MockSymbolSearchEngine = vi.mocked(SymbolSearchEngine)
        MockSymbolSearchEngine.mockReturnValue(mockSymbolSearchEngine)
    })

    afterEach(() => {
        // Cleanup
    })

    describe('Tool Definitions', () => {
        it('should export DUCKDB_TOOLS array with correct structure', () => {
            expect(DUCKDB_TOOLS).toBeDefined()
            expect(Array.isArray(DUCKDB_TOOLS)).toBe(true)
            expect(DUCKDB_TOOLS.length).toBeGreaterThan(0)

            DUCKDB_TOOLS.forEach(tool => {
                expect(tool).toHaveProperty('name')
                expect(tool).toHaveProperty('description')
                expect(tool).toHaveProperty('inputSchema')
                expect(typeof tool.name).toBe('string')
                expect(typeof tool.description).toBe('string')
                expect(typeof tool.inputSchema).toBe('object')
            })
        })

        it('should include all expected indexing tools', () => {
            const toolNames = DUCKDB_TOOLS.map(t => t.name)
            expect(toolNames).toContain('index_initialize')
            expect(toolNames).toContain('index_update')
            expect(toolNames).toContain('index_query')
            expect(toolNames).toContain('index_search_symbols')
            expect(toolNames).toContain('index_find_references')
            expect(toolNames).toContain('index_analytics_trends')
            expect(toolNames).toContain('index_analytics_correlation')
            expect(toolNames).toContain('index_validate')
            expect(toolNames).toContain('index_cleanup')
        })

        it('should include all expected cache tools', () => {
            const toolNames = DUCKDB_TOOLS.map(t => t.name)
            expect(toolNames).toContain('cache_get_overview')
            expect(toolNames).toContain('cache_invalidate_entries')
            expect(toolNames).toContain('cache_cleanup_maintenance')
            expect(toolNames).toContain('cache_analyze_performance')
            expect(toolNames).toContain('memory_store_value')
            expect(toolNames).toContain('memory_retrieve_value')
            expect(toolNames).toContain('memory_find_related')
        })

        it('should have proper input schemas', () => {
            DUCKDB_TOOLS.forEach(tool => {
                expect(tool.inputSchema).toHaveProperty('type', 'object')
                expect(tool.inputSchema).toHaveProperty('properties')

                if (tool.inputSchema.required) {
                    expect(Array.isArray(tool.inputSchema.required)).toBe(true)
                }
            })
        })
    })

    describe('Indexing Tools', () => {
        describe('handleIndexInitialize', () => {
            it('should initialize index successfully', async () => {
                const mockResult = {
                    success: true,
                    totalFiles: 100,
                    processedFiles: 95,
                    errorFiles: 5,
                    totalSymbols: 500,
                    duration: 5000
                }

                mockProjectIndexer.indexProject.mockResolvedValue(mockResult)

                const result = await handleIndexInitialize(mockProjectIndexer, {
                    project_root: '/test/project',
                    force_recreate: false,
                    include_patterns: ['*.ts', '*.js'],
                    exclude_patterns: ['node_modules/**']
                })

                expect(mockProjectIndexer.indexProject).toHaveBeenCalledWith(
                    expect.objectContaining({
                        forceReindex: false,
                        includePatterns: ['*.ts', '*.js'],
                        excludePatterns: ['node_modules/**']
                    }),
                    undefined
                )
                expect(result.content).toHaveLength(1)
                expect(result.isError).toBeUndefined()
                expect(JSON.parse(result.content[0].text)).toEqual(
                    expect.objectContaining({
                        success: true,
                        totalFiles: 100,
                        processedFiles: 95
                    })
                )
            })

            it('should handle initialization errors', async () => {
                mockProjectIndexer.indexProject.mockRejectedValue(new Error('Initialization failed'))

                const result = await handleIndexInitialize(mockProjectIndexer, {
                    project_root: '/test/project'
                })

                expect(result.content).toHaveLength(1)
                expect(result.isError).toBe(true)
                expect(result.content[0].text).toContain('Initialization failed')
                expect(logError).toHaveBeenCalled()
            })

            it('should use default parameters when not provided', async () => {
                const mockResult = { success: true, totalFiles: 50, processedFiles: 50, errorFiles: 0, totalSymbols: 200, duration: 3000 }
                mockProjectIndexer.indexProject.mockResolvedValue(mockResult)

                await handleIndexInitialize(mockProjectIndexer, {})

                expect(mockProjectIndexer.indexProject).toHaveBeenCalledWith(
                    expect.objectContaining({
                        forceReindex: undefined,
                        includePatterns: ['*.go', '*.ts', '*.tsx', '*.js', '*.jsx', '*.py', '*.java'],
                        excludePatterns: ['node_modules/**', '.git/**', 'dist/**', 'build/**']
                    }),
                    undefined
                )
            })
        })

        describe('handleIndexUpdate', () => {
            it('should update index with changed files', async () => {
                const mockResult = {
                    success: true,
                    totalFiles: 10,
                    processedFiles: 8,
                    errorFiles: 2,
                    totalSymbols: 50,
                    duration: 1000
                }

                mockProjectIndexer.updateIncremental.mockResolvedValue(mockResult)

                const result = await handleIndexUpdate(mockProjectIndexer, {
                    changed_files: ['/test/src/main.ts', '/test/src/utils.ts'],
                    project_root: '/test',
                    include_metrics: true
                })

                expect(mockProjectIndexer.updateIncremental).toHaveBeenCalledWith(
                    ['/test/src/main.ts', '/test/src/utils.ts'],
                    expect.objectContaining({
                        includeMetrics: true
                    }),
                    undefined
                )
                expect(result.content).toHaveLength(1)
                expect(JSON.parse(result.content[0].text)).toEqual(
                    expect.objectContaining({
                        success: true,
                        processedFiles: 8
                    })
                )
            })

            it('should handle empty changed files list', async () => {
                const mockResult = { success: true, totalFiles: 0, processedFiles: 0, errorFiles: 0, totalSymbols: 0, duration: 0 }
                mockProjectIndexer.updateIncremental.mockResolvedValue(mockResult)

                const result = await handleIndexUpdate(mockProjectIndexer, {
                    changed_files: []
                })

                expect(mockProjectIndexer.updateIncremental).toHaveBeenCalledWith(
                    [],
                    {},
                    undefined
                )
                expect(result.isError).toBeUndefined()
            })
        })

        describe('handleIndexQuery', () => {
            it('should query index with search parameters', async () => {
                const mockSymbols = [
                    { id: 'sym-1', name: 'UserService', type: 'class', file_path: '/src/user.ts' },
                    { id: 'sym-2', name: 'getUser', type: 'function', file_path: '/src/user.ts' }
                ]

                mockSymbolSearchEngine.searchSymbols.mockResolvedValue(mockSymbols)

                const result = await handleIndexQuery(mockSymbolSearchEngine, {
                    search_term: 'User',
                    type: 'class',
                    language: 'typescript',
                    limit: 50
                })

                expect(mockSymbolSearchEngine.searchSymbols).toHaveBeenCalledWith(
                    expect.objectContaining({
                        searchTerm: 'User',
                        type: 'class',
                        language: 'typescript',
                        limit: 50
                    })
                )
                expect(result.content).toHaveLength(1)
                const parsedResult = JSON.parse(result.content[0].text)
                expect(parsedResult.symbols).toHaveLength(2)
                expect(parsedResult.total).toBe(2)
            })

            it('should handle query errors', async () => {
                mockSymbolSearchEngine.searchSymbols.mockRejectedValue(new Error('Query failed'))

                const result = await handleIndexQuery(mockSymbolSearchEngine, {
                    search_term: 'test'
                })

                expect(result.isError).toBe(true)
                expect(result.content[0].text).toContain('Query failed')
            })
        })

        describe('handleIndexSearchSymbols', () => {
            it('should search symbols with advanced filters', async () => {
                const mockSymbols = [
                    { id: 'sym-1', name: 'ComplexFunction', type: 'function', complexity: 15, file_path: '/src/complex.ts' }
                ]

                mockSymbolSearchEngine.findComplexSymbols.mockResolvedValue(mockSymbols)

                const result = await handleIndexSearchSymbols(mockSymbolSearchEngine, {
                    min_complexity: 10,
                    language: 'typescript',
                    limit: 20
                })

                expect(mockSymbolSearchEngine.findComplexSymbols).toHaveBeenCalledWith(10, 'typescript', 20)
                expect(result.content).toHaveLength(1)
                const parsedResult = JSON.parse(result.content[0].text)
                expect(parsedResult.symbols).toHaveLength(1)
                expect(parsedResult.symbols[0].complexity).toBe(15)
            })
        })

        describe('handleIndexFindReferences', () => {
            it('should find symbol references', async () => {
                const mockReferences = [
                    { type: 'definition', file_path: '/src/user.ts', line_number: 10 },
                    { type: 'usage', file_path: '/src/controller.ts', line_number: 25 }
                ]

                mockSymbolSearchEngine.findReferences.mockResolvedValue(mockReferences)

                const result = await handleIndexFindReferences(mockSymbolSearchEngine, {
                    symbol_name: 'UserService',
                    file_path: '/src/user.ts'
                })

                expect(mockSymbolSearchEngine.findReferences).toHaveBeenCalledWith('UserService', '/src/user.ts')
                expect(result.content).toHaveLength(1)
                const parsedResult = JSON.parse(result.content[0].text)
                expect(parsedResult.references).toHaveLength(2)
                expect(parsedResult.total).toBe(2)
            })
        })

        describe('handleIndexAnalyticsTrends', () => {
            it('should get analytics trends', async () => {
                const mockTrends = [
                    { period: '2024-01-01', avg_complexity: 5.2, total_symbols: 150 },
                    { period: '2024-01-02', avg_complexity: 4.8, total_symbols: 152 }
                ]

                mockDuckDBManager.getMetricsOverTime = vi.fn().mockResolvedValue(mockTrends)

                const result = await handleIndexAnalyticsTrends(mockDuckDBManager, {
                    metric_type: 'complexity',
                    days: 7,
                    group_by: 'day'
                })

                expect(mockDuckDBManager.getMetricsOverTime).toHaveBeenCalledWith(
                    expect.objectContaining({
                        metricType: 'complexity',
                        days: 7,
                        groupBy: 'day'
                    })
                )
                expect(result.content).toHaveLength(1)
                const parsedResult = JSON.parse(result.content[0].text)
                expect(parsedResult.trends).toHaveLength(2)
            })
        })

        describe('handleIndexAnalyticsCorrelation', () => {
            it('should analyze symbol correlations', async () => {
                const mockStats = {
                    total_symbols: 200,
                    by_type: { class: 30, function: 120 },
                    by_language: { typescript: 180, javascript: 20 },
                    avg_complexity: 4.5,
                    max_complexity: 20
                }

                mockSymbolSearchEngine.getSymbolStatistics.mockResolvedValue(mockStats)

                const result = await handleIndexAnalyticsCorrelation(mockSymbolSearchEngine, {})

                expect(mockSymbolSearchEngine.getSymbolStatistics).toHaveBeenCalled()
                expect(result.content).toHaveLength(1)
                const parsedResult = JSON.parse(result.content[0].text)
                expect(parsedResult.statistics).toEqual(mockStats)
            })
        })

        describe('handleIndexValidate', () => {
            it('should validate index integrity', async () => {
                const mockStatus = {
                    isIndexed: true,
                    totalFiles: 100,
                    totalSymbols: 500,
                    totalMetrics: 1000,
                    databaseSize: 1048576
                }

                mockProjectIndexer.getIndexingStatus.mockResolvedValue(mockStatus)

                const result = await handleIndexValidate(mockProjectIndexer, {
                    check_consistency: true,
                    validate_metrics: true
                })

                expect(mockProjectIndexer.getIndexingStatus).toHaveBeenCalled()
                expect(result.content).toHaveLength(1)
                const parsedResult = JSON.parse(result.content[0].text)
                expect(parsedResult.status).toEqual(mockStatus)
                expect(parsedResult.isValid).toBe(true)
            })
        })

        describe('handleIndexCleanup', () => {
            it('should cleanup index data', async () => {
                mockProjectIndexer.clearIndex.mockResolvedValue(undefined)

                const result = await handleIndexCleanup(mockProjectIndexer, {
                    remove_metrics: true,
                    remove_cache: true,
                    vacuum_database: true
                })

                expect(mockProjectIndexer.clearIndex).toHaveBeenCalled()
                expect(result.content).toHaveLength(1)
                expect(result.content[0].text).toContain('Index cleanup completed')
            })

            it('should handle cleanup errors', async () => {
                mockProjectIndexer.clearIndex.mockRejectedValue(new Error('Cleanup failed'))

                const result = await handleIndexCleanup(mockProjectIndexer, {})

                expect(result.isError).toBe(true)
                expect(result.content[0].text).toContain('Cleanup failed')
            })
        })
    })

    describe('Cache Tools', () => {
        describe('handleCacheGetOverview', () => {
            it('should get cache overview', async () => {
                const mockConfig = {
                    memoryLimit: '256MB',
                    threads: 4,
                    maintenanceIntervalMs: 300000
                }

                mockCacheManager.getConfig.mockReturnValue(mockConfig)

                const result = await handleCacheGetOverview(mockCacheManager, {})

                expect(mockCacheManager.getConfig).toHaveBeenCalled()
                expect(result.content).toHaveLength(1)
                const parsedResult = JSON.parse(result.content[0].text)
                expect(parsedResult.config).toEqual(mockConfig)
            })
        })

        describe('handleCacheInvalidateEntries', () => {
            it('should invalidate cache entries', async () => {
                const result = await handleCacheInvalidateEntries(mockCacheManager, {
                    pattern: 'analysis_*',
                    older_than_hours: 24
                })

                expect(result.content).toHaveLength(1)
                expect(result.content[0].text).toContain('Cache invalidation completed')
            })
        })

        describe('handleCacheCleanupMaintenance', () => {
            it('should perform cache maintenance', async () => {
                mockCacheManager.performMaintenance.mockResolvedValue(undefined)

                const result = await handleCacheCleanupMaintenance(mockCacheManager, {
                    vacuum: true,
                    rebuild_indexes: true
                })

                expect(mockCacheManager.performMaintenance).toHaveBeenCalled()
                expect(result.content).toHaveLength(1)
                expect(result.content[0].text).toContain('Cache maintenance completed')
            })

            it('should handle maintenance errors', async () => {
                mockCacheManager.performMaintenance.mockRejectedValue(new Error('Maintenance failed'))

                const result = await handleCacheCleanupMaintenance(mockCacheManager, {})

                expect(result.isError).toBe(true)
                expect(result.content[0].text).toContain('Maintenance failed')
            })
        })

        describe('handleCacheAnalyzePerformance', () => {
            it('should analyze cache performance', async () => {
                const result = await handleCacheAnalyzePerformance(mockCacheManager, {
                    time_range_hours: 24,
                    include_hit_rates: true
                })

                expect(result.content).toHaveLength(1)
                expect(result.content[0].text).toContain('Cache performance analysis')
            })
        })
    })

    describe('Memory Tools', () => {
        describe('handleMemoryStoreValue', () => {
            it('should store memory value', async () => {
                const result = await handleMemoryStoreValue(mockCacheManager, {
                    session_id: 'session-123',
                    key: 'last_query',
                    value: { query: 'SELECT * FROM symbols', timestamp: new Date() },
                    type: 'episodic',
                    salience: 0.8,
                    ttl_hours: 24
                })

                expect(result.content).toHaveLength(1)
                expect(result.content[0].text).toContain('Memory value stored')
            })
        })

        describe('handleMemoryRetrieveValue', () => {
            it('should retrieve memory value', async () => {
                const result = await handleMemoryRetrieveValue(mockCacheManager, {
                    session_id: 'session-123',
                    key: 'last_query'
                })

                expect(result.content).toHaveLength(1)
                expect(result.content[0].text).toContain('Memory value retrieved')
            })
        })

        describe('handleMemoryFindRelated', () => {
            it('should find related memory values', async () => {
                const result = await handleMemoryFindRelated(mockCacheManager, {
                    session_id: 'session-123',
                    type: 'episodic',
                    min_salience: 0.5
                })

                expect(result.content).toHaveLength(1)
                expect(result.content[0].text).toContain('Related memory values found')
            })
        })
    })

    describe('Error Handling and Validation', () => {
        it('should handle invalid input parameters', async () => {
            const result = await handleIndexQuery(mockSymbolSearchEngine, {
                search_term: '',
                limit: -1
            })

            expect(result.isError).toBeUndefined() // Should handle gracefully
        })

        it('should validate required parameters', async () => {
            const result = await handleIndexFindReferences(mockSymbolSearchEngine, {})

            // Should handle missing symbol_name gracefully
            expect(result.content).toHaveLength(1)
        })

        it('should handle service unavailability', async () => {
            mockSymbolSearchEngine.searchSymbols.mockImplementation(() => {
                throw new Error('Service unavailable')
            })

            const result = await handleIndexQuery(mockSymbolSearchEngine, {
                search_term: 'test'
            })

            expect(result.isError).toBe(true)
            expect(result.content[0].text).toContain('Service unavailable')
            expect(logError).toHaveBeenCalled()
        })

        it('should handle timeout scenarios', async () => {
            mockProjectIndexer.indexProject.mockImplementation(
                () => new Promise(resolve => setTimeout(() => resolve({
                    success: false,
                    error: 'Timeout'
                }), 100))
            )

            const startTime = Date.now()
            const result = await handleIndexInitialize(mockProjectIndexer, {
                project_root: '/test'
            })
            const endTime = Date.now()

            expect(endTime - startTime).toBeGreaterThanOrEqual(100)
        })

        it('should provide meaningful error messages', async () => {
            mockDuckDBManager.getStatistics.mockRejectedValue(new Error('Database connection lost'))

            const result = await handleIndexAnalyticsCorrelation(mockSymbolSearchEngine, {})

            expect(result.isError).toBe(true)
            expect(result.content[0].text).toContain('Database connection lost')
        })
    })

    describe('Performance and Monitoring', () => {
        it('should handle concurrent tool calls', async () => {
            const operations = Array.from({ length: 5 }, (_, i) =>
                handleIndexQuery(mockSymbolSearchEngine, {
                    search_term: `query${i}`,
                    limit: 10
                })
            )

            const startTime = Date.now()
            const results = await Promise.all(operations)
            const endTime = Date.now()

            expect(results).toHaveLength(5)
            results.forEach(result => {
                expect(result).toHaveProperty('content')
                expect(result).toHaveProperty('isError')
            })
            expect(endTime - startTime).toBeLessThan(2000)
        })

        it('should track operation metrics', async () => {
            mockSymbolSearchEngine.searchSymbols.mockResolvedValue([
                { id: 'sym-1', name: 'Test', type: 'function' }
            ])

            await handleIndexQuery(mockSymbolSearchEngine, {
                search_term: 'test',
                limit: 1
            })

            expect(logInfo).toHaveBeenCalledWith(
                expect.stringContaining('Index query completed'),
                expect.any(Object)
            )
        })

        it('should handle large result sets', async () => {
            const largeResultSet = Array.from({ length: 1000 }, (_, i) => ({
                id: `sym-${i}`,
                name: `Symbol${i}`,
                type: 'function',
                file_path: `/file${i % 10}.ts`,
                line_number: i % 100
            }))

            mockSymbolSearchEngine.searchSymbols.mockResolvedValue(largeResultSet)

            const result = await handleIndexQuery(mockSymbolSearchEngine, {
                search_term: 'Symbol',
                limit: 1000
            })

            expect(result.content).toHaveLength(1)
            const parsedResult = JSON.parse(result.content[0].text)
            expect(parsedResult.symbols).toHaveLength(1000)
            expect(parsedResult.total).toBe(1000)
        })

        it('should implement proper resource cleanup', async () => {
            await handleCacheCleanupMaintenance(mockCacheManager, {
                vacuum: true
            })

            expect(mockCacheManager.performMaintenance).toHaveBeenCalled()
        })
    })

    describe('Integration Scenarios', () => {
        it('should support complete indexing workflow', async () => {
            // Initialize
            mockProjectIndexer.indexProject.mockResolvedValue({
                success: true,
                totalFiles: 50,
                processedFiles: 50,
                totalSymbols: 200
            })

            const initResult = await handleIndexInitialize(mockProjectIndexer, {
                project_root: '/test/project'
            })
            expect(initResult.isError).toBeUndefined()

            // Query
            mockSymbolSearchEngine.searchSymbols.mockResolvedValue([
                { id: 'sym-1', name: 'UserService', type: 'class' }
            ])

            const queryResult = await handleIndexQuery(mockSymbolSearchEngine, {
                search_term: 'User'
            })
            expect(queryResult.isError).toBeUndefined()

            // Update
            mockProjectIndexer.updateIncremental.mockResolvedValue({
                success: true,
                processedFiles: 5
            })

            const updateResult = await handleIndexUpdate(mockProjectIndexer, {
                changed_files: ['/test/new.ts']
            })
            expect(updateResult.isError).toBeUndefined()
        })

        it('should handle cache and memory operations together', async () => {
            // Store memory
            const storeResult = await handleMemoryStoreValue(mockCacheManager, {
                session_id: 'session-123',
                key: 'query_history',
                value: ['SELECT * FROM symbols'],
                type: 'episodic'
            })
            expect(storeResult.isError).toBeUndefined()

            // Get cache overview
            mockCacheManager.getConfig.mockReturnValue({ memoryLimit: '256MB' })
            const overviewResult = await handleCacheGetOverview(mockCacheManager, {})
            expect(overviewResult.isError).toBeUndefined()

            // Perform maintenance
            mockCacheManager.performMaintenance.mockResolvedValue(undefined)
            const maintenanceResult = await handleCacheCleanupMaintenance(mockCacheManager, {})
            expect(maintenanceResult.isError).toBeUndefined()
        })
    })
})</content>},{