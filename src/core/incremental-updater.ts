import * as fs from 'fs/promises';
import * as path from 'path';
import { DuckDBManager, FileInfo, SymbolInfo, DependencyInfo } from '@/core/duckdb-manager.js';
import { SymbolExtractor, SymbolExtractionResult } from '@/core/symbol-extractor.js';
import { logInfo, logError } from '@/services/logger-service.js';
import { promisifyRun, promisifyAll, promisifyGet } from '@/utils/duckdb-promisify.js';

export interface ChangeDetectionResult {
  changedFiles: string[];
  newFiles: string[];
  deletedFiles: string[];
  unchangedFiles: string[];
}

export interface UpdateResult {
  processed: number;
  skipped: number;
  errors: number;
  duration_ms: number;
  start_time: number;
  details: {
    processed_files: string[];
    errors: Array<{ file: string; error: string }>;
  };
}

export interface FileChangeType {
  type: 'modified' | 'new' | 'deleted' | 'unchanged';
  lastModified?: Date;
  checksum?: string;
  size?: number;
}

export interface DependencyTracker {
  trackFile(filePath: string): Promise<void>;
  getDependencies(filePath: string): Promise<string[]>;
  updateDependencies(filePath: string, dependencies: string[]): Promise<void>;
}

interface ExtractedDependency {
  file: string;
  type: string;
  symbol: string | null;
}

/**
 * Incremental Updater for efficient project indexing
 * Handles change detection, dependency tracking, and transaction-safe updates
 */
export class IncrementalUpdater {
  private dependencyTracker: DependencyTracker;

  constructor(
    private duckdbManager: DuckDBManager,
    private symbolExtractor: SymbolExtractor,
    dependencyTracker?: DependencyTracker
  ) {
    this.dependencyTracker = dependencyTracker || new SimpleDependencyTracker(duckdbManager);
  }

  /**
   * Update index for changed files with transaction safety
   */
  async updateIndex(changedFiles: string[]): Promise<UpdateResult> {
    const connection = this.duckdbManager.getConnection();

    try {
      await  promisifyRun(connection,'BEGIN TRANSACTION');

      const results: UpdateResult = {
        processed: 0,
        skipped: 0,
        errors: 0,
        start_time: Date.now(),
        duration_ms: 0,
        details: {
          processed_files: [],
          errors: []
        }
      };

      logInfo('Starting incremental index update', { filesCount: changedFiles.length });

      for (const filePath of changedFiles) {
        try {
          const changeType = await this.detectFileChange(filePath);

          if (changeType === 'deleted') {
            await this.removeFileFromIndex(connection, filePath);
            results.processed++;
            results.details.processed_files.push(filePath);
            logInfo('Removed deleted file from index', { filePath });

          } else if (changeType === 'modified') {
            await this.updateFileInIndex(connection, filePath);
            results.processed++;
            results.details.processed_files.push(filePath);
            logInfo('Updated modified file in index', { filePath });

          } else if (changeType === 'new') {
            await this.addFileToIndex(connection, filePath);
            results.processed++;
            results.details.processed_files.push(filePath);
            logInfo('Added new file to index', { filePath });

          } else {
            results.skipped++;
            logInfo('Skipped unchanged file', { filePath });
          }

          // Update dependencies for affected files
          await this.updateAffectedDependencies(connection, filePath);

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          results.errors++;
          results.details.errors.push({ file: filePath, error: errorMessage });
          logError('Error updating file in index', { filePath, error: errorMessage });
        }
      }

      // Update metadata
      await this.updateMetadata(connection, results);

      await  promisifyRun(connection,'COMMIT');

      results.duration_ms = Date.now() - results.start_time;

      logInfo('Incremental index update completed', {
        processed: results.processed,
        skipped: results.skipped,
        errors: results.errors,
        durationMs: results.duration_ms
      });

      return results;

    } catch (error) {
      await  promisifyRun(connection,'ROLLBACK');
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError('Incremental update failed, rolled back', { error: errorMessage });
      throw new Error(`Incremental update failed: ${errorMessage}`);
    } finally {
      connection.close();
    }
  }

