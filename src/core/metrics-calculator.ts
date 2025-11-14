import * as path from 'path';
import { DuckDBManager, MetricData } from '@/core/duckdb-manager.js';
import { SymbolExtractor, SymbolExtractionResult } from '@/core/symbol-extractor.js';
import { logInfo, logError } from '@/services/logger-service.js';

export interface MetricsCalculationOptions {
  includeComplexity?: boolean;
  includeQuality?: boolean;
  includeCoverage?: boolean;
  includeDuplication?: boolean;
  customMetrics?: { [key: string]: any };
}

export interface FileMetrics {
  file_path: string;
  lines_count: number;
  complexity: number;
  quality_score: number;
  duplication_percentage: number;
  coverage_percentage?: number;
  maintainability_index: number;
  technical_debt_hours: number;
  custom_metrics?: { [key: string]: number };
}

export interface SymbolMetrics {
  symbol_id: string;
  file_path: string;
  complexity: number;
  quality_score: number;
  test_coverage?: number;
  usage_count: number;
  maintainability_index: number;
}

export interface MetricsCalculationResult {
  fileMetrics: FileMetrics;
  symbolMetrics: SymbolMetrics[];
  errors: string[];
  processingTime: number;
}

/**
 * Metrics Calculator for code analysis
 * Calculates complexity, quality, and other code metrics
 */
export class MetricsCalculator {
  constructor(
    private duckdbManager: DuckDBManager,
    private symbolExtractor: SymbolExtractor
  ) {}

