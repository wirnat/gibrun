import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SymbolSearchEngine, SymbolSearchQuery, SymbolResult, ReferenceResult, CrossReferenceResult } from '../../src/core/symbol-search-engine.js'
import { DuckDBManager } from '../../src/core/duckdb-manager.js'
import { logInfo, logError } from '../../src/services/logger-service.js'

// Mock all dependencies
vi.mock('../../src/core/duckdb-manager.js', () => ({
    DuckDBManager: vi.fn().mockImplementation(() => ({
        getConnection: vi.fn().mockReturnValue({
            run: vi.fn(),
            all: vi.fn(),
            close: vi.fn()
        })
    }))
}))

vi.mock('../../src/services/logger-service.js', () => ({
    logInfo: vi.fn(),
    logError: vi.fn()
}))

describe('Query Engine', () => {
    let symbolSearchEngine: SymbolSearchEngine
    let mockDuckDBManager: any
    let mockConnection: any

    beforeEach(() => {
        vi.clearAllMocks()

        mockConnection = {
            run: vi.fn().mockResolvedValue(undefined),
            all: vi.fn().mockResolvedValue([]),
            close: vi.fn().mockResolvedValue(undefined)
        }

        mockDuckDBManager = {
            getConnection: vi.fn().mockReturnValue(mockConnection)
        }

        const MockDuckDBManager = vi.mocked(DuckDBManager)
        MockDuckDBManager.mockReturnValue(mockDuckDBManager)

        symbolSearchEngine = new SymbolSearchEngine(mockDuckDBManager)
    })

    afterEach(() => {
        // Cleanup
    })

    describe('Symbol Search', () => {
        const mockSymbolResults: SymbolResult[] = [
            {
                id: 'symbol-1',
                name: 'UserService',
                type: 'class',
                file_path: '/src/services/user.service.ts',
                line_number: 10,
                signature: 'export class UserService {}',
                visibility: 'public',
                complexity: 5,
                language: 'typescript',
                metadata: { implements: ['IUserService'] },
                last_modified: new Date('2024-01-01'),
                file_lines: 150
            },
            {
                id: 'symbol-2',
                name: 'getUser',
                type: 'function',
                file_path: '/src/services/user.service.ts',
                line_number: 25,
                signature: 'getUser(id: string): Promise<User>',
                visibility: 'public',
                complexity: 3,
                language: 'typescript',
                metadata: { async: true },
                last_modified: new Date('2024-01-01'),
                file_lines: 150
            }
        ]

        beforeEach(() => {
            mockConnection.all.mockResolvedValue(mockSymbolResults.map(result => ({
                id: result.id,
                name: result.name,
                type: result.type,
                file_path: result.file_path,
                line_number: result.line_number,
                signature: result.signature,
                visibility: result.visibility,
                complexity: result.complexity,
                language: result.language,
                metadata: JSON.stringify(result.metadata),
                last_modified: result.last_modified.toISOString(),
                lines_count: result.file_lines
            })))
        })

        it('should search symbols by name', async () => {
            const query: SymbolSearchQuery = {
                searchTerm: 'User',
                limit: 10
            }

            const results = await symbolSearchEngine.searchSymbols(query)

            expect(mockConnection.all).toHaveBeenCalledWith(
                expect.stringContaining('SELECT'),
                expect.arrayContaining(['%User%', 10])
            )
            expect(results).toHaveLength(2)
            expect(results[0].name).toBe('UserService')
            expect(results[1].name).toBe('getUser')
            expect(logInfo).toHaveBeenCalledWith(
                'Symbol search completed',
                expect.objectContaining({
                    query: 'User',
                    resultsCount: 2
                })
            )
        })

        it('should filter symbols by type', async () => {
            mockConnection.all.mockResolvedValue([mockSymbolResults[0]].map(result => ({
                id: result.id,
                name: result.name,
                type: result.type,
                file_path: result.file_path,
                line_number: result.line_number,
                signature: result.signature,
                visibility: result.visibility,
                complexity: result.complexity,
                language: result.language,
                metadata: JSON.stringify(result.metadata),
                last_modified: result.last_modified.toISOString(),
                lines_count: result.file_lines
            })))

            const query: SymbolSearchQuery = {
                type: 'class',
                limit: 10
            }

            const results = await symbolSearchEngine.searchSymbols(query)

            expect(mockConnection.all).toHaveBeenCalledWith(
                expect.stringContaining('type = ?'),
                expect.arrayContaining(['class', 10])
            )
            expect(results).toHaveLength(1)
            expect(results[0].type).toBe('class')
        })

        it('should filter symbols by language', async () => {
            const query: SymbolSearchQuery = {
                language: 'typescript',
                limit: 10
            }

            const results = await symbolSearchEngine.searchSymbols(query)

            expect(mockConnection.all).toHaveBeenCalledWith(
                expect.stringContaining('language = ?'),
                expect.arrayContaining(['typescript', 10])
            )
            expect(results.every(r => r.language === 'typescript')).toBe(true)
        })

        it('should filter symbols by file path', async () => {
            const query: SymbolSearchQuery = {
                filePath: '/src/services/user.service.ts',
                limit: 10
            }

            const results = await symbolSearchEngine.searchSymbols(query)

            expect(mockConnection.all).toHaveBeenCalledWith(
                expect.stringContaining('file_path = ?'),
                expect.arrayContaining(['/src/services/user.service.ts', 10])
            )
            expect(results.every(r => r.file_path === '/src/services/user.service.ts')).toBe(true)
        })

        it('should filter symbols by minimum complexity', async () => {
            const query: SymbolSearchQuery = {
                minComplexity: 4,
                limit: 10
            }

            const results = await symbolSearchEngine.searchSymbols(query)

            expect(mockConnection.all).toHaveBeenCalledWith(
                expect.stringContaining('complexity >= ?'),
                expect.arrayContaining([4, 10])
            )
            expect(results.every(r => r.complexity! >= 4)).toBe(true)
        })

        it('should support sorting options', async () => {
            const query: SymbolSearchQuery = {
                sortBy: 'complexity',
                sortOrder: 'desc',
                limit: 10
            }

            const results = await symbolSearchEngine.searchSymbols(query)

            expect(mockConnection.all).toHaveBeenCalledWith(
                expect.stringContaining('ORDER BY s.complexity desc'),
                expect.arrayContaining([10])
            )
        })

        it('should handle empty results', async () => {
            mockConnection.all.mockResolvedValue([])

            const query: SymbolSearchQuery = {
                searchTerm: 'nonexistent',
                limit: 10
            }

            const results = await symbolSearchEngine.searchSymbols(query)

            expect(results).toEqual([])
            expect(logInfo).toHaveBeenCalledWith(
                'Symbol search completed',
                expect.objectContaining({
                    query: 'nonexistent',
                    resultsCount: 0
                })
            )
        })

        it('should handle search errors', async () => {
            mockConnection.all.mockRejectedValue(new Error('Database query failed'))

            const query: SymbolSearchQuery = {
                searchTerm: 'test',
                limit: 10
            }

            await expect(symbolSearchEngine.searchSymbols(query)).rejects.toThrow('Symbol search failed: Database query failed')
            expect(logError).toHaveBeenCalled()
        })
    })

    describe('Reference Finding', () => {
        const mockDefinitionResults: ReferenceResult[] = [
            {
                type: 'definition',
                file_path: '/src/services/user.service.ts',
                line_number: 10,
                signature: 'export class UserService {}',
                language: 'typescript'
            }
        ]

        const mockUsageResults: ReferenceResult[] = [
            {
                type: 'usage',
                file_path: '/src/controllers/user.controller.ts',
                line_number: 25,
                signature: 'new UserService()',
                language: 'typescript'
            },
            {
                type: 'usage',
                file_path: '/src/routes/user.routes.ts',
                line_number: 15,
                signature: 'UserService.getUser',
                language: 'typescript'
            }
        ]

        beforeEach(() => {
            mockConnection.all
                .mockResolvedValueOnce(mockDefinitionResults.map(r => ({
                    reference_type: r.type,
                    file_path: r.file_path,
                    line_number: r.line_number,
                    signature: r.signature,
                    language: r.language
                })))
                .mockResolvedValueOnce(mockUsageResults.map(r => ({
                    reference_type: r.type,
                    file_path: r.file_path,
                    line_number: r.line_number,
                    signature: r.signature,
                    language: r.language
                })))
        })

        it('should find all references to a symbol', async () => {
            const symbolName = 'UserService'
            const references = await symbolSearchEngine.findReferences(symbolName)

            expect(mockConnection.all).toHaveBeenCalledTimes(2)
            expect(mockConnection.all).toHaveBeenCalledWith(
                expect.stringContaining('SELECT'),
                [symbolName, symbolName]
            )
            expect(references).toHaveLength(3)
            expect(references.filter(r => r.type === 'definition')).toHaveLength(1)
            expect(references.filter(r => r.type === 'usage')).toHaveLength(2)
            expect(logInfo).toHaveBeenCalledWith(
                'Reference search completed',
                expect.objectContaining({
                    symbolName,
                    resultsCount: 3
                })
            )
        })

        it('should filter references by file path', async () => {
            const symbolName = 'UserService'
            const filePath = '/src/controllers/user.controller.ts'

            await symbolSearchEngine.findReferences(symbolName, filePath)

            expect(mockConnection.all).toHaveBeenCalledWith(
                expect.stringContaining('file_path = ?'),
                expect.arrayContaining([symbolName, filePath, filePath])
            )
        })

        it('should handle reference search errors', async () => {
            mockConnection.all.mockRejectedValue(new Error('Reference query failed'))

            const symbolName = 'UserService'

            await expect(symbolSearchEngine.findReferences(symbolName)).rejects.toThrow('Reference search failed: Reference query failed')
            expect(logError).toHaveBeenCalled()
        })
    })

    describe('Cross References', () => {
        const mockCrossReferences: CrossReferenceResult = {
            symbol_name: 'UserService',
            definitions: [
                {
                    type: 'definition',
                    file_path: '/src/services/user.service.ts',
                    line_number: 10,
                    signature: 'export class UserService {}',
                    language: 'typescript'
                }
            ],
            usages: [
                {
                    type: 'usage',
                    file_path: '/src/controllers/user.controller.ts',
                    line_number: 25,
                    signature: 'new UserService()',
                    language: 'typescript'
                }
            ],
            total_references: 2
        }

        beforeEach(() => {
            mockConnection.all
                .mockResolvedValueOnce(mockCrossReferences.definitions.map(r => ({
                    reference_type: r.type,
                    file_path: r.file_path,
                    line_number: r.line_number,
                    signature: r.signature,
                    language: r.language
                })))
                .mockResolvedValueOnce(mockCrossReferences.usages.map(r => ({
                    reference_type: r.type,
                    file_path: r.file_path,
                    line_number: r.line_number,
                    signature: r.signature,
                    language: r.language
                })))
        })

        it('should get comprehensive cross-references', async () => {
            const symbolName = 'UserService'
            const result = await symbolSearchEngine.getCrossReferences(symbolName)

            expect(result.symbol_name).toBe(symbolName)
            expect(result.definitions).toHaveLength(1)
            expect(result.usages).toHaveLength(1)
            expect(result.total_references).toBe(2)
        })
    })

    describe('Symbol Type Queries', () => {
        it('should find symbols by type and language', async () => {
            const mockResults = [
                {
                    id: 'class-1',
                    name: 'UserService',
                    type: 'class',
                    file_path: '/src/services/user.service.ts',
                    line_number: 10,
                    signature: 'export class UserService {}',
                    visibility: 'public',
                    complexity: 5,
                    language: 'typescript',
                    metadata: null,
                    last_modified: new Date().toISOString(),
                    lines_count: 150
                }
            ]

            mockConnection.all.mockResolvedValue(mockResults)

            const results = await symbolSearchEngine.findSymbolsByType('class', 'typescript', 100)

            expect(mockConnection.all).toHaveBeenCalledWith(
                expect.stringContaining('type = ?'),
                expect.arrayContaining(['class', 'typescript', 100])
            )
            expect(results).toHaveLength(1)
            expect(results[0].type).toBe('class')
            expect(results[0].language).toBe('typescript')
        })

        it('should find complex symbols', async () => {
            const mockResults = [
                {
                    id: 'complex-1',
                    name: 'ComplexFunction',
                    type: 'function',
                    file_path: '/src/utils/complex.ts',
                    line_number: 1,
                    signature: 'function ComplexFunction() {}',
                    visibility: 'public',
                    complexity: 15,
                    language: 'typescript',
                    metadata: null,
                    last_modified: new Date().toISOString(),
                    lines_count: 200
                }
            ]

            mockConnection.all.mockResolvedValue(mockResults)

            const results = await symbolSearchEngine.findComplexSymbols(10, 'typescript', 50)

            expect(mockConnection.all).toHaveBeenCalledWith(
                expect.stringContaining('complexity >= ?'),
                expect.arrayContaining([10, 'typescript', 50])
            )
            expect(results).toHaveLength(1)
            expect(results[0].complexity).toBeGreaterThanOrEqual(10)
        })
    })

    describe('File-specific Queries', () => {
        it('should search symbols in specific file', async () => {
            const filePath = '/src/services/user.service.ts'
            const searchTerm = 'get'

            const mockResults = [
                {
                    id: 'func-1',
                    name: 'getUser',
                    type: 'function',
                    file_path: filePath,
                    line_number: 25,
                    signature: 'getUser(id: string): Promise<User>',
                    visibility: 'public',
                    complexity: 3,
                    language: 'typescript',
                    metadata: null,
                    last_modified: new Date().toISOString(),
                    lines_count: 150
                }
            ]

            mockConnection.all.mockResolvedValue(mockResults)

            const results = await symbolSearchEngine.searchInFile(filePath, searchTerm)

            expect(mockConnection.all).toHaveBeenCalledWith(
                expect.stringContaining('file_path = ?'),
                expect.arrayContaining([filePath, `%${searchTerm}%`])
            )
            expect(results).toHaveLength(1)
            expect(results[0].file_path).toBe(filePath)
            expect(results[0].name).toContain(searchTerm)
        })

        it('should search all symbols in file when no search term', async () => {
            const filePath = '/src/services/user.service.ts'

            await symbolSearchEngine.searchInFile(filePath)

            expect(mockConnection.all).toHaveBeenCalledWith(
                expect.stringContaining('file_path = ?'),
                expect.arrayContaining([filePath, undefined])
            )
        })
    })

    describe('Statistics and Analytics', () => {
        it('should get symbol statistics', async () => {
            const mockStats = {
                total_symbols: 150,
                by_type: { class: 20, function: 80, interface: 15, variable: 35 },
                by_language: { typescript: 120, javascript: 30 },
                avg_complexity: 4.2,
                max_complexity: 25
            }

            mockConnection.all
                .mockResolvedValueOnce([{ total_symbols: mockStats.total_symbols, avg_complexity: mockStats.avg_complexity, max_complexity: mockStats.max_complexity }])
                .mockResolvedValueOnce([
                    { type: 'class', count: mockStats.by_type.class },
                    { type: 'function', count: mockStats.by_type.function },
                    { type: 'interface', count: mockStats.by_type.interface },
                    { type: 'variable', count: mockStats.by_type.variable }
                ])
                .mockResolvedValueOnce([
                    { language: 'typescript', count: mockStats.by_language.typescript },
                    { language: 'javascript', count: mockStats.by_language.javascript }
                ])

            const stats = await symbolSearchEngine.getSymbolStatistics()

            expect(stats.total_symbols).toBe(mockStats.total_symbols)
            expect(stats.by_type).toEqual(mockStats.by_type)
            expect(stats.by_language).toEqual(mockStats.by_language)
            expect(stats.avg_complexity).toBe(mockStats.avg_complexity)
            expect(stats.max_complexity).toBe(mockStats.max_complexity)
        })

        it('should handle statistics query errors', async () => {
            mockConnection.all.mockRejectedValue(new Error('Statistics query failed'))

            await expect(symbolSearchEngine.getSymbolStatistics()).rejects.toThrow('Statistics query failed')
        })
    })

    describe('Performance and Error Handling', () => {
        it('should handle large result sets efficiently', async () => {
            const largeResultSet = Array.from({ length: 1000 }, (_, i) => ({
                id: `symbol-${i}`,
                name: `Symbol${i}`,
                type: 'function',
                file_path: `/src/file${Math.floor(i / 10)}.ts`,
                line_number: i % 100,
                signature: `function Symbol${i}() {}`,
                visibility: 'public',
                complexity: Math.floor(Math.random() * 10),
                language: 'typescript',
                metadata: null,
                last_modified: new Date().toISOString(),
                lines_count: 100
            }))

            mockConnection.all.mockResolvedValue(largeResultSet)

            const startTime = Date.now()
            const results = await symbolSearchEngine.searchSymbols({ limit: 1000 })
            const endTime = Date.now()

            expect(results).toHaveLength(1000)
            expect(endTime - startTime).toBeLessThan(1000) // Should complete within 1 second
        })

        it('should handle concurrent search operations', async () => {
            const queries = Array.from({ length: 5 }, (_, i) =>
                symbolSearchEngine.searchSymbols({
                    searchTerm: `query${i}`,
                    limit: 10
                })
            )

            const startTime = Date.now()
            const results = await Promise.all(queries)
            const endTime = Date.now()

            expect(results).toHaveLength(5)
            results.forEach(result => {
                expect(Array.isArray(result)).toBe(true)
            })
            expect(endTime - startTime).toBeLessThan(2000) // Should complete within 2 seconds
        })

        it('should validate query parameters', async () => {
            // Test with invalid parameters - should not throw but handle gracefully
            const results = await symbolSearchEngine.searchSymbols({
                searchTerm: '',
                type: '',
                language: '',
                limit: -1
            })

            expect(Array.isArray(results)).toBe(true)
        })

        it('should handle database connection errors', async () => {
            mockDuckDBManager.getConnection.mockImplementationOnce(() => {
                throw new Error('Connection pool exhausted')
            })

            await expect(symbolSearchEngine.searchSymbols({ searchTerm: 'test' })).rejects.toThrow('Connection pool exhausted')
        })

        it('should handle malformed query results', async () => {
            mockConnection.all.mockResolvedValue([
                {
                    id: 'malformed',
                    name: null, // Missing required field
                    type: 'function',
                    file_path: '/test.ts',
                    line_number: 1,
                    signature: 'test()',
                    visibility: 'public',
                    complexity: 1,
                    language: 'typescript',
                    metadata: 'invalid json', // Invalid JSON
                    last_modified: 'invalid date',
                    lines_count: 10
                }
            ])

            // Should handle gracefully without throwing
            const results = await symbolSearchEngine.searchSymbols({ limit: 10 })
            expect(results).toHaveLength(1)
        })

        it('should implement proper connection cleanup', async () => {
            await symbolSearchEngine.searchSymbols({ searchTerm: 'test' })

            expect(mockConnection.close).toHaveBeenCalled()
        })

        it('should handle timeout scenarios', async () => {
            mockConnection.all.mockImplementation(
                () => new Promise(resolve => setTimeout(() => resolve([]), 100))
            )

            const startTime = Date.now()
            const results = await symbolSearchEngine.searchSymbols({ searchTerm: 'slow' })
            const endTime = Date.now()

            expect(results).toEqual([])
            expect(endTime - startTime).toBeGreaterThanOrEqual(100)
        })
    })

    describe('Query Analytics', () => {
        it('should track query performance metrics', async () => {
            const query: SymbolSearchQuery = {
                searchTerm: 'performance',
                type: 'function',
                language: 'typescript',
                limit: 50
            }

            await symbolSearchEngine.searchSymbols(query)

            expect(logInfo).toHaveBeenCalledWith(
                'Symbol search completed',
                expect.objectContaining({
                    query: 'performance',
                    resultsCount: expect.any(Number),
                    filters: expect.objectContaining({
                        type: 'function',
                        language: 'typescript',
                        minComplexity: undefined
                    })
                })
            )
        })

        it('should provide query result summaries', async () => {
            const mockResults = Array.from({ length: 25 }, (_, i) => ({
                id: `result-${i}`,
                name: `Result${i}`,
                type: 'function',
                file_path: `/file${i % 5}.ts`,
                line_number: i * 10,
                signature: `function Result${i}() {}`,
                visibility: 'public',
                complexity: i % 10,
                language: 'typescript',
                metadata: null,
                last_modified: new Date().toISOString(),
                lines_count: 100
            }))

            mockConnection.all.mockResolvedValue(mockResults)

            const results = await symbolSearchEngine.searchSymbols({
                type: 'function',
                limit: 100
            })

            expect(results).toHaveLength(25)
            expect(results.every(r => r.type === 'function')).toBe(true)
            expect(results.every(r => r.language === 'typescript')).toBe(true)
        })

        it('should handle complex multi-criteria queries', async () => {
            const complexQuery: SymbolSearchQuery = {
                searchTerm: 'user',
                type: 'function',
                language: 'typescript',
                filePath: '/src/services/',
                minComplexity: 3,
                sortBy: 'complexity',
                sortOrder: 'desc',
                limit: 20
            }

            const mockResults = [
                {
                    id: 'complex-1',
                    name: 'getUserData',
                    type: 'function',
                    file_path: '/src/services/user.service.ts',
                    line_number: 50,
                    signature: 'async function getUserData(id: string)',
                    visibility: 'public',
                    complexity: 8,
                    language: 'typescript',
                    metadata: null,
                    last_modified: new Date().toISOString(),
                    lines_count: 200
                }
            ]

            mockConnection.all.mockResolvedValue(mockResults)

            const results = await symbolSearchEngine.searchSymbols(complexQuery)

            expect(mockConnection.all).toHaveBeenCalledWith(
                expect.stringContaining('name ILIKE ?'),
                expect.arrayContaining(['%user%', 'function', 'typescript', '/src/services/', 3, 20])
            )
            expect(results).toHaveLength(1)
            expect(results[0].complexity).toBeGreaterThanOrEqual(3)
        })
    })
})</content>},{