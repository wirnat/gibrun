import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    PROJECT_FILE_MANAGER_TOOLS,
    handleProjectFileManager
} from '../../../src/tools/file-system/index.js'
import { readdir, stat, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join, relative, resolve } from 'path'

// Mock fs/promises
vi.mock('fs/promises', () => ({
    readdir: vi.fn(),
    stat: vi.fn(),
    readFile: vi.fn(),
    mkdir: vi.fn(),
    copyFile: vi.fn()
}))

// Mock fs
vi.mock('fs', () => ({
    existsSync: vi.fn()
}))

// Mock path
vi.mock('path', () => ({
    join: vi.fn(),
    relative: vi.fn(),
    resolve: vi.fn(),
    dirname: vi.fn(),
    basename: vi.fn(),
    extname: vi.fn()
}))

// Mock logger service
vi.mock('../../../src/services/logger-service.js', () => ({
    logError: vi.fn()
}))

describe('Project File Manager', () => {
    beforeEach(() => {
        vi.clearAllMocks()

        // Setup default mocks
        const mockReaddir = vi.mocked(readdir)
        const mockStat = vi.mocked(stat)
        const mockReadFile = vi.mocked(readFile)
        const mockExistsSync = vi.mocked(existsSync)
        const mockJoin = vi.mocked(join)
        const mockRelative = vi.mocked(relative)
        const mockResolve = vi.mocked(resolve)

        // Default mock implementations
        mockExistsSync.mockReturnValue(true)
        mockReaddir.mockResolvedValue([])
        mockStat.mockResolvedValue({
            size: 100,
            mtime: new Date(),
            isFile: () => true,
            isDirectory: () => false
        } as any)
        mockReadFile.mockResolvedValue('file content')
        mockJoin.mockImplementation((...args) => args.join('/'))
        mockRelative.mockImplementation((from, to) => to)
        mockResolve.mockImplementation((...args) => args.join('/'))
    })

    describe('PROJECT_FILE_MANAGER_TOOLS', () => {
        it('should export PROJECT_FILE_MANAGER_TOOLS with correct structure', () => {
            expect(PROJECT_FILE_MANAGER_TOOLS).toBeInstanceOf(Array)
            expect(PROJECT_FILE_MANAGER_TOOLS).toHaveLength(1)

            const [tool] = PROJECT_FILE_MANAGER_TOOLS

            expect(tool.name).toBe('project_file_manager')
            expect(tool.description).toContain('project file management')
            expect(tool.inputSchema.type).toBe('object')
        })

        it('should have proper parameter schemas', () => {
            const [tool] = PROJECT_FILE_MANAGER_TOOLS
            const props = tool.inputSchema.properties as any

            expect(props.operation.enum).toEqual(['analyze', 'organize', 'sync', 'search', 'dependencies', 'structure'])
            expect(props.analyze).toBeDefined()
            expect(props.organize).toBeDefined()
            expect(props.sync).toBeDefined()
            expect(props.search).toBeDefined()
            expect(props.dependencies).toBeDefined()
            expect(props.required).toEqual(['operation'])
        })
    })

    describe('handleProjectFileManager - analyze operation', () => {
        it('should analyze project structure successfully', async () => {
            const mockReaddir = vi.mocked(readdir)
            const mockStat = vi.mocked(stat)

            // Mock file system structure
            mockReaddir.mockResolvedValue([
                { name: 'core', isDirectory: () => true, isFile: () => false },
                { name: 'services', isDirectory: () => true, isFile: () => false },
                { name: 'server.ts', isDirectory: () => false, isFile: () => true }
            ] as any)

            mockStat.mockResolvedValue({
                size: 1000,
                mtime: new Date(),
                isFile: () => true,
                isDirectory: () => false
            } as any)

            const result = await handleProjectFileManager({
                operation: 'analyze',
                analyze: {
                    analysis_type: 'structure',
                    include_patterns: ['src/**']
                }
            })

            expect(result.content).toHaveLength(1)
            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.analysis_type).toBe('structure')
            expect(parsedContent).toHaveProperty('total_files')
            expect(parsedContent).toHaveProperty('directories')
            expect(parsedContent).toHaveProperty('file_types')
        })

        it('should analyze dependencies correctly', async () => {
            const mockReadFile = vi.mocked(readFile)

            mockReadFile.mockResolvedValue(`
                import { User } from './user'
                import express from 'express'
                import { validate } from '../utils/validation'
            `)

            const result = await handleProjectFileManager({
                operation: 'analyze',
                analyze: {
                    analysis_type: 'dependencies',
                    include_patterns: ['src/**/*.ts']
                }
            })

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.analysis_type).toBe('dependencies')
            expect(parsedContent).toHaveProperty('total_files')
        })

        it('should find duplicate files', async () => {
            const mockStat = vi.mocked(stat)

            mockStat.mockResolvedValue({
                size: 100,
                mtime: new Date(),
                isFile: () => true,
                isDirectory: () => false
            } as any)

            const result = await handleProjectFileManager({
                operation: 'analyze',
                analyze: {
                    analysis_type: 'duplicates',
                    include_patterns: ['src/**']
                }
            })

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.analysis_type).toBe('duplicates')
            expect(parsedContent).toHaveProperty('duplicate_groups')
        })

        it('should identify unused files', async () => {
            const result = await handleProjectFileManager({
                operation: 'analyze',
                analyze: {
                    analysis_type: 'unused',
                    include_patterns: ['src/**']
                }
            })

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.analysis_type).toBe('unused')
            expect(parsedContent).toHaveProperty('potentially_unused_files')
        })

        it('should analyze code complexity', async () => {
            const mockReadFile = vi.mocked(readFile)

            mockReadFile.mockResolvedValue(`
                function complexFunction(a, b, c) {
                    if (a > 0) {
                        for (let i = 0; i < b; i++) {
                            if (c[i] > 0) {
                                return c[i] * 2;
                            }
                        }
                    }
                    return 0;
                }
            `)

            const result = await handleProjectFileManager({
                operation: 'analyze',
                analyze: {
                    analysis_type: 'complexity',
                    include_patterns: ['src/**/*.ts']
                }
            })

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.analysis_type).toBe('complexity')
            expect(parsedContent).toHaveProperty('average_complexity')
            expect(parsedContent).toHaveProperty('files_by_complexity')
        })
    })

    describe('handleProjectFileManager - organize operation', () => {
        it('should organize files by type', async () => {
            const result = await handleProjectFileManager({
                operation: 'organize',
                organize: {
                    organization_type: 'by_type',
                    target_directory: 'organized/',
                    create_folders: true
                }
            })

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.organization_type).toBe('by_type')
            expect(parsedContent).toHaveProperty('plan')
            expect(parsedContent).toHaveProperty('folders_created')
        })

        it('should organize files alphabetically', async () => {
            const result = await handleProjectFileManager({
                operation: 'organize',
                organize: {
                    organization_type: 'alphabetical',
                    target_directory: 'sorted/',
                    create_folders: false
                }
            })

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.organization_type).toBe('alphabetical')
            expect(parsedContent.folders_created).toBe(false)
        })
    })

    describe('handleProjectFileManager - sync operation', () => {
        it('should generate sync plan for mirror mode', async () => {
            const result = await handleProjectFileManager({
                operation: 'sync',
                sync: {
                    source_directory: 'src/',
                    target_directory: 'backup/',
                    sync_mode: 'mirror',
                    exclude_patterns: ['*.tmp']
                }
            })

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.sync_mode).toBe('mirror')
            expect(parsedContent).toHaveProperty('plan')
            expect(parsedContent.plan).toHaveProperty('to_copy')
            expect(parsedContent.plan).toHaveProperty('to_update')
            expect(parsedContent.plan).toHaveProperty('to_delete')
        })

        it('should handle different sync modes', async () => {
            const result = await handleProjectFileManager({
                operation: 'sync',
                sync: {
                    source_directory: 'src/',
                    target_directory: 'deploy/',
                    sync_mode: 'update'
                }
            })

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.sync_mode).toBe('update')
        })
    })

    describe('handleProjectFileManager - search operation', () => {
        it('should search content across files', async () => {
            const mockReadFile = vi.mocked(readFile)

            mockReadFile.mockResolvedValue(`
                console.log('Hello World')
                const user = getUser()
                console.error('Error occurred')
            `)

            const result = await handleProjectFileManager({
                operation: 'search',
                search: {
                    query: 'console\\.log',
                    search_in: ['content'],
                    file_types: ['typescript'],
                    use_regex: true
                }
            })

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.operation).toBe('search')
            expect(parsedContent).toHaveProperty('total_matches')
            expect(parsedContent).toHaveProperty('files_with_matches')
            expect(parsedContent).toHaveProperty('results')
        })

        it('should search filenames', async () => {
            const result = await handleProjectFileManager({
                operation: 'search',
                search: {
                    query: 'test',
                    search_in: ['filename'],
                    case_sensitive: false
                }
            })

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.search_in).toContain('filename')
        })

        it('should handle regex search', async () => {
            const result = await handleProjectFileManager({
                operation: 'search',
                search: {
                    query: '\\.test\\.',
                    search_in: ['filename'],
                    use_regex: true
                }
            })

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.query).toBe('\\.test\\.')
        })
    })

    describe('handleProjectFileManager - dependencies operation', () => {
        it('should analyze imports for TypeScript', async () => {
            const mockReadFile = vi.mocked(readFile)

            mockReadFile.mockResolvedValue(`
                import { User } from './models/user'
                import express from 'express'
                import { validateInput } from '../utils/validation'
                import fs from 'fs'
            `)

            const result = await handleProjectFileManager({
                operation: 'dependencies',
                dependencies: {
                    analysis_type: 'imports',
                    language: 'typescript'
                }
            })

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.analysis_type).toBe('imports')
            expect(parsedContent.language).toBe('typescript')
            expect(parsedContent).toHaveProperty('total_imports')
            expect(parsedContent).toHaveProperty('by_module')
            expect(parsedContent).toHaveProperty('external_dependencies')
            expect(parsedContent).toHaveProperty('internal_dependencies')
        })

        it('should analyze exports', async () => {
            const mockReadFile = vi.mocked(readFile)

            mockReadFile.mockResolvedValue(`
                export const userService = {}
                export default userService
                export { validateUser } from './validation'
            `)

            const result = await handleProjectFileManager({
                operation: 'dependencies',
                dependencies: {
                    analysis_type: 'exports',
                    language: 'typescript'
                }
            })

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.analysis_type).toBe('exports')
            expect(parsedContent.by_type).toHaveProperty('named')
            expect(parsedContent.by_type).toHaveProperty('default')
        })

        it('should detect circular dependencies', async () => {
            const result = await handleProjectFileManager({
                operation: 'dependencies',
                dependencies: {
                    analysis_type: 'circular',
                    language: 'typescript'
                }
            })

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.analysis_type).toBe('circular')
            expect(parsedContent).toHaveProperty('circular_dependencies')
            expect(parsedContent).toHaveProperty('total_circular_groups')
        })

        it('should find unused imports', async () => {
            const mockReadFile = vi.mocked(readFile)

            mockReadFile.mockResolvedValue(`
                import { User } from './models/user'
                import express from 'express'
                // User and express are not used in the code
                const data = 'no imports used'
            `)

            const result = await handleProjectFileManager({
                operation: 'dependencies',
                dependencies: {
                    analysis_type: 'unused',
                    language: 'typescript'
                }
            })

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.analysis_type).toBe('unused_imports')
            expect(parsedContent).toHaveProperty('potentially_unused')
        })
    })

    describe('handleProjectFileManager - error handling', () => {
        it('should handle invalid operation', async () => {
            const result = await handleProjectFileManager({
                operation: 'invalid_operation'
            })

            expect(result.isError).toBe(true)
            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.success).toBe(false)
            expect(parsedContent.error).toContain('Unknown operation')
        })

        it('should handle file system errors', async () => {
            const mockReaddir = vi.mocked(readdir)
            mockReaddir.mockRejectedValue(new Error('Permission denied'))

            const result = await handleProjectFileManager({
                operation: 'analyze',
                analyze: {
                    analysis_type: 'structure'
                }
            })

            expect(result.isError).toBe(true)
            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.success).toBe(false)
            expect(parsedContent.error).toContain('Permission denied')
        })

        it('should handle invalid analysis type', async () => {
            const result = await handleProjectFileManager({
                operation: 'analyze',
                analyze: {
                    analysis_type: 'invalid_type'
                }
            })

            expect(result.isError).toBe(true)
            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.error).toContain('Unknown analysis type')
        })
    })

    describe('handleProjectFileManager - structure operation', () => {
        it('should provide project structure overview', async () => {
            const result = await handleProjectFileManager({
                operation: 'structure'
            })

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent).toHaveProperty('total_files')
            expect(parsedContent).toHaveProperty('directories')
            expect(parsedContent).toHaveProperty('file_types')
            expect(parsedContent).toHaveProperty('total_size')
        })
    })
})