  /**
   * Calculate metrics for a single file
   */
  async calculateFileMetrics(
    filePath: string,
    content: string,
    options: MetricsCalculationOptions = {}
  ): Promise<MetricsCalculationResult> {
    const startTime = Date.now();
    const result: MetricsCalculationResult = {
      fileMetrics: {} as FileMetrics,
      symbolMetrics: [],
      errors: [],
      processingTime: 0
    };

    try {
      // Extract symbols first
      const extractionResult = await this.symbolExtractor.extractSymbols(filePath, content);
      if (extractionResult.errors.length > 0) {
        result.errors.push(...extractionResult.errors);
      }

      // Calculate file-level metrics
      const fileMetrics = await this.calculateFileLevelMetrics(
        filePath,
        content,
        extractionResult.symbols,
        options
      );

      // Calculate symbol-level metrics
      const symbolMetrics = await this.calculateSymbolLevelMetrics(
        extractionResult.symbols,
        options
      );

      result.fileMetrics = fileMetrics;
      result.symbolMetrics = symbolMetrics;

      // Store metrics in database
      await this.storeMetrics(fileMetrics, symbolMetrics);

      logInfo('Metrics calculated successfully', {
        filePath,
        symbolsCount: extractionResult.symbols.length,
        processingTime: Date.now() - startTime
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push(`Metrics calculation failed: ${errorMessage}`);
      logError('Metrics calculation failed', { filePath, error: errorMessage });
    }

    result.processingTime = Date.now() - startTime;
    return result;
  }

  /**
   * Calculate file-level metrics
   */
  private async calculateFileLevelMetrics(
    filePath: string,
    content: string,
    symbols: any[],
    options: MetricsCalculationOptions
  ): Promise<FileMetrics> {
    const lines = content.split('\n');
    const language = this.detectLanguage(filePath);

    // Basic metrics
    const linesCount = lines.length;
    const nonEmptyLines = lines.filter(line => line.trim().length > 0).length;

    // Complexity calculation
    let complexity = 1;
    if (options.includeComplexity !== false) {
      complexity = this.calculateFileComplexity(content, language);
    }

    // Quality metrics
    let qualityScore = 100;
    if (options.includeQuality !== false) {
      qualityScore = this.calculateQualityScore(content, language, symbols);
    }

    // Duplication detection
    let duplicationPercentage = 0;
    if (options.includeDuplication !== false) {
      duplicationPercentage = this.calculateDuplicationPercentage(content);
    }

    // Coverage (placeholder - would integrate with test runner)
    let coveragePercentage: number | undefined;
    if (options.includeCoverage) {
      coveragePercentage = await this.getCoverageForFile(filePath);
    }

    // Maintainability index
    const maintainabilityIndex = this.calculateMaintainabilityIndex(
      complexity,
      qualityScore,
      duplicationPercentage,
      coveragePercentage
    );

    // Technical debt estimation
    const technicalDebtHours = this.estimateTechnicalDebt(
      complexity,
      qualityScore,
      duplicationPercentage,
      linesCount
    );

    // Custom metrics
    const customMetrics: { [key: string]: number } = {};
    if (options.customMetrics) {
      for (const [key, config] of Object.entries(options.customMetrics)) {
        customMetrics[key] = this.calculateCustomMetric(key, config, content, symbols);
      }
    }

    return {
      file_path: filePath,
      lines_count: linesCount,
      complexity,
      quality_score: qualityScore,
      duplication_percentage: duplicationPercentage,
      coverage_percentage: coveragePercentage,
      maintainability_index: maintainabilityIndex,
      technical_debt_hours: technicalDebtHours,
      custom_metrics: Object.keys(customMetrics).length > 0 ? customMetrics : undefined
    };
  }

  /**
   * Calculate symbol-level metrics
   */
  private async calculateSymbolLevelMetrics(
    symbols: any[],
    options: MetricsCalculationOptions
  ): Promise<SymbolMetrics[]> {
    const symbolMetrics: SymbolMetrics[] = [];

    for (const symbol of symbols) {
      const metrics: SymbolMetrics = {
        symbol_id: symbol.id,
        file_path: symbol.file_path,
        complexity: symbol.complexity || 1,
        quality_score: this.calculateSymbolQualityScore(symbol),
        usage_count: await this.getSymbolUsageCount(symbol.id),
        maintainability_index: this.calculateSymbolMaintainabilityIndex(symbol)
      };

      // Add coverage if available
      if (options.includeCoverage) {
        metrics.test_coverage = await this.getSymbolCoverage(symbol.id);
      }

      symbolMetrics.push(metrics);
    }

    return symbolMetrics;
  }

  /**
   * Calculate file complexity based on language
   */
  private calculateFileComplexity(content: string, language: string): number {
    let complexity = 1;

    switch (language) {
      case 'go':
        complexity = this.calculateGoComplexity(content);
        break;
      case 'typescript':
      case 'javascript':
        complexity = this.calculateTSComplexity(content);
        break;
      case 'python':
        complexity = this.calculatePythonComplexity(content);
        break;
      case 'java':
        complexity = this.calculateJavaComplexity(content);
        break;
      default:
        complexity = this.calculateGenericComplexity(content);
    }

    return complexity;
  }

  /**
   * Calculate Go-specific complexity
   */
  private calculateGoComplexity(content: string): number {
    let complexity = 1;

    // Control flow statements
    const controlFlowPatterns = [
      /\bif\s+/g,
      /\belse\s+/g,
      /\bfor\s+/g,
      /\bswitch\s+/g,
      /\bcase\s+/g,
      /\bselect\s+/g,
      /\bgoroutine\s+/g,
      /\bgo\s+/g,
      /\bdefer\s+/g,
      /\bpanic\s+/g,
      /\brecover\s+/g
    ];

    for (const pattern of controlFlowPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    }

    // Functions and methods
    const funcMatches = content.match(/\bfunc\s+/g);
    if (funcMatches) {
      complexity += funcMatches.length;
    }

    // Channels and concurrency
    const chanMatches = content.match(/\bchan\s+/g);
    if (chanMatches) {
      complexity += chanMatches.length * 2; // Channels add complexity
    }

    return complexity;
  }

  /**
   * Calculate TypeScript/JavaScript complexity
   */
  private calculateTSComplexity(content: string): number {
    let complexity = 1;

    // Control flow statements
    const controlFlowPatterns = [
      /\bif\s*\(/g,
      /\belse\s+/g,
      /\bfor\s*\(/g,
      /\bwhile\s*\(/g,
      /\bdo\s*\{/g,
      /\bswitch\s*\(/g,
      /\bcatch\s*\(/g,
      /\bfinally\s*\{/g,
      /\bcase\s+/g,
      /\bdefault\s*:/g,
      /\?/g, // ternary operator
      /\b&&/g,
      /\b\|\|/g
    ];

    for (const pattern of controlFlowPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    }

    // Functions and methods
    const funcPatterns = [
      /\bfunction\s+\w+/g,
      /\bconst\s+\w+\s*=\s*\([^)]*\)\s*=>/g,
      /\b\w+\s*\([^)]*\)\s*\{/g, // method definitions
      /\basync\s+function/g,
      /\basync\s+\w+\s*\([^)]*\)/g
    ];

    for (const pattern of funcPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    }

    // Classes and inheritance
    const classMatches = content.match(/\bclass\s+/g);
    if (classMatches) {
      complexity += classMatches.length * 2; // Classes add complexity
    }

    return complexity;
  }

  /**
   * Calculate Python complexity
   */
  private calculatePythonComplexity(content: string): number {
    let complexity = 1;

    // Control flow statements
    const controlFlowPatterns = [
      /\bif\s+/g,
      /\belif\s+/g,
      /\belse\s*:/g,
      /\bfor\s+/g,
      /\bwhile\s+/g,
      /\btry\s*:/g,
      /\bexcept\s+/g,
      /\bfinally\s*:/g,
      /\bwith\s+/g,
      /\band\s+/g,
      /\bor\s+/g,
      /\bnot\s+/g
    ];

    for (const pattern of controlFlowPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    }

    // Functions and classes
    const funcMatches = content.match(/\bdef\s+/g);
    const classMatches = content.match(/\bclass\s+/g);

    if (funcMatches) complexity += funcMatches.length;
    if (classMatches) complexity += classMatches.length * 2;

    // List comprehensions and generators
    const comprehensionMatches = content.match(/\[\s*.*\s+for\s+/g);
    if (comprehensionMatches) {
      complexity += comprehensionMatches.length;
    }

    return complexity;
  }

  /**
   * Calculate Java complexity
   */
  private calculateJavaComplexity(content: string): number {
    let complexity = 1;

    // Control flow statements
    const controlFlowPatterns = [
      /\bif\s*\(/g,
      /\belse\s+/g,
      /\bfor\s*\(/g,
      /\bwhile\s*\(/g,
      /\bdo\s+/g,
      /\bswitch\s*\(/g,
      /\bcatch\s*\(/g,
      /\bfinally\s*\{/g,
      /\bcase\s+/g,
      /\bdefault\s*:/g,
      /\?/g, // ternary operator
      /\b&&/g,
      /\b\|\|/g
    ];

    for (const pattern of controlFlowPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    }

    // Methods and classes
    const methodMatches = content.match(/\b(public|private|protected)?\s+\w+\s+\w+\s*\(/g);
    const classMatches = content.match(/\bclass\s+/g);

    if (methodMatches) complexity += methodMatches.length;
    if (classMatches) complexity += classMatches.length * 2;

    // Annotations and generics
    const annotationMatches = content.match(/@\w+/g);
    if (annotationMatches) {
      complexity += Math.floor(annotationMatches.length / 5); // Reduce impact
    }

    return complexity;
  }

  /**
   * Calculate generic complexity for unsupported languages
   */
  private calculateGenericComplexity(content: string): number {
    let complexity = 1;

    // Basic control flow detection
    const controlFlowPatterns = [
      /\bif\b/g,
      /\belse\b/g,
      /\bfor\b/g,
      /\bwhile\b/g,
      /\bswitch\b/g,
      /\bcatch\b/g,
      /\btry\b/g
    ];

    for (const pattern of controlFlowPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    }

    return complexity;
  }

  /**
   * Calculate code quality score
   */
  private calculateQualityScore(content: string, language: string, symbols: any[]): number {
    let score = 100;

    // Check for code smells and reduce score
    const lines = content.split('\n');

    // Long methods/functions
    const longMethods = symbols.filter(s => s.complexity > 10);
    score -= longMethods.length * 5;

    // Long lines
    const longLines = lines.filter(line => line.length > 120);
    score -= longLines.length * 2;

    // Empty catch blocks
    const emptyCatches = content.match(/catch\s*\([^)]*\)\s*\{\s*\}/g);
    if (emptyCatches) {
      score -= emptyCatches.length * 10;
    }

    // TODO/FIXME comments
    const todos = content.match(/\/\/\s*(TODO|FIXME|XXX)/gi);
    if (todos) {
      score -= todos.length * 3;
    }

    // Magic numbers
    const magicNumbers = content.match(/\b\d{2,}\b/g);
    if (magicNumbers) {
      score -= Math.min(magicNumbers.length * 1, 20);
    }

    // Language-specific checks
    switch (language) {
      case 'javascript':
      case 'typescript':
        // Console.log in production code
        if (content.includes('console.log') && !content.includes('// DEBUG')) {
          score -= 5;
        }
        break;
      case 'go':
        // Missing error handling
        const errVars = content.match(/\berr\s*:?=/g);
        const errChecks = content.match(/if\s+err\s*!=/g);
        if (errVars && errChecks && errVars.length > errChecks.length) {
          score -= (errVars.length - errChecks.length) * 2;
        }
        break;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate code duplication percentage
   */
  private calculateDuplicationPercentage(content: string): number {
    const lines = content.split('\n');
    const lineHashes = new Map<string, number>();
    let duplicatedLines = 0;

    // Simple line-based duplication detection
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 10 && !trimmed.startsWith('//') && !trimmed.startsWith('#')) {
        const hash = this.simpleHash(trimmed);
        const count = lineHashes.get(hash) || 0;
        lineHashes.set(hash, count + 1);

        if (count > 0) {
          duplicatedLines++;
        }
      }
    }

    return lines.length > 0 ? (duplicatedLines / lines.length) * 100 : 0;
  }

  /**
   * Calculate maintainability index
   */
  private calculateMaintainabilityIndex(
    complexity: number,
    qualityScore: number,
    duplicationPercentage: number,
    coveragePercentage?: number
  ): number {
    // Microsoft Maintainability Index formula (simplified)
    let index = 171;

    // Complexity factor
    index -= complexity * 0.2;

    // Quality factor
    index -= (100 - qualityScore) * 0.5;

    // Duplication factor
    index -= duplicationPercentage * 0.3;

    // Coverage bonus
    if (coveragePercentage !== undefined) {
      index += (coveragePercentage - 50) * 0.2;
    }

    return Math.max(0, Math.min(171, index));
  }

  /**
   * Estimate technical debt in hours
   */
  private estimateTechnicalDebt(
    complexity: number,
    qualityScore: number,
    duplicationPercentage: number,
    linesCount: number
  ): number {
    let debtHours = 0;

    // Complexity debt
    if (complexity > 10) {
      debtHours += (complexity - 10) * 0.5;
    }

    // Quality debt
    if (qualityScore < 80) {
      debtHours += (100 - qualityScore) * 0.1;
    }

    // Duplication debt
    debtHours += duplicationPercentage * 0.2;

    // Size-based debt
    if (linesCount > 1000) {
      debtHours += (linesCount - 1000) / 100;
    }

    return Math.max(0, debtHours);
  }

  /**
   * Calculate symbol quality score
   */
  private calculateSymbolQualityScore(symbol: any): number {
    let score = 100;

    // Complexity penalty
    if (symbol.complexity > 5) {
      score -= (symbol.complexity - 5) * 5;
    }

    // Parameter count penalty
    const params = symbol.metadata?.parameters?.length || 0;
    if (params > 4) {
      score -= (params - 4) * 5;
    }

    // Naming quality
    if (symbol.name.length < 3) {
      score -= 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate symbol maintainability index
   */
  private calculateSymbolMaintainabilityIndex(symbol: any): number {
    const complexity = symbol.complexity || 1;
    const quality = this.calculateSymbolQualityScore(symbol);

    // Simple formula for symbol maintainability
    return Math.max(0, Math.min(100, 100 - complexity * 2 + quality * 0.5));
  }

  /**
   * Calculate custom metrics
   */
  private calculateCustomMetric(
    metricName: string,
    config: any,
    content: string,
    symbols: any[]
  ): number {
    const totalLines = content.split('\n').length;

    switch (metricName) {
      case 'comment_ratio':
        const commentLines = content.split('\n').filter(line =>
          line.trim().match(/^\/\//) || line.trim().match(/^#/) || line.trim().match(/^\/\*/)
        ).length;
        return totalLines > 0 ? (commentLines / totalLines) * 100 : 0;

      case 'function_density':
        const functions = symbols.filter(s => s.type === 'function').length;
        return totalLines > 0 ? (functions / totalLines) * 100 : 0;

      case 'average_function_length':
        const functionSymbols = symbols.filter(s => s.type === 'function');
        if (functionSymbols.length === 0) return 0;
        const totalLength = functionSymbols.reduce((sum, s) => sum + (s.metadata?.length || 0), 0);
        return totalLength / functionSymbols.length;

      default:
        return 0;
    }
  }

  /**
   * Get coverage for file (placeholder)
   */
  private async getCoverageForFile(filePath: string): Promise<number | undefined> {
    // This would integrate with test coverage tools
    // For now, return undefined
    return undefined;
  }

  /**
   * Get symbol usage count
   */
  private async getSymbolUsageCount(symbolId: string): Promise<number> {
    // This would analyze dependencies and references
    // For now, return a placeholder
    return 0;
  }

  /**
   * Get symbol test coverage
   */
  private async getSymbolCoverage(symbolId: string): Promise<number | undefined> {
    // This would integrate with coverage tools
    return undefined;
  }

  /**
   * Store metrics in database
   */
  private async storeMetrics(
    fileMetrics: FileMetrics,
    symbolMetrics: SymbolMetrics[]
  ): Promise<void> {
    const metrics: MetricData[] = [];
    const now = new Date();

    // File-level metrics
    metrics.push({
      id: `file_complexity_${fileMetrics.file_path}_${Date.now()}`,
      file_path: fileMetrics.file_path,
      metric_type: 'complexity',
      metric_name: 'cyclomatic_complexity',
      metric_value: fileMetrics.complexity,
      recorded_at: now,
      analysis_version: '1.0.0'
    });

    metrics.push({
      id: `file_quality_${fileMetrics.file_path}_${Date.now()}`,
      file_path: fileMetrics.file_path,
      metric_type: 'quality',
      metric_name: 'quality_score',
      metric_value: fileMetrics.quality_score,
      recorded_at: now,
      analysis_version: '1.0.0'
    });

    metrics.push({
      id: `file_maintainability_${fileMetrics.file_path}_${Date.now()}`,
      file_path: fileMetrics.file_path,
      metric_type: 'maintainability',
      metric_name: 'maintainability_index',
      metric_value: fileMetrics.maintainability_index,
      recorded_at: now,
      analysis_version: '1.0.0'
    });

    // Symbol-level metrics
    for (const symbolMetric of symbolMetrics) {
      metrics.push({
        id: `symbol_complexity_${symbolMetric.symbol_id}_${Date.now()}`,
        symbol_id: symbolMetric.symbol_id,
        file_path: symbolMetric.file_path,
        metric_type: 'complexity',
        metric_name: 'symbol_complexity',
        metric_value: symbolMetric.complexity,
        recorded_at: now,
        analysis_version: '1.0.0'
      });

      metrics.push({
        id: `symbol_quality_${symbolMetric.symbol_id}_${Date.now()}`,
        symbol_id: symbolMetric.symbol_id,
        file_path: symbolMetric.file_path,
        metric_type: 'quality',
        metric_name: 'symbol_quality_score',
        metric_value: symbolMetric.quality_score,
        recorded_at: now,
        analysis_version: '1.0.0'
      });
    }

    // Store all metrics
    for (const metric of metrics) {
      await this.duckdbManager.insertMetric(metric);
    }
  }

  /**
   * Detect programming language
   */
  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();

    const languageMap: { [key: string]: string } = {
      '.go': 'go',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.java': 'java',
      '.cpp': 'cpp',
      '.c': 'c'
    };

    return languageMap[ext] || 'unknown';
  }

  /**
   * Simple hash function for duplication detection
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }
}