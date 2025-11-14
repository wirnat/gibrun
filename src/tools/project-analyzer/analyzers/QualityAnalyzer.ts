// src/tools/project-analyzer/analyzers/QualityAnalyzer.ts
import {
  RawProjectData,
  AnalysisConfig,
  QualityAnalysis,
  QualityDimensions,
  ComplexityMetrics,
  DuplicationMetrics,
  CoverageMetrics,
  MaintainabilityMetrics,
  MaintainabilityFactors,
  QualityHotspot,
  QualityRecommendation,
  FileQualityResult,
  BaseAnalyzer
} from '@analyzer-types/index.js';

export class QualityAnalyzer implements BaseAnalyzer {
  async analyze(data: RawProjectData, config: AnalysisConfig): Promise<QualityAnalysis> {
    const files = data.files || [];
    const testResults = data.testResults || [];

    // Analyze each file
    const fileResults: FileQualityResult[] = [];
    for (const file of files) {
      const result = await this.analyzeFile(file);
      fileResults.push(result);
    }

    // Calculate overall metrics
    const dimensions = this.calculateDimensions(fileResults, testResults);

    // Identify hotspots
    const hotspots = this.identifyHotspots(fileResults);

    // Generate recommendations
    const recommendations = this.generateRecommendations(fileResults, dimensions);

    // Calculate overall score
    const overallScore = this.calculateOverallScore(dimensions);

    return {
      files_analyzed: files.length,
      overall_score: overallScore,
      dimensions,
      hotspots,
      recommendations,
      detailed_results: fileResults
    };
  }

  private async analyzeFile(file: any): Promise<FileQualityResult> {
    const content = file.content || '';
    const lines = content.split('\n').length;

    // Calculate complexity
    const complexity = this.calculateComplexity(content, file.language || 'unknown');

    // Calculate duplication (simplified)
    const duplicatedLines = this.detectDuplication(content);

    // Coverage (if available from test results)
    const coverage = this.getCoverageForFile(file.path, file.language);

    // Identify errors/issues
    const errors = this.identifyIssues(content, file.language);

    return {
      file_path: file.path || '',
      lines,
      complexity,
      duplicated_lines: duplicatedLines,
      coverage,
      errors
    };
  }

