// src/tools/project-analyzer/analyzers/ArchitectureAnalyzer.ts
import * as path from 'path';
import {
  RawProjectData,
  AnalysisConfig,
  ArchitectureAnalysis,
  ArchitectureLayers,
  DependencyGraph,
  DependencyNode,
  DependencyEdge,
  CircularDependency,
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

export class ArchitectureAnalyzer implements BaseAnalyzer {
  async analyze(data: RawProjectData, config: AnalysisConfig): Promise<ArchitectureAnalysis> {
    const startTime = Date.now();

    try {
      // Analyze architecture layers
      const layers = this.analyzeLayers(data.files || []);

      // Build dependency graph
      const dependencyGraph = this.buildDependencyGraph(data.files || [], data.dependencies || []);

      // Detect architectural patterns
      const patterns = this.detectPatterns(data.files || [], layers, dependencyGraph);

      // Identify violations
      const violations = this.identifyViolations(layers, dependencyGraph);

      // Calculate health score
      const health = this.calculateHealth(layers, dependencyGraph, violations);

      // Generate recommendations
      const recommendations = this.generateRecommendations(layers, dependencyGraph, violations, health);

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
      const layer = this.classifyLayer(filePath, file.content || '');

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

  private classifyLayer(filePath: string, content: string): 'presentation' | 'business' | 'data' | 'infrastructure' | 'unidentified' {
    const pathLower = filePath.toLowerCase();
    const contentLower = content.toLowerCase();

    // Presentation layer patterns
    if (pathLower.includes('/ui/') || pathLower.includes('/components/') ||
        pathLower.includes('/views/') || pathLower.includes('/pages/') ||
        pathLower.includes('/templates/') || pathLower.includes('/public/')) {
      return 'presentation';
    }

    // Check for UI frameworks and presentation patterns
    if (contentLower.includes('react') || contentLower.includes('vue') ||
        contentLower.includes('angular') || contentLower.includes('jsx') ||
        contentLower.includes('tsx') || contentLower.includes('html') ||
        contentLower.includes('css') || contentLower.includes('scss')) {
      return 'presentation';
    }

    // Business logic layer patterns
    if (pathLower.includes('/services/') || pathLower.includes('/usecases/') ||
        pathLower.includes('/interactors/') || pathLower.includes('/business/') ||
        pathLower.includes('/logic/') || pathLower.includes('/handlers/')) {
      return 'business';
    }

    // Check for business logic patterns
    if (contentLower.includes('service') || contentLower.includes('usecase') ||
        contentLower.includes('business logic') || contentLower.includes('handler') ||
        contentLower.includes('controller') || contentLower.includes('middleware')) {
      return 'business';
    }

    // Data layer patterns
    if (pathLower.includes('/models/') || pathLower.includes('/entities/') ||
        pathLower.includes('/repositories/') || pathLower.includes('/dao/') ||
        pathLower.includes('/database/') || pathLower.includes('/migrations/')) {
      return 'data';
    }

    // Check for data patterns
    if (contentLower.includes('model') || contentLower.includes('entity') ||
        contentLower.includes('repository') || contentLower.includes('database') ||
        contentLower.includes('schema') || contentLower.includes('migration')) {
      return 'data';
    }

    // Infrastructure layer patterns
    if (pathLower.includes('/config/') || pathLower.includes('/utils/') ||
        pathLower.includes('/lib/') || pathLower.includes('/helpers/') ||
        pathLower.includes('/infrastructure/') || pathLower.includes('/external/')) {
      return 'infrastructure';
    }

    // Check for infrastructure patterns
    if (contentLower.includes('config') || contentLower.includes('utility') ||
        contentLower.includes('helper') || contentLower.includes('infrastructure') ||
        contentLower.includes('external service') || contentLower.includes('api client')) {
      return 'infrastructure';
    }

    return 'unidentified';
  }

  private buildDependencyGraph(files: any[], dependencies: any[]): DependencyGraph {
    const nodes: DependencyNode[] = [];
    const edges: DependencyEdge[] = [];
    const circularDeps: CircularDependency[] = [];

    // Create nodes from files
    const fileNodes = new Map<string, DependencyNode>();
    for (const file of files) {
      const filePath = file.path || '';
      const layer = this.classifyLayer(filePath, file.content || '');
      const node: DependencyNode = {
        id: filePath,
        layer: this.mapLayerType(layer),
        dependencies: 0
      };
      fileNodes.set(filePath, node);
      nodes.push(node);
    }

    // Analyze dependencies between files
    for (const file of files) {
      const filePath = file.path || '';
      const content = file.content || '';

      // Simple import analysis (can be enhanced)
      const imports = this.extractImports(content, file.language || 'unknown');

      for (const importPath of imports) {
        // Try to resolve relative imports
        const resolvedPath = this.resolveImportPath(filePath, importPath);
        if (resolvedPath && fileNodes.has(resolvedPath)) {
          const fromNode = fileNodes.get(filePath)!;
          const toNode = fileNodes.get(resolvedPath)!;

          edges.push({
            from: filePath,
            to: resolvedPath,
            type: 'direct'
          });

          fromNode.dependencies += 1;
        }
      }
    }

    // Detect circular dependencies (simplified)
    circularDeps.push(...this.detectCircularDependencies(edges));

    // Calculate dependency strength
    const totalDeps = edges.length;
    const avgDeps = nodes.length > 0 ? totalDeps / nodes.length : 0;
    let strength: 'loose' | 'moderate' | 'tight' | 'very_tight' | 'unknown' = 'unknown';

    if (avgDeps < 2) strength = 'loose';
    else if (avgDeps < 5) strength = 'moderate';
    else if (avgDeps < 10) strength = 'tight';
    else strength = 'very_tight';

    return {
      nodes,
      edges,
      circularDependencies: circularDeps,
      strength
    };
  }

  private extractImports(content: string, language: string): string[] {
    const imports: string[] = [];

    try {
      if (language === 'javascript' || language === 'typescript') {
        // Match import statements
        const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
        let match;
        while ((match = importRegex.exec(content)) !== null) {
          imports.push(match[1]);
        }

        // Match require statements
        const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
        while ((match = requireRegex.exec(content)) !== null) {
          imports.push(match[1]);
        }
      } else if (language === 'go') {
        // Match Go imports
        const importRegex = /import\s+[\(\s]*["]([^"]+)["]/g;
        let match;
        while ((match = importRegex.exec(content)) !== null) {
          imports.push(match[1]);
        }
      } else if (language === 'python') {
        // Match Python imports
        const importRegex = /^(?:from\s+([^\s]+)\s+import|import\s+([^\s]+))/gm;
        let match;
        while ((match = importRegex.exec(content)) !== null) {
          const importPath = match[1] || match[2];
          if (importPath) imports.push(importPath);
        }
      }
    } catch (error) {
      // Ignore parsing errors
    }

    return imports;
  }

  private resolveImportPath(fromPath: string, importPath: string): string | null {
    // Simple resolution for relative imports
    if (importPath.startsWith('./') || importPath.startsWith('../')) {
      const fromDir = path.dirname(fromPath);
      const resolved = path.resolve(fromDir, importPath);

      // Try different extensions
      const extensions = ['.js', '.ts', '.jsx', '.tsx', '.go', '.py'];
      for (const ext of extensions) {
        const candidate = resolved + ext;
        // In a real implementation, you'd check if the file exists
        // For now, just return the path without extension if it looks valid
        if (!candidate.includes('/node_modules/')) {
          return candidate;
        }
      }
    }

    return null;
  }

  private mapLayerType(layer: string): 'presentation' | 'business' | 'data' | 'infrastructure' | 'unidentified' {
    switch (layer) {
      case 'presentation': return 'presentation';
      case 'business': return 'business';
      case 'data': return 'data';
      case 'infrastructure': return 'infrastructure';
      default: return 'unidentified';
    }
  }

  private detectCircularDependencies(edges: DependencyEdge[]): CircularDependency[] {
    // Simplified circular dependency detection
    // In a real implementation, you'd use graph algorithms
    const circularDeps: CircularDependency[] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const detectCycle = (node: string, path: string[] = []): boolean => {
      if (recursionStack.has(node)) {
        // Found cycle
        const cycleStart = path.indexOf(node);
        if (cycleStart !== -1) {
          const cycle = path.slice(cycleStart);
          circularDeps.push({
            nodes: cycle,
            description: `Circular dependency detected: ${cycle.join(' -> ')}`
          });
        }
        return true;
      }

      if (visited.has(node)) return false;

      visited.add(node);
      recursionStack.add(node);

      const outgoingEdges = edges.filter(e => e.from === node);
      for (const edge of outgoingEdges) {
        if (detectCycle(edge.to, [...path, node])) {
          return true;
        }
      }

      recursionStack.delete(node);
      return false;
    };

    // Check all nodes
    const allNodes = new Set([...edges.map(e => e.from), ...edges.map(e => e.to)]);
    for (const node of Array.from(allNodes)) {
      if (!visited.has(node)) {
        detectCycle(node);
      }
    }

    return circularDeps;
  }

  private detectPatterns(files: any[], layers: ArchitectureLayers, dependencyGraph: DependencyGraph): DetectedPatterns {
    const architectural: ArchitecturalPattern[] = [];
    const design: DesignPattern[] = [];

    // Detect layered architecture
    if (layers.presentation.length > 0 && layers.business.length > 0 && layers.data.length > 0) {
      architectural.push({
        name: 'Layered Architecture',
        confidence: 0.8,
        evidence: `${layers.presentation.length} presentation, ${layers.business.length} business, ${layers.data.length} data layer files detected`
      });
    }

    // Detect MVC pattern
    const hasControllers = files.some(f => f.path?.toLowerCase().includes('controller'));
    const hasModels = files.some(f => f.path?.toLowerCase().includes('model'));
    const hasViews = files.some(f => f.path?.toLowerCase().includes('view'));

    if (hasControllers && hasModels && hasViews) {
      architectural.push({
        name: 'MVC Pattern',
        confidence: 0.7,
        evidence: 'Controller, Model, and View components detected'
      });
    }

    // Calculate overall confidence
    const avgConfidence = architectural.length > 0
      ? architectural.reduce((sum, p) => sum + p.confidence, 0) / architectural.length
      : 0;

    return {
      architectural,
      design,
      confidence: avgConfidence
    };
  }

  private identifyViolations(layers: ArchitectureLayers, dependencyGraph: DependencyGraph): ArchitectureViolations {
    const violations: ArchitectureViolation[] = [];

    // Check for dependency direction violations
    for (const edge of dependencyGraph.edges) {
      const fromLayer = this.getLayerFromPath(edge.from, layers);
      const toLayer = this.getLayerFromPath(edge.to, layers);

      // Business logic should not depend on presentation
      if (fromLayer === 'business' && toLayer === 'presentation') {
        violations.push({
          type: 'dependency_direction',
          severity: 'medium',
          description: `Business layer (${edge.from}) depends on presentation layer (${edge.to})`,
          locations: [edge.from, edge.to],
          recommendation: 'Move presentation logic to appropriate layer or use dependency injection'
        });
      }

      // Data layer should not depend on presentation
      if (fromLayer === 'data' && toLayer === 'presentation') {
        violations.push({
          type: 'dependency_direction',
          severity: 'high',
          description: `Data layer (${edge.from}) depends on presentation layer (${edge.to})`,
          locations: [edge.from, edge.to],
          recommendation: 'Refactor to use repository pattern or service layer'
        });
      }
    }

    // Check for circular dependencies
    for (const circular of dependencyGraph.circularDependencies) {
      violations.push({
        type: 'circular_dependency',
        severity: 'high',
        description: circular.description,
        locations: circular.nodes,
        recommendation: 'Break circular dependency by introducing interface or mediator pattern'
      });
    }

    return { violations };
  }

  private getLayerFromPath(filePath: string, layers: ArchitectureLayers): string {
    if (layers.presentation.includes(filePath)) return 'presentation';
    if (layers.business.includes(filePath)) return 'business';
    if (layers.data.includes(filePath)) return 'data';
    if (layers.infrastructure.includes(filePath)) return 'infrastructure';
    return 'unidentified';
  }

  private calculateHealth(layers: ArchitectureLayers, dependencyGraph: DependencyGraph, violations: ArchitectureViolations): ArchitectureHealth {
    let score = 100;

    // Deduct points for violations
    for (const violation of violations.violations) {
      switch (violation.severity) {
        case 'low': score -= 5; break;
        case 'medium': score -= 10; break;
        case 'high': score -= 20; break;
        case 'critical': score -= 30; break;
      }
    }

    // Deduct points for circular dependencies
    score -= dependencyGraph.circularDependencies.length * 15;

    // Bonus for good layer separation
    const totalFiles = layers.presentation.length + layers.business.length +
                      layers.data.length + layers.infrastructure.length;
    const unidentifiedRatio = layers.unidentified.length / Math.max(totalFiles, 1);
    score -= unidentifiedRatio * 20;

    // Ensure score is between 0 and 100
    score = Math.max(0, Math.min(100, score));

    // Determine grade
    let grade: ArchitectureGrade;
    if (score >= 90) grade = 'A';
    else if (score >= 80) grade = 'B';
    else if (score >= 70) grade = 'C';
    else if (score >= 60) grade = 'D';
    else grade = 'F';

    const factors: HealthFactor[] = [
      {
        factor: 'Layer Separation',
        score: Math.max(0, 100 - (unidentifiedRatio * 100)),
        description: `${layers.unidentified.length} files not properly categorized`
      },
      {
        factor: 'Dependency Violations',
        score: Math.max(0, 100 - (violations.violations.length * 10)),
        description: `${violations.violations.length} architectural violations detected`
      },
      {
        factor: 'Circular Dependencies',
        score: Math.max(0, 100 - (dependencyGraph.circularDependencies.length * 20)),
        description: `${dependencyGraph.circularDependencies.length} circular dependencies found`
      }
    ];

    return {
      score,
      grade,
      factors
    };
  }

  private generateRecommendations(
    layers: ArchitectureLayers,
    dependencyGraph: DependencyGraph,
    violations: ArchitectureViolations,
    health: ArchitectureHealth
  ): ArchitectureRecommendation[] {
    const recommendations: ArchitectureRecommendation[] = [];

    // Recommendations based on violations
    for (const violation of violations.violations) {
      recommendations.push({
        type: 'violation_fix',
        priority: violation.severity === 'critical' ? 'urgent' :
                 violation.severity === 'high' ? 'high' : 'medium',
        title: `Fix ${violation.type} violation`,
        description: violation.description,
        effort: 'medium',
        impact: 'high'
      });
    }

    // Recommendations based on layer distribution
    const totalFiles = Object.values(layers).flat().length;
    const unidentifiedRatio = layers.unidentified.length / Math.max(totalFiles, 1);

    if (unidentifiedRatio > 0.3) {
      recommendations.push({
        type: 'pattern_adoption',
        priority: 'high',
        title: 'Improve Layer Organization',
        description: `${Math.round(unidentifiedRatio * 100)}% of files are not properly categorized. Consider adopting a clear architectural pattern.`,
        effort: 'high',
        impact: 'medium'
      });
    }

    // Pattern adoption recommendations
    if (layers.presentation.length > 0 && layers.business.length === 0) {
      recommendations.push({
        type: 'pattern_adoption',
        priority: 'medium',
        title: 'Consider Layered Architecture',
        description: 'Presentation layer detected but no clear business logic layer. Consider separating concerns.',
        effort: 'high',
        impact: 'high'
      });
    }

    return recommendations;
  }
}