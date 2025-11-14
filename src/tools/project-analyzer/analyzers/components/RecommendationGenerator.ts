// src/tools/project-analyzer/analyzers/components/RecommendationGenerator.ts
import {
  ArchitectureLayers,
  DependencyGraph,
  ArchitectureViolations,
  ArchitectureHealth,
  ArchitectureRecommendation
} from '../../types/index.js';

export class RecommendationGenerator {
  generateRecommendations(
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