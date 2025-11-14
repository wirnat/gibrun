import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import { ProjectIndexer, IndexingOptions, IndexingResult } from '../../src/core/project-indexer.js'
import { DuckDBManager } from '../../src/core/duckdb-manager.js'
import { FileProcessor } from '../../src/core/file-processor.js'
import { SymbolExtractor } from '../../src/core/symbol-extractor.js'
import { MetricsCalculator } from '../../src/core/metrics-calculator.js'
import { logInfo, logError } from '../../src/services/logger-service.js'

// Mock all dependencies
vi.mock('fs/promises', () => ({
    readdir: vi.fn(),
    readFile: vi.fn(),
    stat: vi.fn(),
    access: vi.fn()
}))

vi.mock('path', () => ({
    join: vi.fn(),
    relative: vi.fn(),
    dirname: vi.fn(),
    basename: vi.fn(),
    extname: vi.fn()
}))

vi.mock('../../src/core/duckdb-manager.js', () => ({
    DuckDBManager: vi.fn().mockImplementation(() => ({
        upsertFile: vi.fn(),
        upsertSymbol: vi.fn(),
        insertMetric: vi.fn(),
        getConnection: vi.fn().mockReturnValue({
            run: vi.fn(),
            all: vi.fn(),
            close: vi.fn()
        }),
        close: vi.fn(),
        getStatistics: vi.fn(),
        getDatabasePath: vi.fn()
    }))
}))

vi.mock('../../src/core/file-processor.js', () => ({
    FileProcessor: vi.fn().mockImplementation(() => ({
        processFile: vi.fn(),
        detectChanges: vi.fn(),
        cleanupDeletedFiles: vi.fn()
    }))
}))

vi.mock('../../src/core/symbol-extractor.js', () => ({
    SymbolExtractor: vi.fn().mockImplementation(() => ({
        extractSymbols: vi.fn()
    }))
}))

vi.mock('../../src/core/metrics-calculator.js', () => ({
    MetricsCalculator: vi.fn().mockImplementation(() => ({
        calculateFileMetrics: vi.fn()
    }))
}))

vi.mock('../../src/services/logger-service.js', () => ({
    logInfo: vi.fn(),
    logError: vi.fn()
}))

