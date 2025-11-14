// src/tools/project-analyzer/analyzers/components/PatternDetector.ts
import {
  ArchitectureLayers,
  DependencyGraph,
  DetectedPatterns,
  ArchitecturalPattern,
  DesignPattern
} from '../../types/index.js';

export class PatternDetector {
  detectPatterns(files: any[], layers: ArchitectureLayers, dependencyGraph: DependencyGraph): DetectedPatterns {
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
}