// src/tools/project-analyzer/engine.ts
import { AnalysisOperation, AnalysisConfig, AnalysisResult, RawProjectData } from './types/index.js';
import { DataCollectorManager, CodeMetricsCollector, DependencyCollector, GitHistoryCollector } from './collectors/index.js';
import { ArchitectureAnalyzer, QualityAnalyzer, DependenciesAnalyzer, MetricsAnalyzer, HealthAnalyzer, InsightsAnalyzer } from './analyzers/index.js';
import { BaseAnalyzer } from './types/index.js';

export class ProjectAnalysisEngine {
  private analyzers: Map<AnalysisOperation, BaseAnalyzer> = new Map();
  private dataCollector: DataCollectorManager;

  constructor(projectRoot?: string) {
    this.dataCollector = new DataCollectorManager(projectRoot);
    this.registerCollectors();
    this.registerAnalyzers();
  }

  private registerCollectors(): void {
    const projectRoot = this.dataCollector.getProjectRoot();

    // Register data collectors
    this.dataCollector.registerCollector('CodeMetricsCollector', new CodeMetricsCollector(projectRoot));
    this.dataCollector.registerCollector('DependencyCollector', new DependencyCollector(projectRoot));
    this.dataCollector.registerCollector('GitHistoryCollector', new GitHistoryCollector(projectRoot));
  }

  private registerAnalyzers(): void {
    // Implemented analyzers
    this.analyzers.set('architecture', new ArchitectureAnalyzer());
    this.analyzers.set('quality', new QualityAnalyzer());
    this.analyzers.set('dependencies', new DependenciesAnalyzer());
    this.analyzers.set('metrics', new MetricsAnalyzer());
    this.analyzers.set('health', new HealthAnalyzer());
    this.analyzers.set('insights', new InsightsAnalyzer());
  }

  async analyze(operation: AnalysisOperation, config: AnalysisConfig): Promise<AnalysisResult> {
    const startTime = Date.now();

    try {
      const analyzer = this.analyzers.get(operation);
      if (!analyzer) {
        throw new Error(`Unknown analysis operation: ${operation}`);
      }

      // Collect data based on scope
      const rawData = await this.dataCollector.collect(config.scope);
      const filesAnalyzed = rawData.files?.length || 0;

      // Perform analysis
      const result = await analyzer.analyze(rawData, config);

      return {
        operation,
        timestamp: new Date(),
        success: true,
        data: result,
        metadata: {
          analysisTime: Date.now() - startTime,
          dataPoints: Object.keys(rawData).length,
          cacheUsed: false,
          filesAnalyzed,
          scope: config.scope || 'full',
          version: '1.0.0'
        }
      };

    } catch (error: any) {
      return {
        operation,
        timestamp: new Date(),
        success: false,
        data: null,
        metadata: {
          analysisTime: Date.now() - startTime,
          dataPoints: 0,
          cacheUsed: false,
          filesAnalyzed: 0,
          scope: config.scope || 'full',
          version: '1.0.0'
        },
        error: error?.message || 'Unknown error'
      };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.analyze('architecture', { operation: 'architecture' });
      return result.success;
    } catch {
      return false;
    }
  }

  // Get data collector manager for external access
  getDataCollector(): DataCollectorManager {
    return this.dataCollector;
  }
}