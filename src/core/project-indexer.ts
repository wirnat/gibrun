import * as fs from 'fs/promises';
import * as path from 'path';
import { DuckDBManager } from '@core/duckdb-manager.js';
import { FileProcessor, FileProcessingResult, ChangeDetectionResult } from '@core/file-processor.js';
import { SymbolExtractor, SymbolExtractionResult } from '@core/symbol-extractor.js';
import { MetricsCalculator, MetricsCalculationResult } from '@core/metrics-calculator.js';
import { logInfo, logError } from '@/services/logger-service.js';
import { promisifyRun, promisifyAll, promisifyGet } from '@utils/duckdb-promisify.js';

export interface IndexingOptions {
  forceReindex?: boolean;
  includePatterns?: string[];
  excludePatterns?: string[];
  maxFileSize?: number;
  maxConcurrency?: number;
  includeMetrics?: boolean;
  includePrivateSymbols?: boolean;
  incrementalUpdate?: boolean;
}

export interface IndexingProgress {
  phase: 'discovery' | 'processing' | 'extraction' | 'metrics' | 'cleanup';
  processed: number;
  total: number;
  currentFile?: string;
  errors: string[];
  startTime: number;
  estimatedTimeRemaining?: number;
}

export interface IndexingResult {
  success: boolean;
  totalFiles: number;
  processedFiles: number;
  skippedFiles: number;
  errorFiles: number;
  totalSymbols: number;
  totalMetrics: number;
  duration: number;
  errors: string[];
  statistics: {
    languages: { [key: string]: number };
    fileTypes: { [key: string]: number };
    averageComplexity: number;
    totalLines: number;
  };
}

export type ProgressCallback = (progress: IndexingProgress) => void;

/**
 * Project Indexer - Orchestrates the complete DuckDB indexing process
 * Handles full project indexing and incremental updates
 */
export class ProjectIndexer {
  private fileProcessor: FileProcessor;
  private symbolExtractor: SymbolExtractor;
  private metricsCalculator: MetricsCalculator;

  constructor(
    private projectRoot: string,
    private duckdbManager: DuckDBManager
  ) {
    this.fileProcessor = new FileProcessor(projectRoot, duckdbManager);
    this.symbolExtractor = new SymbolExtractor();
    this.metricsCalculator = new MetricsCalculator(duckdbManager, this.symbolExtractor);
  }

