import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    MULTI_FILE_READER_TOOLS,
    handleMultiFileReader,
    MULTI_FILE_EDITOR_TOOLS,
    handleMultiFileEditor
} from '../../../src/tools/file-system/index.js'
import { readFile, writeFile, copyFile, stat, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join, dirname, basename } from 'path'

// Mock fs/promises
vi.mock('fs/promises', () => ({
    readFile: vi.fn(),
    writeFile: vi.fn(),
    copyFile: vi.fn(),
    stat: vi.fn(),
    readdir: vi.fn(),
    mkdir: vi.fn()
}))

// Mock fs
vi.mock('fs', () => ({
    existsSync: vi.fn()
}))

// Mock path
vi.mock('path', () => ({
    join: vi.fn(),
    dirname: vi.fn(),
    basename: vi.fn(),
    resolve: vi.fn(),
    extname: vi.fn(),
    relative: vi.fn()
}))

// Mock logger service
vi.mock('../../../src/services/logger-service.js', () => ({
    logError: vi.fn()
}))

// Mock validation
const mockValidateFileOperation = vi.fn()
const mockValidateBatchLimits = vi.fn()

vi.mock('../../../src/tools/file-system/validation.js', () => ({
    validateFileOperation: mockValidateFileOperation,
    validateBatchLimits: mockValidateBatchLimits
}))

