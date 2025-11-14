// src/tools/project-analyzer/analyzers/components/ArchitectureHealthCalculator.ts
import {
  ArchitectureLayers,
  DependencyGraph,
  ArchitectureViolations,
  ArchitectureViolation,
  ArchitectureHealth,
  HealthFactor,
  ArchitectureGrade
} from '../../types/index.js';

export class ArchitectureHealthCalculator {
  identifyViolations(layers: ArchitectureLayers, dependencyGraph: DependencyGraph): ArchitectureViolations {
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

  calculateHealth(layers: ArchitectureLayers, dependencyGraph: DependencyGraph, violations: ArchitectureViolations): ArchitectureHealth {
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

  private getLayerFromPath(filePath: string, layers: ArchitectureLayers): string {
    if (layers.presentation.includes(filePath)) return 'presentation';
    if (layers.business.includes(filePath)) return 'business';
    if (layers.data.includes(filePath)) return 'data';
    if (layers.infrastructure.includes(filePath)) return 'infrastructure';
    return 'unidentified';
  }
}