describe('Indexing System', () => {
    let projectIndexer: ProjectIndexer
    let mockDuckDBManager: any
    let mockFileProcessor: any
    let mockSymbolExtractor: any
    let mockMetricsCalculator: any
    const testProjectRoot = '/test/project'

    beforeEach(() => {
        vi.clearAllMocks()

        // Setup path mocks
        const mockPath = vi.mocked(path)
        mockPath.join.mockImplementation((...args) => args.join('/'))
        mockPath.relative.mockImplementation((from, to) => to.replace(from + '/', ''))
        mockPath.dirname.mockReturnValue('/test/project/src')
        mockPath.basename.mockReturnValue('main.ts')
        mockPath.extname.mockReturnValue('.ts')

        // Setup fs mocks
        const mockFs = vi.mocked(fs)
        mockFs.readdir.mockResolvedValue([
            { name: 'main.ts', isDirectory: () => false, isFile: () => true },
            { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
            { name: 'node_modules', isDirectory: () => true, isFile: () => false }
        ] as any)
        mockFs.readFile.mockResolvedValue('export class Test {}')
        mockFs.stat.mockResolvedValue({ size: 1024, mtime: new Date() } as any)

        // Setup component mocks
        mockDuckDBManager = {
            upsertFile: vi.fn().mockResolvedValue(undefined),
            upsertSymbol: vi.fn().mockResolvedValue(undefined),
            insertMetric: vi.fn().mockResolvedValue(undefined),
            getConnection: vi.fn().mockReturnValue({
                run: vi.fn().mockResolvedValue(undefined),
                all: vi.fn().mockResolvedValue([]),
                close: vi.fn().mockResolvedValue(undefined)
            }),
            close: vi.fn().mockResolvedValue(undefined),
            getStatistics: vi.fn().mockResolvedValue({
                tables: [],
                total_records: 0,
                database_size_bytes: 0
            }),
            getDatabasePath: vi.fn().mockReturnValue('/test/db')
        }

        mockFileProcessor = {
            processFile: vi.fn(),
            detectChanges: vi.fn(),
            cleanupDeletedFiles: vi.fn().mockResolvedValue(undefined)
        }

        mockSymbolExtractor = {
            extractSymbols: vi.fn()
        }

        mockMetricsCalculator = {
            calculateFileMetrics: vi.fn()
        }

        // Mock constructors
        const MockDuckDBManager = vi.mocked(DuckDBManager)
        MockDuckDBManager.mockReturnValue(mockDuckDBManager)

        const MockFileProcessor = vi.mocked(FileProcessor)
        MockFileProcessor.mockReturnValue(mockFileProcessor)

        const MockSymbolExtractor = vi.mocked(SymbolExtractor)
        MockSymbolExtractor.mockReturnValue(mockSymbolExtractor)

        const MockMetricsCalculator = vi.mocked(MetricsCalculator)
        MockMetricsCalculator.mockReturnValue(mockMetricsCalculator)

        projectIndexer = new ProjectIndexer(testProjectRoot, mockDuckDBManager)
    })

    afterEach(async () => {
        if (projectIndexer) {
            // Cleanup if needed
        }
    })

    describe('File Discovery', () => {
        it('should discover files with default options', async () => {
            const files = await (projectIndexer as any).discoverFiles({})

            expect(fs.readdir).toHaveBeenCalledWith(testProjectRoot, { withFileTypes: true })
            expect(files).toContain('/test/project/main.ts')
            expect(files).toContain('/test/project/utils.ts')
            expect(files).not.toContain('/test/project/node_modules')
        })

        it('should respect include patterns', async () => {
            const files = await (projectIndexer as any).discoverFiles({
                includePatterns: ['*.ts']
            })

            expect(files).toEqual(
                expect.arrayContaining(['/test/project/main.ts', '/test/project/utils.ts'])
            )
        })

        it('should respect exclude patterns', async () => {
            const files = await (projectIndexer as any).discoverFiles({
                excludePatterns: ['**/utils.ts']
            })

            expect(files).toContain('/test/project/main.ts')
            expect(files).not.toContain('/test/project/utils.ts')
        })

        it('should skip unsupported file types', async () => {
            const mockFs = vi.mocked(fs)
            mockFs.readdir.mockResolvedValue([
                { name: 'main.ts', isDirectory: () => false, isFile: () => true },
                { name: 'readme.txt', isDirectory: () => false, isFile: () => true }
            ] as any)

            const files = await (projectIndexer as any).discoverFiles({})

            expect(files).toContain('/test/project/main.ts')
            expect(files).not.toContain('/test/project/readme.txt')
        })

        it('should handle directory read errors gracefully', async () => {
            const mockFs = vi.mocked(fs)
            mockFs.readdir.mockRejectedValueOnce(new Error('Permission denied'))

            const files = await (projectIndexer as any).discoverFiles({})

            expect(logError).toHaveBeenCalledWith('Failed to read directory', expect.any(Object))
            expect(files).toEqual([])
        })
    })

    describe('File Processing', () => {
        const mockFileInfo = {
            file_path: '/test/project/main.ts',
            file_name: 'main.ts',
            directory: '/test/project',
            extension: '.ts',
            language: 'typescript',
            size_bytes: 1024,
            lines_count: 50,
            last_modified: new Date(),
            checksum: 'abc123',
            is_binary: false
        }

        beforeEach(() => {
            mockFileProcessor.processFile.mockResolvedValue({
                fileInfo: mockFileInfo,
                processed: true,
                skipped: false,
                error: undefined,
                checksumChanged: true,
                processingTime: 100
            })
        })

        it('should process files successfully', async () => {
            const filePaths = ['/test/project/main.ts']
            const results = await (projectIndexer as any).processFiles(filePaths, {}, undefined)

            expect(mockFileProcessor.processFile).toHaveBeenCalledWith(
                '/test/project/main.ts',
                expect.objectContaining({
                    forceReprocess: undefined,
                    maxFileSize: undefined
                })
            )
            expect(results).toHaveLength(1)
            expect(results[0].processed).toBe(true)
        })

        it('should handle file processing errors', async () => {
            mockFileProcessor.processFile.mockRejectedValue(new Error('Processing failed'))

            const filePaths = ['/test/project/main.ts']
            const results = await (projectIndexer as any).processFiles(filePaths, {}, undefined)

            expect(results[0].processed).toBe(false)
            expect(results[0].error).toBe('Processing failed')
            expect(logError).toHaveBeenCalled()
        })

        it('should process files in batches with concurrency control', async () => {
            const filePaths = Array.from({ length: 15 }, (_, i) => `/test/project/file${i}.ts`)

            const results = await (projectIndexer as any).processFiles(filePaths, { maxConcurrency: 5 }, undefined)

            expect(mockFileProcessor.processFile).toHaveBeenCalledTimes(15)
            expect(results).toHaveLength(15)
        })

        it('should respect max file size limits', async () => {
            const options = { maxFileSize: 500 }
            const filePaths = ['/test/project/main.ts']

            await (projectIndexer as any).processFiles(filePaths, options, undefined)

            expect(mockFileProcessor.processFile).toHaveBeenCalledWith(
                '/test/project/main.ts',
                expect.objectContaining({
                    maxFileSize: 500
                })
            )
        })
    })

    describe('Symbol Extraction', () => {
        beforeEach(() => {
            mockSymbolExtractor.extractSymbols.mockResolvedValue({
                symbols: [
                    {
                        id: 'symbol-1',
                        name: 'TestClass',
                        type: 'class',
                        file_path: '/test/project/main.ts',
                        line_number: 1,
                        language: 'typescript'
                    }
                ],
                dependencies: [],
                errors: []
            })

            mockMetricsCalculator.calculateFileMetrics.mockResolvedValue({
                fileMetrics: {
                    file_path: '/test/project/main.ts',
                    lines_count: 50,
                    complexity: 5,
                    quality_score: 8.5,
                    duplication_percentage: 0,
                    maintainability_index: 85,
                    technical_debt_hours: 2
                },
                symbolMetrics: [],
                errors: [],
                processingTime: 50
            })
        })

        it('should extract symbols from changed files', async () => {
            const changedFiles = ['/test/project/main.ts']

            await (projectIndexer as any).extractSymbolsAndMetrics(changedFiles, {}, undefined)

            expect(mockSymbolExtractor.extractSymbols).toHaveBeenCalledWith(
                '/test/project/main.ts',
                'export class Test {}',
                expect.objectContaining({
                    includePrivate: undefined,
                    maxFileSize: undefined
                })
            )

            expect(mockDuckDBManager.upsertSymbol).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'TestClass',
                    type: 'class'
                })
            )
        })

        it('should calculate metrics when enabled', async () => {
            const changedFiles = ['/test/project/main.ts']

            await (projectIndexer as any).extractSymbolsAndMetrics(changedFiles, { includeMetrics: true }, undefined)

            expect(mockMetricsCalculator.calculateFileMetrics).toHaveBeenCalledWith(
                '/test/project/main.ts',
                'export class Test {}',
                expect.objectContaining({
                    includeComplexity: true,
                    includeQuality: true,
                    includeDuplication: true
                })
            )
        })

        it('should skip metrics calculation when disabled', async () => {
            const changedFiles = ['/test/project/main.ts']

            await (projectIndexer as any).extractSymbolsAndMetrics(changedFiles, { includeMetrics: false }, undefined)

            expect(mockMetricsCalculator.calculateFileMetrics).not.toHaveBeenCalled()
        })

        it('should handle symbol extraction errors', async () => {
            mockSymbolExtractor.extractSymbols.mockRejectedValue(new Error('Extraction failed'))

            const changedFiles = ['/test/project/main.ts']

            await (projectIndexer as any).extractSymbolsAndMetrics(changedFiles, {}, undefined)

            expect(logError).toHaveBeenCalledWith('Symbol extraction/metrics failed', expect.any(Object))
        })

        it('should handle metrics calculation errors', async () => {
            mockMetricsCalculator.calculateFileMetrics.mockResolvedValue({
                fileMetrics: {},
                symbolMetrics: [],
                errors: ['Metrics calculation failed'],
                processingTime: 0
            })

            const changedFiles = ['/test/project/main.ts']

            await (projectIndexer as any).extractSymbolsAndMetrics(changedFiles, { includeMetrics: true }, undefined)

            expect(logError).toHaveBeenCalledWith('Metrics calculation errors', expect.any(Object))
        })
    })

    describe('Full Project Indexing', () => {
        beforeEach(() => {
            // Setup successful indexing mocks
            mockFileProcessor.processFile.mockResolvedValue({
                fileInfo: {
                    file_path: '/test/project/main.ts',
                    file_name: 'main.ts',
                    directory: '/test/project',
                    extension: '.ts',
                    language: 'typescript',
                    size_bytes: 1024,
                    lines_count: 50,
                    last_modified: new Date(),
                    checksum: 'abc123'
                },
                processed: true,
                skipped: false,
                checksumChanged: true,
                processingTime: 100
            })

            mockSymbolExtractor.extractSymbols.mockResolvedValue({
                symbols: [],
                dependencies: [],
                errors: []
            })

            mockMetricsCalculator.calculateFileMetrics.mockResolvedValue({
                fileMetrics: {},
                symbolMetrics: [],
                errors: [],
                processingTime: 0
            })
        })

        it('should index entire project successfully', async () => {
            const result = await projectIndexer.indexProject()

            expect(result.success).toBe(true)
            expect(result.totalFiles).toBeGreaterThan(0)
            expect(result.processedFiles).toBeGreaterThan(0)
            expect(result.errorFiles).toBe(0)
            expect(result.duration).toBeGreaterThan(0)
            expect(logInfo).toHaveBeenCalledWith(
                'Project indexing completed',
                expect.any(Object)
            )
        })

        it('should handle indexing options', async () => {
            const options: IndexingOptions = {
                forceReindex: true,
                includePatterns: ['*.ts'],
                excludePatterns: ['**/test/**'],
                maxFileSize: 1024 * 1024,
                maxConcurrency: 10,
                includeMetrics: true,
                includePrivateSymbols: false
            }

            const result = await projectIndexer.indexProject(options)

            expect(result.success).toBe(true)
            expect(mockFileProcessor.processFile).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    forceReprocess: true,
                    maxFileSize: 1024 * 1024
                })
            )
        })

        it('should handle indexing failures', async () => {
            mockFileProcessor.processFile.mockRejectedValue(new Error('Processing failed'))

            const result = await projectIndexer.indexProject()

            expect(result.success).toBe(false)
            expect(result.errorFiles).toBeGreaterThan(0)
            expect(result.errors).toContain('Indexing failed: Processing failed')
            expect(logError).toHaveBeenCalled()
        })

        it('should provide progress callbacks', async () => {
            const progressCallback = vi.fn()

            await projectIndexer.indexProject({}, progressCallback)

            expect(progressCallback).toHaveBeenCalledWith(
                expect.objectContaining({
                    phase: 'discovery',
                    processed: 0,
                    total: 1
                })
            )

            expect(progressCallback).toHaveBeenCalledWith(
                expect.objectContaining({
                    phase: 'processing',
                    processed: expect.any(Number),
                    total: expect.any(Number)
                })
            )
        })
    })

    describe('Incremental Updates', () => {
        beforeEach(() => {
            mockFileProcessor.detectChanges.mockResolvedValue({
                changed: ['/test/project/main.ts'],
                unchanged: [],
                new: ['/test/project/new.ts'],
                deleted: ['/test/project/old.ts']
            })

            mockFileProcessor.processFile.mockResolvedValue({
                fileInfo: {
                    file_path: '/test/project/main.ts',
                    file_name: 'main.ts',
                    directory: '/test/project',
                    extension: '.ts',
                    language: 'typescript',
                    size_bytes: 1024,
                    lines_count: 50,
                    last_modified: new Date(),
                    checksum: 'abc123'
                },
                processed: true,
                skipped: false,
                checksumChanged: true,
                processingTime: 100
            })
        })

        it('should perform incremental updates', async () => {
            const changedFiles = ['/test/project/main.ts']
            const result = await projectIndexer.updateIncremental(changedFiles)

            expect(mockFileProcessor.detectChanges).toHaveBeenCalledWith(changedFiles, {})
            expect(result.success).toBe(true)
            expect(result.processedFiles).toBeGreaterThan(0)
            expect(logInfo).toHaveBeenCalledWith(
                'Incremental update completed',
                expect.any(Object)
            )
        })

        it('should cleanup deleted files', async () => {
            mockFileProcessor.detectChanges.mockResolvedValue({
                changed: [],
                unchanged: [],
                new: [],
                deleted: ['/test/project/deleted.ts']
            })

            const result = await projectIndexer.updateIncremental(['dummy'])

            expect(mockFileProcessor.cleanupDeletedFiles).toHaveBeenCalledWith(['/test/project/deleted.ts'])
            expect(logInfo).toHaveBeenCalledWith('Cleaned up deleted files', { count: 1 })
        })

        it('should handle incremental update errors', async () => {
            mockFileProcessor.detectChanges.mockRejectedValue(new Error('Detection failed'))

            const result = await projectIndexer.updateIncremental(['dummy'])

            expect(result.success).toBe(false)
            expect(result.errors).toContain('Incremental update failed: Detection failed')
            expect(logError).toHaveBeenCalled()
        })
    })

    describe('Statistics Calculation', () => {
        it('should calculate project statistics', async () => {
            const mockConnection = mockDuckDBManager.getConnection()
            mockConnection.all
                .mockResolvedValueOnce([{ language: 'typescript', count: 5 }, { language: 'javascript', count: 3 }])
                .mockResolvedValueOnce([{ extension: '.ts', count: 5 }, { extension: '.js', count: 3 }])
                .mockResolvedValueOnce([{ avg_complexity: 4.2 }])
                .mockResolvedValueOnce([{ total_lines: 1500 }])

            const stats = await (projectIndexer as any).calculateStatistics()

            expect(stats.languages).toEqual({ typescript: 5, javascript: 3 })
            expect(stats.fileTypes).toEqual({ '.ts': 5, '.js': 3 })
            expect(stats.averageComplexity).toBe(4.2)
            expect(stats.totalLines).toBe(1500)
        })

        it('should get total symbols and metrics counts', async () => {
            const mockConnection = mockDuckDBManager.getConnection()
            mockConnection.all
                .mockResolvedValueOnce([{ count: 25 }])
                .mockResolvedValueOnce([{ count: 150 }])

            const symbolsCount = await (projectIndexer as any).getTotalSymbols()
            const metricsCount = await (projectIndexer as any).getTotalMetrics()

            expect(symbolsCount).toBe(25)
            expect(metricsCount).toBe(150)
        })
    })

    describe('Indexing Status', () => {
        it('should get indexing status', async () => {
            const mockConnection = mockDuckDBManager.getConnection()
            mockConnection.all.mockResolvedValue([
                { total_files: 10, total_symbols: 25, total_metrics: 50, last_updated: '2024-01-01T00:00:00.000Z' }
            ])

            const status = await projectIndexer.getIndexingStatus()

            expect(status.isIndexed).toBe(true)
            expect(status.totalFiles).toBe(10)
            expect(status.totalSymbols).toBe(25)
            expect(status.totalMetrics).toBe(50)
            expect(status.lastIndexed).toBeInstanceOf(Date)
            expect(status.databaseSize).toBe(1024)
        })

        it('should handle non-indexed projects', async () => {
            const mockConnection = mockDuckDBManager.getConnection()
            mockConnection.all.mockResolvedValue([{ total_files: 0, total_symbols: 0, total_metrics: 0, last_updated: null }])

            const status = await projectIndexer.getIndexingStatus()

            expect(status.isIndexed).toBe(false)
            expect(status.lastIndexed).toBeUndefined()
        })
    })

    describe('Index Management', () => {
        it('should clear index successfully', async () => {
            const mockConnection = mockDuckDBManager.getConnection()
            mockConnection.run.mockResolvedValue(undefined)

            await projectIndexer.clearIndex()

            expect(mockConnection.run).toHaveBeenCalledWith('DELETE FROM symbols')
            expect(mockConnection.run).toHaveBeenCalledWith('DELETE FROM dependencies')
            expect(mockConnection.run).toHaveBeenCalledWith('DELETE FROM metrics')
            expect(mockConnection.run).toHaveBeenCalledWith('DELETE FROM files')
            expect(mockConnection.run).toHaveBeenCalledWith('DELETE FROM todos')
            expect(mockConnection.run).toHaveBeenCalledWith('DELETE FROM analysis_cache')
            expect(logInfo).toHaveBeenCalledWith('Index cleared successfully')
        })

        it('should handle clear index errors', async () => {
            const mockConnection = mockDuckDBManager.getConnection()
            mockConnection.run.mockRejectedValue(new Error('Delete failed'))

            await expect(projectIndexer.clearIndex()).rejects.toThrow('Delete failed')
        })
    })

    describe('Performance and Error Handling', () => {
        it('should handle file processing timeouts', async () => {
            mockFileProcessor.processFile.mockImplementation(
                () => new Promise(resolve => setTimeout(() => resolve({
                    fileInfo: {},
                    processed: false,
                    skipped: true,
                    error: 'Timeout',
                    checksumChanged: false,
                    processingTime: 0
                }), 100))
            )

            const filePaths = ['/test/project/large.ts']
            const results = await (projectIndexer as any).processFiles(filePaths, {}, undefined)

            expect(results[0].processed).toBe(false)
            expect(results[0].error).toBe('Timeout')
        })

        it('should validate file paths and permissions', async () => {
            const mockFs = vi.mocked(fs)
            mockFs.readdir.mockRejectedValue(new Error('Permission denied'))

            const files = await (projectIndexer as any).discoverFiles({})

            expect(files).toEqual([])
            expect(logError).toHaveBeenCalledWith('Failed to read directory', expect.any(Object))
        })

        it('should handle concurrent file processing', async () => {
            const filePaths = Array.from({ length: 20 }, (_, i) => `/test/project/file${i}.ts`)
            const startTime = Date.now()

            const results = await (projectIndexer as any).processFiles(filePaths, { maxConcurrency: 5 }, undefined)

            const endTime = Date.now()
            const duration = endTime - startTime

            expect(results).toHaveLength(20)
            expect(duration).toBeLessThan(1000) // Should complete within reasonable time
        })

        it('should provide detailed error reporting', async () => {
            mockFileProcessor.processFile.mockRejectedValue(new Error('Disk full'))

            const result = await projectIndexer.indexProject()

            expect(result.success).toBe(false)
            expect(result.errors).toContain('Indexing failed: Disk full')
            expect(result.errorFiles).toBeGreaterThan(0)
        })
    })
})</content>},{