  private calculateComplexity(content: string, language: string): number | undefined {
    if (!content.trim()) return 0;

    let complexity = 1; // Base complexity

    // Language-specific complexity calculation
    if (language === 'javascript' || language === 'typescript') {
      // Count control flow statements
      const controlFlowPatterns = [
        /\bif\s*\(/g,
        /\belse\s*\{/g,
        /\bfor\s*\(/g,
        /\bwhile\s*\(/g,
        /\bdo\s*\{/g,
        /\bswitch\s*\(/g,
        /\bcatch\s*\(/g,
        /\bcase\s+/g,
        /\b&&/g,
        /\b\|\|/g,
        /\?/g, // ternary operator
      ];

      for (const pattern of controlFlowPatterns) {
        const matches = content.match(pattern);
        if (matches) {
          complexity += matches.length;
        }
      }

      // Count functions/methods
      const functionPatterns = [
        /\bfunction\s+\w+/g,
        /\bconst\s+\w+\s*=\s*\([^)]*\)\s*=>/g,
        /\bclass\s+\w+/g,
        /\b\w+\s*\([^)]*\)\s*\{/g, // method definitions
      ];

      for (const pattern of functionPatterns) {
        const matches = content.match(pattern);
        if (matches) {
          complexity += matches.length;
        }
      }

    } else if (language === 'go') {
      // Go complexity calculation
      const controlFlowPatterns = [
        /\bif\s+/g,
        /\belse\s+/g,
        /\bfor\s+/g,
        /\bswitch\s+/g,
        /\bcase\s+/g,
        /\bselect\s+/g,
        /\bgoroutine\s+/g,
      ];

      for (const pattern of controlFlowPatterns) {
        const matches = content.match(pattern);
        if (matches) {
          complexity += matches.length;
        }
      }

      // Count functions
      const funcMatches = content.match(/\bfunc\s+/g);
      if (funcMatches) {
        complexity += funcMatches.length;
      }

    } else if (language === 'python') {
      // Python complexity calculation
      const controlFlowPatterns = [
        /\bif\s+/g,
        /\belif\s+/g,
        /\belse\s*:/g,
        /\bfor\s+/g,
        /\bwhile\s+/g,
        /\btry\s*:/g,
        /\bexcept\s+/g,
        /\bwith\s+/g,
      ];

      for (const pattern of controlFlowPatterns) {
        const matches = content.match(pattern);
        if (matches) {
          complexity += matches.length;
        }
      }

      // Count functions and classes
      const funcMatches = content.match(/\bdef\s+/g);
      const classMatches = content.match(/\bclass\s+/g);

      if (funcMatches) complexity += funcMatches.length;
      if (classMatches) complexity += classMatches.length;

    } else if (language === 'java') {
      // Java complexity calculation
      const controlFlowPatterns = [
        /\bif\s*\(/g,
        /\belse\s+/g,
        /\bfor\s*\(/g,
        /\bwhile\s*\(/g,
        /\bdo\s+/g,
        /\bswitch\s*\(/g,
        /\bcatch\s*\(/g,
        /\bcase\s+/g,
      ];

      for (const pattern of controlFlowPatterns) {
        const matches = content.match(pattern);
        if (matches) {
          complexity += matches.length;
        }
      }

      // Count methods and classes
      const methodMatches = content.match(/\b(public|private|protected)?\s+\w+\s+\w+\s*\(/g);
      const classMatches = content.match(/\bclass\s+/g);

      if (methodMatches) complexity += methodMatches.length;
      if (classMatches) complexity += classMatches.length;
    }

    return complexity;
  }

  private detectDuplication(content: string): number {
    if (!content.trim()) return 0;

    const lines = content.split('\n');
    const lineHashes = new Map<string, number>();
    let duplicatedLines = 0;

    // Simple line-based duplication detection
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 10) { // Only check substantial lines
        const hash = this.simpleHash(trimmed);
        const count = lineHashes.get(hash) || 0;
        lineHashes.set(hash, count + 1);

        if (count > 0) { // This line appears more than once
          duplicatedLines++;
        }
      }
    }

    return duplicatedLines;
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  private getCoverageForFile(filePath: string, language: string): number | undefined {
    // In a real implementation, this would integrate with coverage tools
    // For now, return undefined to indicate coverage data not available
    return undefined;
  }

  private identifyIssues(content: string, language: string): string[] {
    const errors: string[] = [];

    // Basic issue detection
    if (language === 'javascript' || language === 'typescript') {
      // Check for console.log in production code
      if (content.includes('console.log') && !content.includes('// TODO') && !content.includes('// FIXME')) {
        errors.push('console.log found - consider removing for production');
      }

      // Check for TODO/FIXME comments
      const todoMatches = content.match(/\/\/\s*(TODO|FIXME)/gi);
      if (todoMatches) {
        errors.push(`${todoMatches.length} TODO/FIXME comments found`);
      }

      // Check for empty catch blocks
      if (content.includes('catch') && content.includes('{}')) {
        errors.push('Empty catch block found');
      }
    }

    // Language-agnostic checks
    // Check for very long lines
    const lines = content.split('\n');
    const longLines = lines.filter(line => line.length > 120);
    if (longLines.length > 0) {
      errors.push(`${longLines.length} lines exceed 120 characters`);
    }

    // Check for multiple consecutive empty lines
    let consecutiveEmpty = 0;
    for (const line of lines) {
      if (line.trim() === '') {
        consecutiveEmpty++;
        if (consecutiveEmpty > 2) {
          errors.push('Multiple consecutive empty lines found');
          break;
        }
      } else {
        consecutiveEmpty = 0;
      }
    }

    return errors;
  }

  private calculateDimensions(fileResults: FileQualityResult[], testResults: any[]): QualityDimensions {
    // Complexity metrics
    const complexities = fileResults
      .map(r => r.complexity)
      .filter(c => c !== undefined) as number[];

    const complexityMetrics: ComplexityMetrics = {
      average: complexities.length > 0 ? complexities.reduce((a, b) => a + b, 0) / complexities.length : 0,
      max: complexities.length > 0 ? Math.max(...complexities) : 0,
      files_above_threshold: complexities.filter(c => c > 10).length
    };

    // Duplication metrics
    const totalDuplicatedLines = fileResults.reduce((sum, r) => sum + (r.duplicated_lines || 0), 0);
    const totalLines = fileResults.reduce((sum, r) => sum + (r.lines || 0), 0);

    const duplicationMetrics: DuplicationMetrics = {
      duplicated_lines: totalDuplicatedLines,
      duplication_percentage: totalLines > 0 ? (totalDuplicatedLines / totalLines) * 100 : 0,
      blocks: Math.floor(totalDuplicatedLines / 5) // Rough estimate of duplication blocks
    };

    // Coverage metrics (simplified)
    const coverageValues = fileResults
      .map(r => r.coverage)
      .filter(c => c !== undefined) as number[];

    const coverageMetrics: CoverageMetrics | null = coverageValues.length > 0 ? {
      average: coverageValues.reduce((a, b) => a + b, 0) / coverageValues.length,
      min: Math.min(...coverageValues),
      files_below_threshold: coverageValues.filter(c => c < 80).length
    } : null;

    // Maintainability metrics
    const maintainabilityIndex = this.calculateMaintainabilityIndex(complexityMetrics, duplicationMetrics, coverageMetrics);

    const maintainabilityFactors: MaintainabilityFactors = {
      complexity_impact: Math.max(0, 100 - (complexityMetrics.average * 2)),
      duplication_impact: Math.max(0, 100 - duplicationMetrics.duplication_percentage)
    };

    const maintainabilityMetrics: MaintainabilityMetrics = {
      index: maintainabilityIndex,
      grade: this.getMaintainabilityGrade(maintainabilityIndex),
      factors: maintainabilityFactors
    };

    return {
      complexity: complexityMetrics,
      duplication: duplicationMetrics,
      coverage: coverageMetrics,
      maintainability: maintainabilityMetrics
    };
  }

  private calculateMaintainabilityIndex(
    complexity: ComplexityMetrics,
    duplication: DuplicationMetrics,
    coverage: CoverageMetrics | null
  ): number {
    // Simplified maintainability index calculation
    // Based on Microsoft Maintainability Index formula (simplified)
    let index = 171;

    // Complexity factor
    index -= complexity.average * 0.2;

    // Duplication factor
    index -= duplication.duplication_percentage * 0.5;

    // Coverage factor (if available)
    if (coverage) {
      index += (coverage.average - 50) * 0.3; // Bonus for good coverage
    }

    // Ensure index is between 0 and 171
    return Math.max(0, Math.min(171, index));
  }

  private getMaintainabilityGrade(index: number): string {
    if (index >= 131) return 'A';
    if (index >= 101) return 'B';
    if (index >= 71) return 'C';
    if (index >= 51) return 'D';
    return 'F';
  }

  private identifyHotspots(fileResults: FileQualityResult[]): QualityHotspot[] {
    const hotspots: QualityHotspot[] = [];

    for (const result of fileResults) {
      const issues: string[] = [];

      // Complexity hotspot
      if ((result.complexity || 0) > 15) {
        issues.push(`High complexity (${result.complexity})`);
      }

      // Duplication hotspot
      if ((result.duplicated_lines || 0) > result.lines! * 0.2) {
        issues.push(`High duplication (${result.duplicated_lines} lines)`);
      }

      // Coverage hotspot
      if (result.coverage !== undefined && result.coverage < 60) {
        issues.push(`Low coverage (${result.coverage}%)`);
      }

      // Error hotspot
      if (result.errors && result.errors.length > 0) {
        issues.push(...result.errors);
      }

      if (issues.length > 0) {
        const severity = this.calculateHotspotSeverity(issues);
        const priority = this.calculateHotspotPriority(issues);

        hotspots.push({
          file: result.file_path,
          issues,
          severity,
          priority
        });
      }
    }

    // Sort by severity and priority
    hotspots.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };

      const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
      if (severityDiff !== 0) return severityDiff;

      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });

    return hotspots.slice(0, 20); // Return top 20 hotspots
  }

  private calculateHotspotSeverity(issues: string[]): 'low' | 'medium' | 'high' | 'critical' {
    if (issues.some(i => i.includes('critical') || i.includes('security'))) return 'critical';
    if (issues.some(i => i.includes('high') || i.includes('complexity') && issues.length > 2)) return 'high';
    if (issues.some(i => i.includes('medium') || issues.length > 1)) return 'medium';
    return 'low';
  }

  private calculateHotspotPriority(issues: string[]): 'low' | 'medium' | 'high' | 'urgent' {
    if (issues.some(i => i.includes('security') || i.includes('critical'))) return 'urgent';
    if (issues.some(i => i.includes('complexity') || i.includes('coverage') && issues.length > 2)) return 'high';
    if (issues.length > 1) return 'medium';
    return 'low';
  }

  private generateRecommendations(
    fileResults: FileQualityResult[],
    dimensions: QualityDimensions
  ): QualityRecommendation[] {
    const recommendations: QualityRecommendation[] = [];

    // Complexity recommendations
    if (dimensions.complexity.files_above_threshold > 0) {
      recommendations.push({
        category: 'complexity',
        title: `Refactor ${dimensions.complexity.files_above_threshold} files with high complexity`,
        description: `${dimensions.complexity.files_above_threshold} files have complexity > 10. Consider breaking down complex functions.`,
        actions: [
          'Extract methods from complex functions',
          'Apply Single Responsibility Principle',
          'Consider using design patterns to reduce complexity'
        ],
        priority: 'high'
      });
    }

    // Coverage recommendations
    if (dimensions.coverage && dimensions.coverage.files_below_threshold > 0) {
      recommendations.push({
        category: 'coverage',
        title: `Improve test coverage for ${dimensions.coverage.files_below_threshold} files`,
        description: `${dimensions.coverage.files_below_threshold} files have coverage below 80%. Add more tests.`,
        actions: [
          'Write unit tests for uncovered code',
          'Add integration tests for complex logic',
          'Consider using test-driven development'
        ],
        priority: 'medium'
      });
    }

    // Duplication recommendations
    if (dimensions.duplication.duplication_percentage > 20) {
      recommendations.push({
        category: 'duplication',
        title: `Reduce code duplication (${dimensions.duplication.duplication_percentage.toFixed(1)}%)`,
        description: `High code duplication detected. Extract common code into shared functions or classes.`,
        actions: [
          'Extract duplicate code into utility functions',
          'Create base classes or mixins',
          'Use composition over inheritance where appropriate'
        ],
        priority: 'medium'
      });
    }

    // Hotspot recommendations
    const criticalHotspots = fileResults.filter(r =>
      (r.complexity || 0) > 20 || (r.duplicated_lines || 0) > (r.lines || 0) * 0.5
    );

    if (criticalHotspots.length > 0) {
      recommendations.push({
        category: 'hotspot',
        title: `Address ${criticalHotspots.length} critical quality hotspots`,
        description: `${criticalHotspots.length} files have critical quality issues that need immediate attention.`,
        actions: [
          'Prioritize refactoring of hotspot files',
          'Schedule code review for hotspot files',
          'Consider pair programming for complex hotspots'
        ],
        priority: 'urgent'
      });
    }

    return recommendations;
  }

  private calculateOverallScore(dimensions: QualityDimensions): number {
    let score = 100;

    // Complexity impact
    score -= (dimensions.complexity.average / 10) * 10;

    // Duplication impact
    score -= dimensions.duplication.duplication_percentage * 0.5;

    // Coverage bonus/penalty
    if (dimensions.coverage) {
      if (dimensions.coverage.average >= 80) {
        score += 10;
      } else if (dimensions.coverage.average < 60) {
        score -= 15;
      }
    }

    // Maintainability impact
    const maintainabilityBonus = (dimensions.maintainability.index / 171) * 20;
    score += maintainabilityBonus;

    return Math.max(0, Math.min(100, score));
  }
}