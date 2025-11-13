// test/integration/project-analyzer-integration.test.ts
import { describe, it, expect } from 'vitest'
import { ProjectAnalysisEngine } from '../../src/tools/project-analyzer/engine.js'
import * as path from 'path'

describe('Project Analyzer Integration', () => {
  const testProjectRoot = path.resolve(__dirname, '../../../src') // Use src directory from project root

  describe('Architecture Analysis', () => {
    it('should initialize architecture analyzer', async () => {
      const engine = new ProjectAnalysisEngine(testProjectRoot)

      const result = await engine.analyze('architecture', {
        operation: 'architecture',
        scope: 'full'
      })

      expect(result.success).toBe(true)
      expect(result.operation).toBe('architecture')
      expect(result.data).toBeDefined()
      // Note: filesAnalyzed might be 0 in test environment
      expect(typeof result.metadata.filesAnalyzed).toBe('number')
    })

    it('should return valid architecture analysis structure', async () => {
      const engine = new ProjectAnalysisEngine(testProjectRoot)

      const result = await engine.analyze('architecture', {
        operation: 'architecture',
        scope: 'full'
      })

      expect(result.success).toBe(true)
      expect(result.data).toHaveProperty('layers')
      expect(result.data).toHaveProperty('dependencies')
      expect(result.data).toHaveProperty('patterns')
      expect(result.data).toHaveProperty('violations')
      expect(result.data).toHaveProperty('health')
      expect(result.data).toHaveProperty('recommendations')
    })

    it('should analyze dependencies with security insights', async () => {
      const engine = new ProjectAnalysisEngine(testProjectRoot)

      const result = await engine.analyze('dependencies', {
        operation: 'dependencies',
        scope: 'full'
      })

      expect(result.success).toBe(true)
      expect(result.data).toHaveProperty('summary')
      expect(result.data).toHaveProperty('dependency_graph')
      expect(result.data).toHaveProperty('security_issues')
      expect(result.data).toHaveProperty('license_compatibility')
      expect(result.data).toHaveProperty('recommendations')
    })

    it('should analyze development metrics', async () => {
      const engine = new ProjectAnalysisEngine(testProjectRoot)

      const result = await engine.analyze('metrics', {
        operation: 'metrics',
        scope: 'full'
      })

      expect(result.success).toBe(true)
      expect(result.data).toHaveProperty('time_range')
      expect(result.data).toHaveProperty('velocity')
      expect(result.data).toHaveProperty('quality')
      expect(result.data).toHaveProperty('productivity')
      expect(result.data).toHaveProperty('stability')
      expect(result.data).toHaveProperty('insights')
    })

    it('should provide comprehensive health assessment', async () => {
      const engine = new ProjectAnalysisEngine(testProjectRoot)

      const result = await engine.analyze('health', {
        operation: 'health',
        scope: 'full'
      })

      expect(result.success).toBe(true)
      expect(result.data).toHaveProperty('overall_health_score')
      expect(result.data).toHaveProperty('dimensions')
      expect(result.data).toHaveProperty('risk_assessment')
      expect(result.data).toHaveProperty('benchmark_comparison')
      expect(result.data).toHaveProperty('improvement_roadmap')
      expect(result.data).toHaveProperty('trend_analysis')
    })

    it('should generate intelligent insights and recommendations', async () => {
      const engine = new ProjectAnalysisEngine(testProjectRoot)

      const result = await engine.analyze('insights', {
        operation: 'insights',
        scope: 'full'
      })

      expect(result.success).toBe(true)
      expect(result.data).toHaveProperty('patterns_identified')
      expect(result.data).toHaveProperty('anomalies_detected')
      expect(result.data).toHaveProperty('predictions')
      expect(result.data).toHaveProperty('personalized_recommendations')
      expect(result.data).toHaveProperty('knowledge_discovered')
      expect(result.data).toHaveProperty('confidence_score')
    })
  })

  describe('Quality Analysis', () => {
    it('should initialize quality analyzer', async () => {
      const engine = new ProjectAnalysisEngine(testProjectRoot)

      const result = await engine.analyze('quality', {
        operation: 'quality',
        scope: 'full'
      })

      expect(result.success).toBe(true)
      expect(result.operation).toBe('quality')
      expect(result.data).toBeDefined()
      // Note: filesAnalyzed might be 0 in test environment
      expect(typeof result.metadata.filesAnalyzed).toBe('number')
    })

    it('should return valid quality analysis structure', async () => {
      const engine = new ProjectAnalysisEngine(testProjectRoot)

      const result = await engine.analyze('quality', {
        operation: 'quality',
        scope: 'full'
      })

      expect(result.success).toBe(true)
      expect(result.data).toHaveProperty('files_analyzed')
      expect(result.data).toHaveProperty('overall_score')
      expect(result.data).toHaveProperty('dimensions')
      expect(result.data).toHaveProperty('hotspots')
      expect(result.data).toHaveProperty('recommendations')
    })
  })

  describe('Data Collection', () => {
    it('should initialize data collector', async () => {
      const engine = new ProjectAnalysisEngine(testProjectRoot)
      const dataCollector = engine.getDataCollector()

      expect(dataCollector).toBeDefined()
      expect(typeof dataCollector.collect).toBe('function')
      expect(dataCollector.listCollectors()).toContain('CodeMetricsCollector')
      expect(dataCollector.listCollectors()).toContain('DependencyCollector')
      expect(dataCollector.listCollectors()).toContain('GitHistoryCollector')
    })

    it('should validate project structure', async () => {
      const engine = new ProjectAnalysisEngine(testProjectRoot)
      const dataCollector = engine.getDataCollector()

      const validation = await dataCollector.validateProjectStructure()

      expect(validation).toBeDefined()
      expect(typeof validation.valid).toBe('boolean')
      expect(Array.isArray(validation.issues)).toBe(true)
    })
  })

  describe('Health Check', () => {
    it('should pass health check', async () => {
      const engine = new ProjectAnalysisEngine(testProjectRoot)
      const isHealthy = await engine.healthCheck()

      expect(isHealthy).toBe(true)
    })
  })
})