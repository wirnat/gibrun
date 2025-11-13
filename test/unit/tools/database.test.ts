import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DATABASE_TOOLS, handlePostgresQuery } from '../../../src/tools/database/index.js'
import { DatabaseService } from '../../../src/services/database-service.js'

// Mock DatabaseService
vi.mock('../../../src/services/database-service.js', () => ({
    DatabaseService: vi.fn().mockImplementation(function() {
        return {
            executeQuery: vi.fn()
        }
    })
}))

describe('Database Tools', () => {
    let mockDatabaseService: any

    beforeEach(() => {
        vi.clearAllMocks()
        mockDatabaseService = new DatabaseService()
    })

    describe('DATABASE_TOOLS', () => {
        it('should export DATABASE_TOOLS array with correct structure', () => {
            expect(DATABASE_TOOLS).toBeInstanceOf(Array)
            expect(DATABASE_TOOLS).toHaveLength(1)

            const queryTool = DATABASE_TOOLS[0]
            expect(queryTool.name).toBe('postgres_query')
            expect(queryTool.description).toContain('Execute a PostgreSQL query')
            expect(queryTool.inputSchema.type).toBe('object')
            expect(queryTool.inputSchema.properties).toHaveProperty('connection_string')
            expect(queryTool.inputSchema.properties).toHaveProperty('query')
            expect(queryTool.inputSchema.properties).toHaveProperty('params')
            expect(queryTool.inputSchema.required).toEqual(['query'])
        })

        it('should have proper parameter descriptions', () => {
            const queryTool = DATABASE_TOOLS[0]
            const props = queryTool.inputSchema.properties as any

            expect(props.connection_string.description).toContain('PostgreSQL connection string')
            expect(props.query.description).toContain('SQL query to execute')
            expect(props.params.description).toContain('Optional query parameters')
        })
    })

    describe('handlePostgresQuery', () => {
        it('should handle successful query execution', async () => {
            const mockResult = {
                success: true,
                rowCount: 2,
                rows: [
                    { id: 1, name: 'John Doe', email: 'john@example.com' },
                    { id: 2, name: 'Jane Smith', email: 'jane@example.com' }
                ],
                fields: [
                    { name: 'id', dataTypeID: 23 },
                    { name: 'name', dataTypeID: 25 },
                    { name: 'email', dataTypeID: 25 }
                ]
            }

            mockDatabaseService.executeQuery.mockResolvedValue(mockResult)

            const result = await handlePostgresQuery(mockDatabaseService, {
                query: 'SELECT id, name, email FROM users WHERE active = $1',
                params: ['true']
            })

            expect(mockDatabaseService.executeQuery).toHaveBeenCalledWith(
                undefined, // connection_string not provided
                'SELECT id, name, email FROM users WHERE active = $1',
                ['true']
            )

            expect(result.content).toHaveLength(1)
            expect(result.content[0].type).toBe('text')

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent).toEqual(mockResult)
            expect(result.isError).toBe(false)
        })

        it('should handle query with custom connection string', async () => {
            const mockResult = {
                success: true,
                rowCount: 1,
                rows: [{ count: 42 }],
                fields: [{ name: 'count', dataTypeID: 20 }]
            }

            mockDatabaseService.executeQuery.mockResolvedValue(mockResult)

            const customConnection = 'postgresql://user:pass@host:5432/db'
            const result = await handlePostgresQuery(mockDatabaseService, {
                connection_string: customConnection,
                query: 'SELECT COUNT(*) as count FROM users'
            })

            expect(mockDatabaseService.executeQuery).toHaveBeenCalledWith(
                customConnection,
                'SELECT COUNT(*) as count FROM users',
                [] // empty params array
            )
        })

        it('should handle query errors', async () => {
            const mockResult = {
                success: false,
                error: 'relation "nonexistent_table" does not exist'
            }

            mockDatabaseService.executeQuery.mockResolvedValue(mockResult)

            const result = await handlePostgresQuery(mockDatabaseService, {
                query: 'SELECT * FROM nonexistent_table'
            })

            expect(result.content).toHaveLength(1)
            expect(result.content[0].type).toBe('text')

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent).toEqual(mockResult)
            expect(result.isError).toBe(true)
        })

        it('should handle database service exceptions', async () => {
            const testError = new Error('Connection timeout')
            mockDatabaseService.executeQuery.mockRejectedValue(testError)

            await expect(handlePostgresQuery(mockDatabaseService, {
                query: 'SELECT 1'
            })).rejects.toThrow('Connection timeout')
        })

        it('should handle empty params array gracefully', async () => {
            const mockResult = {
                success: true,
                rowCount: 0,
                rows: [],
                fields: []
            }

            mockDatabaseService.executeQuery.mockResolvedValue(mockResult)

            const result = await handlePostgresQuery(mockDatabaseService, {
                query: 'SELECT * FROM empty_table'
            })

            expect(mockDatabaseService.executeQuery).toHaveBeenCalledWith(
                undefined,
                'SELECT * FROM empty_table',
                [] // default empty array
            )
        })

        it('should handle SELECT queries returning no rows', async () => {
            const mockResult = {
                success: true,
                rowCount: 0,
                rows: [],
                fields: [
                    { name: 'id', dataTypeID: 23 },
                    { name: 'name', dataTypeID: 25 }
                ]
            }

            mockDatabaseService.executeQuery.mockResolvedValue(mockResult)

            const result = await handlePostgresQuery(mockDatabaseService, {
                query: 'SELECT id, name FROM users WHERE false'
            })

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.success).toBe(true)
            expect(parsedContent.rowCount).toBe(0)
            expect(parsedContent.rows).toEqual([])
            expect(result.isError).toBe(false)
        })

        it('should handle INSERT/UPDATE/DELETE queries', async () => {
            const mockResult = {
                success: true,
                rowCount: 3,
                rows: [],
                fields: []
            }

            mockDatabaseService.executeQuery.mockResolvedValue(mockResult)

            const result = await handlePostgresQuery(mockDatabaseService, {
                query: 'UPDATE users SET last_login = NOW() WHERE id IN ($1, $2, $3)',
                params: ['1', '2', '3']
            })

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.success).toBe(true)
            expect(parsedContent.rowCount).toBe(3)
            expect(parsedContent.rows).toEqual([])
        })
    })
})