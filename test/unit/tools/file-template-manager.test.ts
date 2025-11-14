import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    FILE_TEMPLATE_MANAGER_TOOLS,
    handleFileTemplateManager
} from '../../../src/tools/file-system/index.js'

// Mock dependencies
vi.mock('fs/promises')
vi.mock('fs')
vi.mock('path')
vi.mock('../../../src/services/logger-service.js')
vi.mock('../../../src/tools/file-system/validation.js')

describe('File Template Manager', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('FILE_TEMPLATE_MANAGER_TOOLS', () => {
        it('should export FILE_TEMPLATE_MANAGER_TOOLS with correct structure', () => {
            expect(FILE_TEMPLATE_MANAGER_TOOLS).toBeInstanceOf(Array)
            expect(FILE_TEMPLATE_MANAGER_TOOLS).toHaveLength(1)

            const [tool] = FILE_TEMPLATE_MANAGER_TOOLS

            expect(tool.name).toBe('file_template_manager')
            expect(tool.description).toContain('code templates within MCP workspace')
            expect(tool.inputSchema.type).toBe('object')
        })

        it('should have proper parameter schemas', () => {
            const [tool] = FILE_TEMPLATE_MANAGER_TOOLS
            const props = tool.inputSchema.properties as any

            expect(props.operation.enum).toEqual(['list', 'apply', 'create', 'validate'])
            expect(props.category.enum).toEqual(['api', 'database', 'test', 'config'])
            expect(props.template.type).toBe('string')
            expect(props.variables.type).toBe('object')
            expect(props.output_path.type).toBe('string')
            expect(props.create_dirs.type).toBe('boolean')
        })
    })

    describe('handleFileTemplateManager - basic functionality', () => {
        it('should handle invalid operation', async () => {
            const result = await handleFileTemplateManager({
                operation: 'invalid_operation'
            })

            expect(result.content).toHaveLength(1)
            const parsedContent = JSON.parse(result.content[0].text)
            expect(parsedContent.success).toBe(false)
            expect(parsedContent.error).toContain('Unknown operation')
        })

        it('should handle list operation with basic setup', async () => {
            // This test verifies the function can be called without throwing
            const result = await handleFileTemplateManager({
                operation: 'list'
            })

            expect(result.content).toHaveLength(1)
            expect(typeof result.content[0].text).toBe('string')
        })

        it('should handle apply operation with basic setup', async () => {
            // This test verifies the function can be called without throwing
            const result = await handleFileTemplateManager({
                operation: 'apply',
                template: 'test.template',
                variables: { test: 'value' },
                output_path: 'output.ts'
            })

            expect(result.content).toHaveLength(1)
            expect(typeof result.content[0].text).toBe('string')
        })
    })
})