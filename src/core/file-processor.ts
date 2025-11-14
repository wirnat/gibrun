import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { DuckDBManager, FileInfo } from '@core/duckdb-manager.js';
import { logInfo, logError } from '@/services/logger-service.js';
import { promisifyRun, promisifyAll, promisifyGet } from '@utils/duckdb-promisify.js';

export interface FileProcessingOptions {
  forceReprocess?: boolean;
  maxFileSize?: number;
  checksumOnly?: boolean;
  includeBinaryFiles?: boolean;
}

export interface FileProcessingResult {
  fileInfo: FileInfo;
  processed: boolean;
  skipped: boolean;
  error?: string;
  checksumChanged: boolean;
  processingTime: number;
}

export interface ChangeDetectionResult {
  changed: string[];
  unchanged: string[];
  new: string[];
  deleted: string[];
  errors: string[];
}

// Streaming file processor for large files
export class StreamingFileProcessor {
  private static readonly CHUNK_SIZE = 64 * 1024; // 64KB chunks
  private static readonly LARGE_FILE_THRESHOLD = 1024 * 1024; // 1MB

  /**
   * Read large files using streaming to avoid memory issues
   */
  static async readLargeFile(filePath: string): Promise<string> {
    const stats = await fs.stat(filePath);
    if (stats.size <= StreamingFileProcessor.LARGE_FILE_THRESHOLD) {
      // Use regular readFile for smaller files
      return await fs.readFile(filePath, 'utf8');
    }

    // Use streaming for large files
    return new Promise((resolve, reject) => {
      const chunks: string[] = [];
      const stream = fsSync.createReadStream(filePath, {
        highWaterMark: StreamingFileProcessor.CHUNK_SIZE,
        encoding: 'utf8'
      });

      stream.on('data', (chunk: string | Buffer) => {
        chunks.push(chunk.toString());
      });

      stream.on('end', () => {
        resolve(chunks.join(''));
      });

      stream.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Process large files with streaming and chunked operations
   */
  static async processLargeFile(
    filePath: string,
    processor: (chunk: string) => Promise<void>
  ): Promise<void> {
    const stats = await fs.stat(filePath);
    if (stats.size <= StreamingFileProcessor.LARGE_FILE_THRESHOLD) {
      // Process small files directly
      const content = await fs.readFile(filePath, 'utf8');
      await processor(content);
      return;
    }

    // Process large files with streaming
    return new Promise((resolve, reject) => {
      const stream = fsSync.createReadStream(filePath, {
        highWaterMark: StreamingFileProcessor.CHUNK_SIZE,
        encoding: 'utf8'
      });

      stream.on('data', async (chunk: string | Buffer) => {
        try {
          // Pause stream while processing chunk
          stream.pause();
          await processor(chunk.toString());
          stream.resume();
        } catch (error) {
          stream.destroy();
          reject(error);
        }
      });

      stream.on('end', () => {
        resolve();
      });

      stream.on('error', (error) => {
        reject(error);
      });
    });
  }
}

/**
 * File Processing Pipeline for DuckDB indexing
 * Handles file reading, checksum calculation, and change detection
 */
export class FileProcessor {
  private readonly supportedExtensions = [
    '.go', '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.cpp', '.c', '.h',
    '.rs', '.rb', '.php', '.cs', '.scala', '.kt', '.swift', '.m', '.mm'
  ];

  private readonly binaryExtensions = [
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.zip', '.tar', '.gz', '.7z', '.rar',
    '.exe', '.dll', '.so', '.dylib',
    '.mp3', '.mp4', '.avi', '.mov', '.wmv'
  ];

  constructor(
    private projectRoot: string,
    private duckdbManager: DuckDBManager
  ) {}

  /**
   * Process a single file for indexing
   */
  async processFile(
    filePath: string,
    options: FileProcessingOptions = {}
  ): Promise<FileProcessingResult> {
    const startTime = Date.now();
    const result: FileProcessingResult = {
      fileInfo: {} as FileInfo,
      processed: false,
      skipped: false,
      checksumChanged: false,
      processingTime: 0
    };

    try {
      // Check if file exists
      const stats = await fs.stat(filePath);
      if (!stats.isFile()) {
        result.error = 'Path is not a file';
        return { ...result, processingTime: Date.now() - startTime };
      }

      // Check file size limit
      if (options.maxFileSize && stats.size > options.maxFileSize) {
        result.error = `File too large: ${stats.size} bytes`;
        result.skipped = true;
        return { ...result, processingTime: Date.now() - startTime };
      }

      // Check if it's a supported file type
      const ext = path.extname(filePath).toLowerCase();
      const isBinary = this.isBinaryFile(filePath);

      if (!options.includeBinaryFiles && isBinary) {
        result.error = 'Binary file skipped';
        result.skipped = true;
        return { ...result, processingTime: Date.now() - startTime };
      }

      // Read file content
      let content = '';
      let checksum = '';

      if (!isBinary || options.includeBinaryFiles) {
        try {
          content = await fs.readFile(filePath, 'utf8');
          checksum = crypto.createHash('sha256').update(content).digest('hex');
        } catch (error) {
          // If UTF-8 fails, try binary read for checksum
          const buffer = await fs.readFile(filePath);
          checksum = crypto.createHash('sha256').update(buffer).digest('hex');
          content = ''; // Don't store binary content
        }
      } else {
        // Binary file checksum only
        const buffer = await fs.readFile(filePath);
        checksum = crypto.createHash('sha256').update(buffer).digest('hex');
      }

      // Check if file has changed
      const existingFile = await this.getExistingFileInfo(filePath);
      const checksumChanged = !existingFile || existingFile.checksum !== checksum;

      if (!checksumChanged && !options.forceReprocess) {
        result.skipped = true;
        result.checksumChanged = false;
        result.fileInfo = existingFile!;
        return { ...result, processingTime: Date.now() - startTime };
      }

      // Create file info
      const relativePath = path.relative(this.projectRoot, filePath);
      const fileInfo: FileInfo = {
        file_path: relativePath,
        file_name: path.basename(filePath),
        directory: path.dirname(relativePath),
        extension: ext,
        language: this.detectLanguage(filePath),
        size_bytes: stats.size,
        lines_count: isBinary ? 0 : content.split('\n').length,
        last_modified: stats.mtime,
        checksum,
        is_binary: isBinary
      };

      // Update database
      await this.duckdbManager.upsertFile(fileInfo);

      result.fileInfo = fileInfo;
      result.processed = true;
      result.checksumChanged = checksumChanged;

      logInfo('File processed successfully', {
        filePath: relativePath,
        size: stats.size,
        checksumChanged
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.error = errorMessage;
      logError('File processing failed', { filePath, error: errorMessage });
    }

    result.processingTime = Date.now() - startTime;
    return result;
  }

  /**
   * Detect changes across multiple files
   */
  async detectChanges(
    filePaths: string[],
    options: FileProcessingOptions = {}
  ): Promise<ChangeDetectionResult> {
    const result: ChangeDetectionResult = {
      changed: [],
      unchanged: [],
      new: [],
      deleted: [],
      errors: []
    };

    // Get all existing files from database
    const existingFiles = await this.getAllExistingFiles();
    const existingFileMap = new Map(
      existingFiles.map(f => [f.file_path, f])
    );

    // Process each file
    for (const filePath of filePaths) {
      try {
        const relativePath = path.relative(this.projectRoot, filePath);
        const existing = existingFileMap.get(relativePath);

        if (!existing) {
          // New file
          result.new.push(filePath);
        } else {
          // Check if file still exists
          try {
            const stats = await fs.stat(filePath);
            if (!stats.isFile()) {
              result.deleted.push(filePath);
              continue;
            }

            // Check checksum
            let currentChecksum = '';
            if (this.isBinaryFile(filePath) && !options.includeBinaryFiles) {
              const buffer = await fs.readFile(filePath);
              currentChecksum = crypto.createHash('sha256').update(buffer).digest('hex');
            } else {
              const content = await fs.readFile(filePath, 'utf8');
              currentChecksum = crypto.createHash('sha256').update(content).digest('hex');
            }

            if (existing.checksum !== currentChecksum) {
              result.changed.push(filePath);
            } else {
              result.unchanged.push(filePath);
            }
          } catch (error) {
            // File no longer exists or can't be read
            result.deleted.push(filePath);
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.errors.push(`${filePath}: ${errorMessage}`);
      }
    }

    // Find deleted files (files in DB but not in filesystem)
    const processedPaths = new Set(
      filePaths.map(p => path.relative(this.projectRoot, p))
    );

    for (const existing of existingFiles) {
      if (!processedPaths.has(existing.file_path)) {
        const fullPath = path.join(this.projectRoot, existing.file_path);
        try {
          await fs.access(fullPath);
          // File still exists, might be in a different scan scope
        } catch {
          // File no longer exists
          result.deleted.push(fullPath);
        }
      }
    }

    return result;
  }

  /**
   * Process multiple files in batch
   */
  async processFilesBatch(
    filePaths: string[],
    options: FileProcessingOptions = {}
  ): Promise<FileProcessingResult[]> {
    const results: FileProcessingResult[] = [];

    // Process files in parallel with concurrency limit
    const concurrencyLimit = 10;
    const batches = this.chunkArray(filePaths, concurrencyLimit);

    for (const batch of batches) {
      const batchPromises = batch.map(filePath =>
        this.processFile(filePath, options)
      );
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Clean up deleted files from database
   */
  async cleanupDeletedFiles(deletedFiles: string[]): Promise<void> {
    const connection = this.duckdbManager.getConnection();

    try {
      await  promisifyRun(connection,'BEGIN TRANSACTION');

      for (const filePath of deletedFiles) {
        const relativePath = path.relative(this.projectRoot, filePath);

        // Remove from all tables
        await promisifyRun(connection, 'DELETE FROM symbols WHERE file_path = ?', [relativePath]);
        await promisifyRun(connection, 'DELETE FROM dependencies WHERE from_file = ?', [relativePath]);
        await promisifyRun(connection, 'DELETE FROM metrics WHERE file_path = ?', [relativePath]);
        await promisifyRun(connection, 'DELETE FROM files WHERE file_path = ?', [relativePath]);

        logInfo('Cleaned up deleted file', { filePath: relativePath });
      }

      await  promisifyRun(connection,'COMMIT');

    } catch (error) {
      await  promisifyRun(connection,'ROLLBACK');
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError('Failed to cleanup deleted files', { error: errorMessage });
      throw error;
    } finally {
      connection.close();
    }
  }

  /**
   * Get file statistics
   */
  async getFileStatistics(): Promise<{
    total_files: number;
    total_size_bytes: number;
    languages: { [key: string]: number };
    extensions: { [key: string]: number };
    binary_files: number;
  }> {
    const connection = this.duckdbManager.getConnection();

    try {
      const stats = await  promisifyAll(connection,`
        SELECT
          COUNT(*) as total_files,
          SUM(size_bytes) as total_size_bytes,
          COUNT(CASE WHEN is_binary THEN 1 END) as binary_files
        FROM files
      `);

      const languages = await  promisifyAll(connection,`
        SELECT language, COUNT(*) as count
        FROM files
        WHERE language IS NOT NULL
        GROUP BY language
        ORDER BY count DESC
      `);

      const extensions = await  promisifyAll(connection,`
        SELECT extension, COUNT(*) as count
        FROM files
        WHERE extension IS NOT NULL
        GROUP BY extension
        ORDER BY count DESC
      `);

      const languageMap: { [key: string]: number } = {};
      languages.forEach((row: any) => {
        languageMap[row.language] = row.count;
      });

      const extensionMap: { [key: string]: number } = {};
      extensions.forEach((row: any) => {
        extensionMap[row.extension] = row.count;
      });

      return {
        total_files: stats[0].total_files || 0,
        total_size_bytes: stats[0].total_size_bytes || 0,
        languages: languageMap,
        extensions: extensionMap,
        binary_files: stats[0].binary_files || 0
      };

    } finally {
      connection.close();
    }
  }

  /**
   * Check if file is binary
   */
  private isBinaryFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return this.binaryExtensions.includes(ext);
  }

  /**
   * Detect programming language from file path
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
      '.cc': 'cpp',
      '.cxx': 'cpp',
      '.c': 'c',
      '.h': 'c',
      '.hpp': 'cpp',
      '.rs': 'rust',
      '.rb': 'ruby',
      '.php': 'php',
      '.cs': 'csharp',
      '.scala': 'scala',
      '.kt': 'kotlin',
      '.swift': 'swift',
      '.m': 'objective-c',
      '.mm': 'objective-c'
    };

    return languageMap[ext] || 'unknown';
  }

  /**
   * Get existing file info from database
   */
  private async getExistingFileInfo(filePath: string): Promise<FileInfo | null> {
    const connection = this.duckdbManager.getConnection();

    try {
      const relativePath = path.relative(this.projectRoot, filePath);
      const result = await  promisifyAll(connection,
        'SELECT * FROM files WHERE file_path = ?',
        [relativePath]
      );

      if (result.length === 0) {
        return null;
      }

      const row = result[0];
      return {
        file_path: row.file_path,
        file_name: row.file_name,
        directory: row.directory,
        extension: row.extension,
        language: row.language,
        size_bytes: row.size_bytes,
        lines_count: row.lines_count,
        last_modified: new Date(row.last_modified),
        checksum: row.checksum,
        is_binary: row.is_binary
      };

    } finally {
      connection.close();
    }
  }

  /**
   * Get all existing files from database
   */
  private async getAllExistingFiles(): Promise<FileInfo[]> {
    const connection = this.duckdbManager.getConnection();

    try {
      const result = await  promisifyAll(connection,'SELECT * FROM files');

      return result.map((row: any) => ({
        file_path: row.file_path,
        file_name: row.file_name,
        directory: row.directory,
        extension: row.extension,
        language: row.language,
        size_bytes: row.size_bytes,
        lines_count: row.lines_count,
        last_modified: new Date(row.last_modified),
        checksum: row.checksum,
        is_binary: row.is_binary
      }));

    } finally {
      connection.close();
    }
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
}