import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ProjectAnalyzerTool } from '../../../src/tools/project-analyzer/index.js'
import { ProjectAnalysisEngine } from '../../../src/tools/project-analyzer/engine.js'

// Mock the engine
const mockAnalyze = vi.fn()
const mockHealthCheck = vi.fn()

vi.mock('../../../src/tools/project-analyzer/engine.js', () => ({
    ProjectAnalysisEngine: vi.fn().mockImplementation(function() {
        return {
            analyze: mockAnalyze,
            healthCheck: mockHealthCheck
        }
    })
}))

describe('Project Analyzer Tool', () => {
    let tool: ProjectAnalyzerTool

    beforeEach(() => {
        vi.clearAllMocks()
        mockAnalyze.mockClear()
        mockHealthCheck.mockClear()
        tool = new ProjectAnalyzerTool()
    })

    describe('getTools()', () => {
        it('should return array of 6 project analyzer tools', () => {
            const tools = tool.getTools()

            expect(tools).toBeInstanceOf(Array)
            expect(tools).toHaveLength(6)

            const toolNames = tools.map(t => t.name)
            expect(toolNames).toEqual([
                'project_analyzer/architecture',
                'project_analyzer/quality',
                'project_analyzer/dependencies',
                'project_analyzer/metrics',
                'project_analyzer/health',
                'project_analyzer/insights'
            ])
        })

        it('should have correct tool structure for architecture tool', () => {
            const tools = tool.getTools()
            const archTool = tools.find(t => t.name === 'project_analyzer/architecture')

            expect(archTool).toBeDefined()
            expect(archTool!.description).toContain('architecture patterns and structural health')
            expect(archTool!.inputSchema.type).toBe('object')

            const props = archTool!.inputSchema.properties as any
            expect(props).toHaveProperty('operation')
            expect(props).toHaveProperty('scope')
            expect(props).toHaveProperty('target_modules')
            expect(props).toHaveProperty('include_historical')
            expect(props).toHaveProperty('output_format')
        })

        it('should have correct tool structure for quality tool', () => {
            const tools = tool.getTools()
            const qualityTool = tools.find(t => t.name === 'project_analyzer/quality')

            expect(qualityTool).toBeDefined()
            expect(qualityTool!.description).toContain('code quality assessment')
            expect(qualityTool!.inputSchema.type).toBe('object')

            const props = qualityTool!.inputSchema.properties as any
            expect(props).toHaveProperty('quality_checks')
            expect(props.quality_checks.type).toBe('object')
            expect(props.quality_checks.properties).toHaveProperty('complexity')
            expect(props.quality_checks.properties).toHaveProperty('duplication')
            expect(props.quality_checks.properties).toHaveProperty('coverage')
        })

        it('should have correct tool structure for dependencies tool', () => {
            const tools = tool.getTools()
            const depsTool = tools.find(t => t.name === 'project_analyzer/dependencies')

            expect(depsTool).toBeDefined()
            expect(depsTool!.description).toContain('dependency analysis')
            expect(depsTool!.inputSchema.type).toBe('object')

            const props = depsTool!.inputSchema.properties as any
            expect(props).toHaveProperty('analysis_types')
            expect(props).toHaveProperty('security_scan')
            expect(props).toHaveProperty('license_check')
        })

        it('should have correct tool structure for metrics tool', () => {
            const tools = tool.getTools()
            const metricsTool = tools.find(t => t.name === 'project_analyzer/metrics')

            expect(metricsTool).toBeDefined()
            expect(metricsTool!.description).toContain('productivity and velocity metrics')
            expect(metricsTool!.inputSchema.type).toBe('object')

            const props = metricsTool!.inputSchema.properties as any
            expect(props).toHaveProperty('time_range')
            expect(props).toHaveProperty('metrics')
            expect(props).toHaveProperty('granularity')
        })

        it('should have correct tool structure for health tool', () => {
            const tools = tool.getTools()
            const healthTool = tools.find(t => t.name === 'project_analyzer/health')

            expect(healthTool).toBeDefined()
            expect(healthTool!.description).toContain('project health assessment')
            expect(healthTool!.inputSchema.type).toBe('object')

            const props = healthTool!.inputSchema.properties as any
            expect(props).toHaveProperty('benchmark_against')
            expect(props).toHaveProperty('generate_roadmap')
        })

        it('should have correct tool structure for insights tool', () => {
            const tools = tool.getTools()
            const insightsTool = tools.find(t => t.name === 'project_analyzer/insights')

            expect(insightsTool).toBeDefined()
            expect(insightsTool!.description).toContain('AI-powered insights')
            expect(insightsTool!.inputSchema.type).toBe('object')

            const props = insightsTool!.inputSchema.properties as any
            expect(props).toHaveProperty('insight_types')
            expect(props).toHaveProperty('context')
        })
    })

    describe('executeTool()', () => {
        it('should execute architecture analysis successfully', async () => {
            const mockResult = {
                operation: 'architecture',
                timestamp: new Date(),
                success: true,
                data: { layers: ['presentation', 'business', 'data'] },
                metadata: {
                    analysisTime: 150,
                    dataPoints: 5,
                    cacheUsed: false,
                    filesAnalyzed: 12,
                    scope: 'full',
                    version: '1.0.0'
                }
            }

            mockAnalyze.mockResolvedValue(mockResult)

            const result = await tool.executeTool('project_analyzer/architecture', {
                scope: 'full',
                output_format: 'summary'
            })

            expect(mockAnalyze).toHaveBeenCalledWith('architecture', {
                operation: 'architecture',
                scope: 'full',
                output_format: 'summary'
            })

            expect(result).toHaveProperty('content')
            expect(result.content).toBeInstanceOf(Array)
            expect(result.content[0].type).toBe('text')
            expect(result.content[0].text).toContain('Architecture analysis completed')
            expect(result.content[0].text).toContain('150ms')
            expect(result.content[0].text).toContain('12 files analyzed')
        })

        it('should execute quality analysis with detailed output', async () => {
            const mockResult = {
                operation: 'quality',
                timestamp: new Date(),
                success: true,
                data: {
                    complexity_score: 7.2,
                    duplication_percentage: 3.1,
                    test_coverage: 85.5
                },
                metadata: {
                    analysisTime: 200,
                    dataPoints: 8,
                    cacheUsed: false,
                    filesAnalyzed: 25,
                    scope: 'full',
                    version: '1.0.0'
                }
            }

            mockAnalyze.mockResolvedValue(mockResult)

            const result = await tool.executeTool('project_analyzer/quality', {
                output_format: 'detailed'
            })

            expect(mockAnalyze).toHaveBeenCalledWith('quality', {
                operation: 'quality',
                output_format: 'detailed'
            })

            expect(result.content[0].text).toContain('QUALITY ANALYSIS REPORT')
            expect(result.content[0].text).toContain('Duration: 200ms')
            expect(result.content[0].text).toContain('Files Analyzed: 25')
            expect(result.content[0].text).toContain('RESULTS:')
        })

        it('should execute analysis with JSON output format', async () => {
            const timestamp = new Date()
            const mockResult = {
                operation: 'dependencies',
                timestamp,
                success: true,
                data: { dependencies: [], security_issues: [] },
                metadata: {
                    analysisTime: 100,
                    dataPoints: 3,
                    cacheUsed: false,
                    filesAnalyzed: 8,
                    scope: 'full',
                    version: '1.0.0'
                }
            }

            mockAnalyze.mockResolvedValue(mockResult)

            const result = await tool.executeTool('project_analyzer/dependencies', {
                output_format: 'json'
            })

            expect(mockAnalyze).toHaveBeenCalledWith('dependencies', {
                operation: 'dependencies',
                output_format: 'json'
            })

            const parsedOutput = JSON.parse(result.content[0].text)
            // JSON.stringify converts Date to string, so compare with serialized version
            expect(parsedOutput).toEqual({
                ...mockResult,
                timestamp: timestamp.toISOString()
            })
        })

        it('should handle analysis failure gracefully', async () => {
            const mockResult = {
                operation: 'metrics',
                timestamp: new Date(),
                success: false,
                data: null,
                metadata: {
                    analysisTime: 50,
                    dataPoints: 0,
                    cacheUsed: false,
                    filesAnalyzed: 0,
                    scope: 'full',
                    version: '1.0.0'
                },
                error: 'Analysis engine not available'
            }

            mockAnalyze.mockResolvedValue(mockResult)

            const result = await tool.executeTool('project_analyzer/metrics', {})

            expect(mockAnalyze).toHaveBeenCalledWith('metrics', { operation: 'metrics' })

            expect(result).toHaveProperty('content')
            expect(result.content[0].text).toContain('❌ Analysis failed')
            expect(result.content[0].text).toContain('Analysis engine not available')
        })

        it('should handle execution errors gracefully', async () => {
            mockAnalyze.mockRejectedValue(new Error('Engine timeout'))

            const result = await tool.executeTool('project_analyzer/health', {})

            expect(mockAnalyze).toHaveBeenCalledWith('health', { operation: 'health' })

            expect(result).toHaveProperty('isError', true)
            expect(result.content[0].text).toContain('Project analysis failed')
            expect(result.content[0].text).toContain('Engine timeout')
        })

        it('should extract operation from tool name correctly', async () => {
            const mockResult = {
                operation: 'insights',
                timestamp: new Date(),
                success: true,
                data: { insights: [] },
                metadata: {
                    analysisTime: 75,
                    dataPoints: 2,
                    cacheUsed: false,
                    filesAnalyzed: 5,
                    scope: 'full',
                    version: '1.0.0'
                }
            }

            mockAnalyze.mockResolvedValue(mockResult)

            await tool.executeTool('project_analyzer/insights', {})

            expect(mockAnalyze).toHaveBeenCalledWith('insights', {
                operation: 'insights'
            })
        })
    })
})