  /**
   * Detect changes across the entire project
   */
  async detectProjectChanges(projectRoot: string): Promise<ChangeDetectionResult> {
    const result: ChangeDetectionResult = {
      changedFiles: [],
      newFiles: [],
      deletedFiles: [],
      unchangedFiles: []
    };

    try {
      // Get all files from filesystem
      const allFiles = await this.getAllProjectFiles(projectRoot);

      // Get all indexed files
      const indexedFiles = await this.getIndexedFiles();

      // Create maps for efficient lookup
      const indexedMap = new Map(indexedFiles.map(f => [f.file_path, f]));
      const filesystemMap = new Map(allFiles.map(f => [f, true]));

      // Check for new and modified files
      for (const filePath of allFiles) {
        const indexed = indexedMap.get(filePath);

        if (!indexed) {
          result.newFiles.push(filePath);
        } else {
          const changeType = await this.detectFileChange(filePath);
          if (changeType === 'modified') {
            result.changedFiles.push(filePath);
          } else {
            result.unchangedFiles.push(filePath);
          }
        }
      }

      // Check for deleted files
      for (const indexed of indexedFiles) {
        if (!filesystemMap.has(indexed.file_path)) {
          result.deletedFiles.push(indexed.file_path);
        }
      }

      logInfo('Project change detection completed', {
        new: result.newFiles.length,
        modified: result.changedFiles.length,
        deleted: result.deletedFiles.length,
        unchanged: result.unchangedFiles.length
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError('Project change detection failed', { error: errorMessage });
      throw new Error(`Change detection failed: ${errorMessage}`);
    }

    return result;
  }

  /**
   * Perform bulk update with optimized batch processing
   */
  async bulkUpdate(files: string[], batchSize = 10): Promise<UpdateResult> {
    const batches: string[][] = [];
    for (let i = 0; i < files.length; i += batchSize) {
      batches.push(files.slice(i, i + batchSize));
    }

    const totalResult: UpdateResult = {
      processed: 0,
      skipped: 0,
      errors: 0,
      start_time: Date.now(),
      duration_ms: 0,
      details: {
        processed_files: [],
        errors: []
      }
    };

    logInfo('Starting bulk update', { totalFiles: files.length, batchSize, batchesCount: batches.length });

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      logInfo(`Processing batch ${i + 1}/${batches.length}`, { batchSize: batch.length });

      try {
        const batchResult = await this.updateIndex(batch);

        totalResult.processed += batchResult.processed;
        totalResult.skipped += batchResult.skipped;
        totalResult.errors += batchResult.errors;
        totalResult.details.processed_files.push(...batchResult.details.processed_files);
        totalResult.details.errors.push(...batchResult.details.errors);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logError('Batch update failed', { batchIndex: i, error: errorMessage });
        totalResult.errors += batch.length;
      }
    }

    totalResult.duration_ms = Date.now() - totalResult.start_time;

    logInfo('Bulk update completed', {
      totalProcessed: totalResult.processed,
      totalSkipped: totalResult.skipped,
      totalErrors: totalResult.errors,
      totalDurationMs: totalResult.duration_ms
    });

    return totalResult;
  }

  /**
   * Update dependencies when a file changes
   */
  private async updateAffectedDependencies(connection: any, changedFile: string): Promise<void> {
    try {
      // Get files that depend on the changed file
      const dependentFiles = await  promisifyAll(connection,`
        SELECT DISTINCT from_file
        FROM dependencies
        WHERE to_file = ?
      `, [changedFile]);

      // Re-analyze dependencies for affected files
      for (const row of dependentFiles) {
        const dependentFile = row.from_file;
        try {
          await this.updateFileDependencies(connection, dependentFile);
          logInfo('Updated dependencies for affected file', { changedFile, dependentFile });
        } catch (error) {
          logError('Failed to update dependencies for affected file', {
            changedFile,
            dependentFile,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

    } catch (error) {
      logError('Failed to update affected dependencies', {
        changedFile,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Update file dependencies in database
   */
  private async updateFileDependencies(connection: any, filePath: string): Promise<void> {
    // Remove old dependencies
    await  promisifyRun(connection,'DELETE FROM dependencies WHERE from_file = ?', [filePath]);

    // Extract new dependencies
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const dependencies = await this.extractDependencies(filePath, content);

      // Insert new dependencies
      for (const dep of dependencies) {
        await  promisifyRun(connection,`
          INSERT INTO dependencies
          (id, from_file, to_file, dependency_type, symbol_name)
          VALUES (?, ?, ?, ?, ?)
        `, [
          this.generateDependencyId(filePath, dep),
          filePath,
          dep.file,
          dep.type,
          dep.symbol
        ]);
      }

    } catch (error) {
      logError('Failed to extract dependencies', {
        filePath,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // ===== Private Helper Methods =====

  private async detectFileChange(filePath: string): Promise<FileChangeType['type']> {
    try {
      // Check if file exists
      await fs.access(filePath);
    } catch {
      return 'deleted';
    }

    // Get current file stats
    const stats = await fs.stat(filePath);
    const currentChecksum = await this.calculateChecksum(filePath);

    // Get indexed file info
    const connection = this.duckdbManager.getConnection();
    try {
      const result = await  promisifyAll(connection,`
        SELECT last_modified, checksum
        FROM files
        WHERE file_path = ?
      `, [filePath]);

      if (result.length === 0) {
        return 'new';
      }

      const indexed = result[0];
      const indexedModified = new Date(indexed.last_modified);
      const currentModified = new Date(stats.mtime);

      // Compare checksums for more accurate change detection
      if (indexed.checksum !== currentChecksum) {
        return 'modified';
      }

      // Fallback to timestamp comparison
      if (Math.abs(currentModified.getTime() - indexedModified.getTime()) > 1000) {
        return 'modified';
      }

      return 'unchanged';

    } finally {
      connection.close();
    }
  }

  private async removeFileFromIndex(connection: any, filePath: string): Promise<void> {
    // Remove in correct order due to foreign key constraints
    await  promisifyRun(connection,'DELETE FROM dependencies WHERE from_file = ? OR to_file = ?', [filePath, filePath]);
    await  promisifyRun(connection,'DELETE FROM metrics WHERE file_path = ?', [filePath]);
    await  promisifyRun(connection,'DELETE FROM symbols WHERE file_path = ?', [filePath]);
    await  promisifyRun(connection,'DELETE FROM todos WHERE file_path = ?', [filePath]);
    await  promisifyRun(connection,'DELETE FROM files WHERE file_path = ?', [filePath]);
  }

  private async updateFileInIndex(connection: any, filePath: string): Promise<void> {
    // Remove old data
    await this.removeFileFromIndex(connection, filePath);

    // Re-index file
    await this.addFileToIndex(connection, filePath);
  }

  private async addFileToIndex(connection: any, filePath: string): Promise<void> {
    try {
      // Read file content
      const content = await fs.readFile(filePath, 'utf8');
      const stats = await fs.stat(filePath);

      // Create file info
      const fileInfo: FileInfo = {
        file_path: filePath,
        file_name: path.basename(filePath),
        directory: path.dirname(filePath),
        extension: path.extname(filePath),
        language: this.detectLanguage(filePath),
        size_bytes: stats.size,
        lines_count: content.split('\n').length,
        last_modified: stats.mtime,
        checksum: await this.calculateChecksum(filePath)
      };

      // Insert file info
      await  promisifyRun(connection,`
        INSERT INTO files
        (file_path, file_name, directory, extension, language, size_bytes, lines_count, last_modified, checksum)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        fileInfo.file_path,
        fileInfo.file_name,
        fileInfo.directory,
        fileInfo.extension,
        fileInfo.language,
        fileInfo.size_bytes,
        fileInfo.lines_count,
        fileInfo.last_modified.toISOString(),
        fileInfo.checksum
      ]);

      // Extract and insert symbols
      const extractionResult = await this.symbolExtractor.extractSymbols(filePath, content);
      for (const symbol of extractionResult.symbols) {
        await  promisifyRun(connection,`
          INSERT INTO symbols
          (id, name, type, file_path, line_number, signature, visibility, complexity, language, metadata)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          symbol.id,
          symbol.name,
          symbol.type,
          symbol.file_path,
          symbol.line_number,
          symbol.signature || null,
          symbol.visibility || null,
          symbol.complexity || null,
          symbol.language,
          symbol.metadata ? JSON.stringify(symbol.metadata) : null
        ]);
      }

      // Extract and insert dependencies
      const dependencies = await this.extractDependencies(filePath, content);
      for (const dep of dependencies) {
        await  promisifyRun(connection,`
          INSERT INTO dependencies
          (id, from_file, to_file, dependency_type, symbol_name)
          VALUES (?, ?, ?, ?, ?)
        `, [
          this.generateDependencyId(filePath, dep),
          filePath,
          dep.file,
          dep.type,
          dep.symbol
        ]);
      }

    } catch (error) {
      logError('Failed to add file to index', {
        filePath,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  private async updateMetadata(connection: any, results: UpdateResult): Promise<void> {
    const metadata = {
      last_incremental_update: new Date().toISOString(),
      update_stats: {
        processed: results.processed,
        skipped: results.skipped,
        errors: results.errors,
        duration_ms: results.duration_ms
      }
    };

    await this.duckdbManager.setMetadata('incremental_update', metadata);
  }

  private async getAllProjectFiles(projectRoot: string): Promise<string[]> {
    const files: string[] = [];

    async function scanDir(dir: string): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Skip common ignore patterns
          if (!['node_modules', '.git', 'build', 'dist', '.gibrun'].includes(entry.name)) {
            await scanDir(fullPath);
          }
        } else if (entry.isFile()) {
          // Only include source files
          const ext = path.extname(entry.name).toLowerCase();
          if (['.go', '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.cpp', '.c', '.rs', '.php', '.rb'].includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    }

    await scanDir(projectRoot);
    return files;
  }

  private async getIndexedFiles(): Promise<FileInfo[]> {
    const connection = this.duckdbManager.getConnection();

    try {
      const result = await  promisifyAll(connection,`
        SELECT file_path, file_name, directory, extension, language,
               size_bytes, lines_count, last_modified, checksum
        FROM files
      `);

      return result.map((row: any) => ({
        file_path: row.file_path,
        file_name: row.file_name,
        directory: row.directory,
        extension: row.extension,
        language: row.language,
        size_bytes: row.size_bytes,
        lines_count: row.lines_count,
        last_modified: new Date(row.last_modified),
        checksum: row.checksum
      }));

    } finally {
      connection.close();
    }
  }

  private async calculateChecksum(filePath: string): Promise<string> {
    const crypto = await import('crypto');
    const content = await fs.readFile(filePath);
    return crypto.default.createHash('md5').update(content).digest('hex');
  }

  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const languageMap: { [key: string]: string } = {
      '.go': 'go',
      '.js': 'javascript',
      '.ts': 'typescript',
      '.jsx': 'javascript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.java': 'java',
      '.cpp': 'cpp',
      '.c': 'c',
      '.rs': 'rust',
      '.php': 'php',
      '.rb': 'ruby'
    };

    return languageMap[ext] || 'unknown';
  }

  private async extractDependencies(filePath: string, content: string): Promise<ExtractedDependency[]> {
    // Simple dependency extraction - in real implementation, use language-specific parsers
    const dependencies: ExtractedDependency[] = [];
    const language = this.detectLanguage(filePath);

    if (language === 'go') {
      // Extract Go imports
      const importRegex = /^import\s+["(]([^")]+)[")]/gm;
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        dependencies.push({
          file: match[1],
          type: 'import',
          symbol: null
        });
      }
    }

    return dependencies;
  }

  private generateDependencyId(fromFile: string, dep: any): string {
    return `dep_${fromFile}_${dep.file}_${dep.type}_${Date.now()}`;
  }
}

/**
 * Simple dependency tracker implementation
 */
class SimpleDependencyTracker implements DependencyTracker {
  constructor(private duckdbManager: DuckDBManager) {}

  async trackFile(filePath: string): Promise<void> {
    // Implementation for tracking file dependencies
  }

  async getDependencies(filePath: string): Promise<string[]> {
    const connection = this.duckdbManager.getConnection();

    try {
      const result = await  promisifyAll(connection,`
        SELECT DISTINCT to_file
        FROM dependencies
        WHERE from_file = ?
      `, [filePath]);

      return result.map((row: any) => row.to_file);

    } finally {
      connection.close();
    }
  }

  async updateDependencies(filePath: string, dependencies: string[]): Promise<void> {
    const connection = this.duckdbManager.getConnection();

    try {
      await  promisifyRun(connection,'BEGIN TRANSACTION');

      // Remove old dependencies
      await  promisifyRun(connection,'DELETE FROM dependencies WHERE from_file = ?', [filePath]);

      // Add new dependencies
      for (const dep of dependencies) {
        await  promisifyRun(connection,`
          INSERT INTO dependencies
          (id, from_file, to_file, dependency_type)
          VALUES (?, ?, ?, ?)
        `, [
          `dep_${filePath}_${dep}_${Date.now()}`,
          filePath,
          dep,
          'reference'
        ]);
      }

      await  promisifyRun(connection,'COMMIT');

    } catch (error) {
      await  promisifyRun(connection,'ROLLBACK');
      throw error;
    } finally {
      connection.close();
    }
  }
}