describe('Multi-File Operations', () => {
    beforeEach(() => {
        vi.clearAllMocks()

        // Setup default mocks
        mockValidateFileOperation.mockResolvedValue({ valid: true })
        mockValidateBatchLimits.mockReturnValue({ valid: true })
    })

    describe('MULTI_FILE_READER_TOOLS', () => {
        it('should export MULTI_FILE_READER_TOOLS with correct structure', () => {
            expect(MULTI_FILE_READER_TOOLS).toBeInstanceOf(Array)
            expect(MULTI_FILE_READER_TOOLS).toHaveLength(1)

            const [readerTool] = MULTI_FILE_READER_TOOLS

            expect(readerTool.name).toBe('multi_file_reader')
            expect(readerTool.description).toContain('Read multiple files')
            expect(readerTool.inputSchema.type).toBe('object')
        })

        it('should have proper parameter schemas for multi_file_reader', () => {
            const [readerTool] = MULTI_FILE_READER_TOOLS
            const props = readerTool.inputSchema.properties as any

            expect(props.paths.type).toBe('array')
            expect(props.glob_patterns.type).toBe('array')
            expect(props.exclude_patterns.type).toBe('array')
            expect(props.file_types.type).toBe('array')
            expect(props.max_file_size.default).toBe(1048576) // 1MB
            expect(props.max_files.default).toBe(50)
            expect(props.include_content.default).toBe(true)
            expect(props.include_metadata.default).toBe(true)
            expect(props.recursive.default).toBe(true)
            expect(props.base_directory.default).toBe('.')
        })
    })

    describe('MULTI_FILE_EDITOR_TOOLS', () => {
        it('should export MULTI_FILE_EDITOR_TOOLS with correct structure', () => {
            expect(MULTI_FILE_EDITOR_TOOLS).toBeInstanceOf(Array)
            expect(MULTI_FILE_EDITOR_TOOLS).toHaveLength(1)

            const [editorTool] = MULTI_FILE_EDITOR_TOOLS

            expect(editorTool.name).toBe('multi_file_editor')
            expect(editorTool.description).toContain('batch editing operations')
            expect(editorTool.inputSchema.type).toBe('object')
        })

        it('should have proper parameter schemas for multi_file_editor', () => {
            const [editorTool] = MULTI_FILE_EDITOR_TOOLS
            const props = editorTool.inputSchema.properties as any

            expect(props.operation.enum).toEqual(['search_replace', 'insert', 'delete', 'transform', 'rename'])
            expect(props.target_files.type).toBe('object')
            expect(props.options.type).toBe('object')
            expect(props.required).toEqual(['operation', 'target_files'])
        })
    })

    describe('handleMultiFileReader', () => {
        it('should read multiple files successfully', async () => {
            const mockReadFile = vi.mocked(readFile)
            const mockStat = vi.mocked(stat)
            const mockExistsSync = vi.mocked(existsSync)

            // Mock file system
            mockExistsSync.mockReturnValue(true)
            mockStat.mockResolvedValue({
                size: 100,
                mtime: new Date('2024-01-15T10:30:00Z')
            } as any)
            mockReadFile.mockResolvedValue('file content')

            const result = await handleMultiFileReader({
                paths: ['file1.txt', 'file2.txt'],
                include_content: true,
                include_metadata: true
            })

            expect(result.content).toHaveLength(1)
            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.files).toBeInstanceOf(Array)
            expect(parsedContent.summary.total_files).toBe(2)
            expect(result.isError).toBeUndefined()
        })

        it('should handle glob patterns', async () => {
            const mockReadFile = vi.mocked(readFile)
            const mockStat = vi.mocked(stat)
            const mockExistsSync = vi.mocked(existsSync)

            mockExistsSync.mockReturnValue(true)
            mockStat.mockResolvedValue({
                size: 50,
                mtime: new Date()
            } as any)
            mockReadFile.mockResolvedValue('content')

            const result = await handleMultiFileReader({
                glob_patterns: ['src/**/*.ts'],
                max_files: 5
            })

            expect(result.content).toHaveLength(1)
            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.summary).toBeDefined()
        })

        it('should respect max_files limit', async () => {
            const result = await handleMultiFileReader({
                paths: ['file1.txt', 'file2.txt', 'file3.txt'],
                max_files: 2
            })

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.files.length).toBeLessThanOrEqual(2)
        })

        it('should handle validation errors', async () => {
            mockValidateFileOperation.mockResolvedValue({
                valid: false,
                error: 'Invalid parameters'
            })

            const result = await handleMultiFileReader({
                invalid_param: 'value'
            })

            expect(result.isError).toBe(true)
            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.success).toBe(false)
            expect(parsedContent.error).toBe('Invalid parameters')
        })

        it('should handle batch limit validation', async () => {
            mockValidateBatchLimits.mockReturnValue({
                valid: false,
                error: 'Too many files'
            })

            const result = await handleMultiFileReader({
                max_files: 1000
            })

            expect(result.isError).toBe(true)
            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.error).toBe('Too many files')
        })
    })

    describe('handleMultiFileEditor', () => {
        it('should perform search_replace operation', async () => {
            const mockReadFile = vi.mocked(readFile)
            const mockWriteFile = vi.mocked(writeFile)
            const mockExistsSync = vi.mocked(existsSync)
            const mockCopyFile = vi.mocked(copyFile)

            mockExistsSync.mockReturnValue(true)
            mockReadFile.mockResolvedValue('console.log("hello")')
            mockWriteFile.mockResolvedValue(undefined)
            mockCopyFile.mockResolvedValue(undefined)

            const result = await handleMultiFileEditor({
                operation: 'search_replace',
                target_files: {
                    paths: ['file1.js']
                },
                search_replace: {
                    find: 'console\\.log',
                    replace: 'logger.info',
                    use_regex: true
                },
                options: {
                    create_backup: true,
                    dry_run: false
                }
            })

            expect(result.content).toHaveLength(1)
            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.results).toBeInstanceOf(Array)
            expect(parsedContent.summary.operation).toBe('search_replace')
        })

        it('should perform insert operation', async () => {
            const mockReadFile = vi.mocked(readFile)
            const mockWriteFile = vi.mocked(writeFile)
            const mockExistsSync = vi.mocked(existsSync)

            mockExistsSync.mockReturnValue(true)
            mockReadFile.mockResolvedValue('function test() {\n  return true;\n}')
            mockWriteFile.mockResolvedValue(undefined)

            const result = await handleMultiFileEditor({
                operation: 'insert',
                target_files: {
                    paths: ['file1.js']
                },
                insert: {
                    position: 'beginning',
                    content: '// Copyright 2024\n'
                }
            })

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.results[0].changes.length).toBeGreaterThan(0)
        })

        it('should handle dry_run mode', async () => {
            const mockReadFile = vi.mocked(readFile)
            const mockWriteFile = vi.mocked(writeFile)
            const mockExistsSync = vi.mocked(existsSync)

            mockExistsSync.mockReturnValue(true)
            mockReadFile.mockResolvedValue('old content')
            mockWriteFile.mockResolvedValue(undefined)

            const result = await handleMultiFileEditor({
                operation: 'search_replace',
                target_files: {
                    paths: ['file1.txt']
                },
                search_replace: {
                    find: 'old',
                    replace: 'new'
                },
                options: {
                    dry_run: true
                }
            })

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.summary.dry_run).toBe(true)
            expect(parsedContent.summary.changes_made).toBe(0)
        })

        it('should create backups when requested', async () => {
            const mockReadFile = vi.mocked(readFile)
            const mockWriteFile = vi.mocked(writeFile)
            const mockExistsSync = vi.mocked(existsSync)
            const mockCopyFile = vi.mocked(copyFile)

            mockExistsSync.mockReturnValue(true)
            mockReadFile.mockResolvedValue('content')
            mockWriteFile.mockResolvedValue(undefined)
            mockCopyFile.mockResolvedValue(undefined)

            await handleMultiFileEditor({
                operation: 'search_replace',
                target_files: {
                    paths: ['file1.txt']
                },
                search_replace: {
                    find: 'old',
                    replace: 'new'
                },
                options: {
                    create_backup: true,
                    dry_run: false
                }
            })

            expect(mockCopyFile).toHaveBeenCalled()
        })

        it('should handle rename operation', async () => {
            const mockExistsSync = vi.mocked(existsSync)
            const mockCopyFile = vi.mocked(copyFile)

            mockExistsSync.mockReturnValue(true)
            mockCopyFile.mockResolvedValue(undefined)

            const result = await handleMultiFileEditor({
                operation: 'rename',
                target_files: {
                    paths: ['oldname.js']
                },
                rename: {
                    new_name_pattern: '{filename}.ts'
                }
            })

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.results[0].operation).toBe('rename')
        })

        it('should handle validation errors', async () => {
            mockValidateFileOperation.mockResolvedValue({
                valid: false,
                error: 'Invalid operation parameters'
            })

            const result = await handleMultiFileEditor({
                operation: 'invalid_operation',
                target_files: { paths: [] }
            })

            expect(result.isError).toBe(true)
            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.error).toBe('Invalid operation parameters')
        })

        it('should handle file operation errors gracefully', async () => {
            const mockExistsSync = vi.mocked(existsSync)
            mockExistsSync.mockReturnValue(false) // File doesn't exist

            const result = await handleMultiFileEditor({
                operation: 'search_replace',
                target_files: {
                    paths: ['nonexistent.txt']
                },
                search_replace: {
                    find: 'old',
                    replace: 'new'
                }
            })

            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.summary.failed_operations).toBeGreaterThan(0)
            expect(parsedContent.summary.errors).toBeDefined()
        })
    })
})