  /**
   * Index entire project
   */
  async indexProject(
    options: IndexingOptions = {},
    progressCallback?: ProgressCallback
  ): Promise<IndexingResult> {
    const startTime = Date.now();
    const result: IndexingResult = {
      success: false,
      totalFiles: 0,
      processedFiles: 0,
      skippedFiles: 0,
      errorFiles: 0,
      totalSymbols: 0,
      totalMetrics: 0,
      duration: 0,
      errors: [],
      statistics: {
        languages: {},
        fileTypes: {},
        averageComplexity: 0,
        totalLines: 0
      }
    };

    try {
      logInfo('Starting project indexing', { projectRoot: this.projectRoot, options });

      // Phase 1: Discover files
      progressCallback?.({
        phase: 'discovery',
        processed: 0,
        total: 1,
        errors: [],
        startTime
      });

      const filePaths = await this.discoverFiles(options);
      result.totalFiles = filePaths.length;

      logInfo('File discovery completed', { fileCount: filePaths.length });

      // Phase 2: Process files
      progressCallback?.({
        phase: 'processing',
        processed: 0,
        total: filePaths.length,
        errors: [],
        startTime
      });

      const processingResults = await this.processFiles(filePaths, options, progressCallback);
      result.processedFiles = processingResults.filter(r => r.processed).length;
      result.skippedFiles = processingResults.filter(r => r.skipped).length;
      result.errorFiles = processingResults.filter(r => r.error).length;

      // Phase 3: Extract symbols and calculate metrics
      const changedFiles = processingResults
        .filter(r => r.processed && r.checksumChanged)
        .map(r => r.fileInfo.file_path);

      if (changedFiles.length > 0) {
        await this.extractSymbolsAndMetrics(changedFiles, options, progressCallback);
      }

      // Phase 4: Update statistics
      result.statistics = await this.calculateStatistics();
      result.totalSymbols = await this.getTotalSymbols();
      result.totalMetrics = await this.getTotalMetrics();

      result.success = result.errorFiles === 0;
      result.duration = Date.now() - startTime;

      logInfo('Project indexing completed', {
        success: result.success,
        processedFiles: result.processedFiles,
        totalSymbols: result.totalSymbols,
        duration: result.duration
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push(`Indexing failed: ${errorMessage}`);
      result.duration = Date.now() - startTime;
      logError('Project indexing failed', { error: errorMessage });
    }

    return result;
  }

  /**
   * Perform incremental update
   */
  async updateIncremental(
    changedFiles: string[],
    options: IndexingOptions = {},
    progressCallback?: ProgressCallback
  ): Promise<IndexingResult> {
    const startTime = Date.now();
    const result: IndexingResult = {
      success: false,
      totalFiles: changedFiles.length,
      processedFiles: 0,
      skippedFiles: 0,
      errorFiles: 0,
      totalSymbols: 0,
      totalMetrics: 0,
      duration: 0,
      errors: [],
      statistics: {
        languages: {},
        fileTypes: {},
        averageComplexity: 0,
        totalLines: 0
      }
    };

    try {
      logInfo('Starting incremental update', { fileCount: changedFiles.length });

      // Detect changes
      const changeResult = await this.fileProcessor.detectChanges(changedFiles, options);

      // Process changed/new files
      const filesToProcess = [...changeResult.changed, ...changeResult.new];
      if (filesToProcess.length > 0) {
        const processingResults = await this.processFiles(filesToProcess, options, progressCallback);
        result.processedFiles = processingResults.filter(r => r.processed).length;
        result.errorFiles = processingResults.filter(r => r.error).length;
      }

      // Clean up deleted files
      if (changeResult.deleted.length > 0) {
        await this.fileProcessor.cleanupDeletedFiles(changeResult.deleted);
        logInfo('Cleaned up deleted files', { count: changeResult.deleted.length });
      }

      // Extract symbols and metrics for changed files
      const changedRelativePaths = changeResult.changed.map(f =>
        path.relative(this.projectRoot, f)
      );

      if (changedRelativePaths.length > 0) {
        await this.extractSymbolsAndMetrics(changedRelativePaths, options, progressCallback);
      }

      // Update statistics
      result.statistics = await this.calculateStatistics();
      result.totalSymbols = await this.getTotalSymbols();
      result.totalMetrics = await this.getTotalMetrics();

      result.success = result.errorFiles === 0;
      result.duration = Date.now() - startTime;

      logInfo('Incremental update completed', {
        success: result.success,
        processedFiles: result.processedFiles,
        deletedFiles: changeResult.deleted.length,
        duration: result.duration
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push(`Incremental update failed: ${errorMessage}`);
      result.duration = Date.now() - startTime;
      logError('Incremental update failed', { error: errorMessage });
    }

    return result;
  }

  /**
   * Discover files to index
   */
  private async discoverFiles(options: IndexingOptions): Promise<string[]> {
    const files: string[] = [];
    const includePatterns = options.includePatterns || ['**/*'];
    const excludePatterns = options.excludePatterns || [];

    const walkDir = async (dir: string): Promise<void> => {
      try {
        const items = await fs.readdir(dir, { withFileTypes: true });

        for (const item of items) {
          const fullPath = path.join(dir, item.name);

          // Skip excluded patterns
          if (this.matchesExcludePattern(fullPath, excludePatterns)) {
            continue;
          }

          if (item.isDirectory()) {
            // Skip common directories
            if (this.shouldSkipDirectory(item.name)) {
              continue;
            }
            await walkDir(fullPath);
          } else if (item.isFile()) {
            // Check if file matches include patterns and is supported
            if (this.matchesIncludePattern(fullPath, includePatterns) &&
                this.isSupportedFile(fullPath)) {
              files.push(fullPath);
            }
          }
        }
      } catch (error) {
        // Skip directories we can't read
        logError('Failed to read directory', { dir, error });
      }
    };

    await walkDir(this.projectRoot);
    return files;
  }

  /**
   * Process files in batches
   */
  private async processFiles(
    filePaths: string[],
    options: IndexingOptions,
    progressCallback?: ProgressCallback
  ): Promise<FileProcessingResult[]> {
    const concurrency = options.maxConcurrency || 10;
    const batches = this.chunkArray(filePaths, concurrency);
    const allResults: FileProcessingResult[] = [];
    let processed = 0;

    for (const batch of batches) {
      const batchPromises = batch.map(async (filePath) => {
        try {
          const result = await this.fileProcessor.processFile(filePath, {
            forceReprocess: options.forceReindex,
            maxFileSize: options.maxFileSize
          });

          processed++;
          progressCallback?.({
            phase: 'processing',
            processed,
            total: filePaths.length,
            currentFile: filePath,
            errors: result.error ? [result.error] : [],
            startTime: Date.now()
          });

          return result;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logError('File processing failed', { filePath, error: errorMessage });

          processed++;
          progressCallback?.({
            phase: 'processing',
            processed,
            total: filePaths.length,
            currentFile: filePath,
            errors: [errorMessage],
            startTime: Date.now()
          });

          return {
            fileInfo: {} as any,
            processed: false,
            skipped: false,
            error: errorMessage,
            checksumChanged: false,
            processingTime: 0
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      allResults.push(...batchResults);
    }

    return allResults;
  }

  /**
   * Extract symbols and calculate metrics for files
   */
  private async extractSymbolsAndMetrics(
    filePaths: string[],
    options: IndexingOptions,
    progressCallback?: ProgressCallback
  ): Promise<void> {
    let processed = 0;

    for (const filePath of filePaths) {
      try {
        // Read file content
        const content = await fs.readFile(filePath, 'utf8');

        // Extract symbols
        progressCallback?.({
          phase: 'extraction',
          processed,
          total: filePaths.length,
          currentFile: filePath,
          errors: [],
          startTime: Date.now()
        });

        const extractionResult = await this.symbolExtractor.extractSymbols(
          filePath,
          content,
          {
            includePrivate: options.includePrivateSymbols,
            maxFileSize: options.maxFileSize
          }
        );

        // Store symbols
        for (const symbol of extractionResult.symbols) {
          await this.duckdbManager.upsertSymbol(symbol);
        }

        // Calculate metrics
        if (options.includeMetrics !== false) {
          progressCallback?.({
            phase: 'metrics',
            processed,
            total: filePaths.length,
            currentFile: filePath,
            errors: [],
            startTime: Date.now()
          });

          const metricsResult = await this.metricsCalculator.calculateFileMetrics(
            filePath,
            content,
            {
              includeComplexity: true,
              includeQuality: true,
              includeCoverage: false,
              includeDuplication: true
            }
          );

          if (metricsResult.errors.length > 0) {
            logError('Metrics calculation errors', {
              filePath,
              errors: metricsResult.errors
            });
          }
        }

        processed++;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logError('Symbol extraction/metrics failed', { filePath, error: errorMessage });
        processed++;
      }
    }
  }

  /**
   * Calculate project statistics
   */
  private async calculateStatistics(): Promise<{
    languages: { [key: string]: number };
    fileTypes: { [key: string]: number };
    averageComplexity: number;
    totalLines: number;
  }> {
    const connection = this.duckdbManager.getConnection();

    try {
      // Language distribution
      const languages = await  promisifyAll(connection,`
        SELECT language, COUNT(*) as count
        FROM files
        WHERE language IS NOT NULL
        GROUP BY language
        ORDER BY count DESC
      `);

      // File type distribution
      const fileTypes = await  promisifyAll(connection,`
        SELECT extension, COUNT(*) as count
        FROM files
        WHERE extension IS NOT NULL
        GROUP BY extension
        ORDER BY count DESC
      `);

      // Average complexity
      const complexityResult = await  promisifyAll(connection,`
        SELECT AVG(metric_value) as avg_complexity
        FROM metrics
        WHERE metric_type = 'complexity' AND metric_name = 'cyclomatic_complexity'
      `);

      // Total lines
      const linesResult = await  promisifyAll(connection,`
        SELECT SUM(lines_count) as total_lines
        FROM files
      `);

      const languageMap: { [key: string]: number } = {};
      languages.forEach((row: any) => {
        languageMap[row.language] = row.count;
      });

      const fileTypeMap: { [key: string]: number } = {};
      fileTypes.forEach((row: any) => {
        fileTypeMap[row.extension] = row.count;
      });

      return {
        languages: languageMap,
        fileTypes: fileTypeMap,
        averageComplexity: complexityResult[0]?.avg_complexity || 0,
        totalLines: linesResult[0]?.total_lines || 0
      };

    } finally {
      connection.close();
    }
  }

  /**
   * Get total symbols count
   */
  private async getTotalSymbols(): Promise<number> {
    const connection = this.duckdbManager.getConnection();

    try {
      const result = await  promisifyAll(connection,'SELECT COUNT(*) as count FROM symbols');
      return result[0]?.count || 0;
    } finally {
      connection.close();
    }
  }

  /**
   * Get total metrics count
   */
  private async getTotalMetrics(): Promise<number> {
    const connection = this.duckdbManager.getConnection();

    try {
      const result = await  promisifyAll(connection,'SELECT COUNT(*) as count FROM metrics');
      return result[0]?.count || 0;
    } finally {
      connection.close();
    }
  }

  /**
   * Check if file matches include patterns
   */
  private matchesIncludePattern(filePath: string, patterns: string[]): boolean {
    const relativePath = path.relative(this.projectRoot, filePath);

    for (const pattern of patterns) {
      if (this.matchesGlobPattern(relativePath, pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if file matches exclude patterns
   */
  private matchesExcludePattern(filePath: string, patterns: string[]): boolean {
    const relativePath = path.relative(this.projectRoot, filePath);

    for (const pattern of patterns) {
      if (this.matchesGlobPattern(relativePath, pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Simple glob pattern matching
   */
  private matchesGlobPattern(text: string, pattern: string): boolean {
    // Convert glob to regex
    const regex = pattern
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '.')
      .replace(/\./g, '\\.');

    return new RegExp(`^${regex}$`).test(text);
  }

  /**
   * Check if directory should be skipped
   */
  private shouldSkipDirectory(dirName: string): boolean {
    const skipDirs = [
      'node_modules',
      '.git',
      'dist',
      'build',
      '.next',
      '.nuxt',
      'coverage',
      '.nyc_output',
      'target', // Rust
      '__pycache__', // Python
      '.pytest_cache', // Python
      'vendor', // Go
      '.gradle', // Java
      'bin',
      'obj', // .NET
      '.vscode',
      '.idea',
      '.DS_Store'
    ];

    return skipDirs.includes(dirName);
  }

  /**
   * Check if file is supported for indexing
   */
  private isSupportedFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    const supportedExts = [
      '.go', '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.cpp', '.c', '.h',
      '.rs', '.rb', '.php', '.cs', '.scala', '.kt', '.swift'
    ];

    return supportedExts.includes(ext);
  }

  /**
   * Chunk array into smaller batches
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Get indexing status and statistics
   */
  async getIndexingStatus(): Promise<{
    isIndexed: boolean;
    lastIndexed?: Date;
    totalFiles: number;
    totalSymbols: number;
    totalMetrics: number;
    databaseSize: number;
  }> {
    const connection = this.duckdbManager.getConnection();

    try {
      const stats = await  promisifyAll(connection,`
        SELECT
          (SELECT COUNT(*) FROM files) as total_files,
          (SELECT COUNT(*) FROM symbols) as total_symbols,
          (SELECT COUNT(*) FROM metrics) as total_metrics,
          (SELECT MAX(updated_at) FROM files) as last_updated
      `);

      const dbSize = await this.getDatabaseSize();

      return {
        isIndexed: stats[0].total_files > 0,
        lastIndexed: stats[0].last_updated ? new Date(stats[0].last_updated) : undefined,
        totalFiles: stats[0].total_files || 0,
        totalSymbols: stats[0].total_symbols || 0,
        totalMetrics: stats[0].total_metrics || 0,
        databaseSize: dbSize
      };

    } finally {
      connection.close();
    }
  }

  /**
   * Get database size
   */
  private async getDatabaseSize(): Promise<number> {
    try {
      const dbPath = this.duckdbManager.getDatabasePath();
      const stats = await fs.stat(dbPath);
      return stats.size;
    } catch {
      return 0;
    }
  }

  /**
   * Clear index (for testing or reset)
   */
  async clearIndex(): Promise<void> {
    const connection = this.duckdbManager.getConnection();

    try {
      await  promisifyRun(connection,'DELETE FROM symbols');
      await  promisifyRun(connection,'DELETE FROM dependencies');
      await  promisifyRun(connection,'DELETE FROM metrics');
      await  promisifyRun(connection,'DELETE FROM files');
      await  promisifyRun(connection,'DELETE FROM todos');
      await  promisifyRun(connection,'DELETE FROM analysis_cache');

      logInfo('Index cleared successfully');
    } finally {
      connection.close();
    }
  }
}