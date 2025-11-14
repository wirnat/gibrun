// src/tools/project-analyzer/analyzers/ArchitectureAnalyzer.ts
import {
  RawProjectData,
  AnalysisConfig,
  ArchitectureAnalysis,
  ArchitectureLayers,
  DependencyGraph,
  DetectedPatterns,
  ArchitecturalPattern,
  DesignPattern,
  ArchitectureViolations,
  ArchitectureViolation,
  ArchitectureHealth,
  HealthFactor,
  ArchitectureGrade,
  ArchitectureRecommendation,
  BaseAnalyzer
} from '../types/index.js';
import {
  LayerClassifier,
  DependencyGraphBuilder,
  ArchitectureHealthCalculator,
  PatternDetector,
  RecommendationGenerator
} from './components/index.js';

export class ArchitectureAnalyzer implements BaseAnalyzer {
  private layerClassifier = new LayerClassifier();
  private dependencyBuilder = new DependencyGraphBuilder();
  private healthCalculator = new ArchitectureHealthCalculator();
  private patternDetector = new PatternDetector();
  private recommendationGenerator = new RecommendationGenerator();

  async analyze(data: RawProjectData, config: AnalysisConfig): Promise<ArchitectureAnalysis> {
    try {
      // Analyze architecture layers
      const layers = this.analyzeLayers(data.files || []);

      // Build dependency graph
      const dependencyGraph = this.dependencyBuilder.build(data.files || [], data.dependencies || []);

      // Detect architectural patterns
      const patterns = this.patternDetector.detectPatterns(data.files || [], layers, dependencyGraph);

      // Identify violations
      const violations = this.healthCalculator.identifyViolations(layers, dependencyGraph);

      // Calculate health score
      const health = this.healthCalculator.calculateHealth(layers, dependencyGraph, violations);

      // Generate recommendations
      const recommendations = this.recommendationGenerator.generateRecommendations(layers, dependencyGraph, violations, health);

      return {
        layers,
        dependencies: dependencyGraph,
        patterns,
        violations,
        health,
        recommendations
      };

    } catch (error: any) {
      console.error('Architecture analysis failed:', error);
      throw new Error(`Architecture analysis failed: ${error?.message || 'Unknown error'}`);
    }
  }

  private analyzeLayers(files: any[]): ArchitectureLayers {
    const layers: ArchitectureLayers = {
      presentation: [],
      business: [],
      data: [],
      infrastructure: [],
      unidentified: []
    };

    for (const file of files) {
      const filePath = file.path || '';
      const layer = this.layerClassifier.classify(filePath, file.content || '');

      switch (layer) {
        case 'presentation':
          layers.presentation.push(filePath);
          break;
        case 'business':
          layers.business.push(filePath);
          break;
        case 'data':
          layers.data.push(filePath);
          break;
        case 'infrastructure':
          layers.infrastructure.push(filePath);
          break;
        default:
          layers.unidentified.push(filePath);
      }
    }

    return layers;
  }
}