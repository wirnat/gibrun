// src/tools/project-analyzer/collectors/CodeMetricsCollector.ts
import { promises as fs } from 'fs';
import * as path from 'path';
import { AnalysisScope, SourceFile, DataCollector, CollectedData } from '@analyzer-types/index.js';

export class CodeMetricsCollector implements DataCollector {
  private projectRoot: string;
  private supportedExtensions = ['.js', '.ts', '.jsx', '.tsx', '.go', '.rs', '.py', '.java', '.cpp', '.h'];

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
  }

  async collect(scope: AnalysisScope = 'full'): Promise<CollectedData> {
    const startTime = Date.now();

    try {
      const files = await this.discoverSourceFiles(scope);
      const sourceFiles: SourceFile[] = [];

      // Process files in parallel with concurrency limit
      const concurrencyLimit = 10;
      const batches = this.chunkArray(files, concurrencyLimit);

      for (const batch of batches) {
        const batchPromises = batch.map(async (filePath) => {
          try {
            return await this.analyzeFile(filePath);
          } catch (error) {
            console.warn(`Failed to analyze file ${filePath}:`, error);
            return null;
          }
        });

        const batchResults = await Promise.all(batchPromises);
        sourceFiles.push(...batchResults.filter((result): result is SourceFile => result !== null));
      }

      const collectionTime = Date.now() - startTime;

      return {
        files: sourceFiles,
        metadata: {
          totalFiles: sourceFiles.length,
          collectionTime,
          scope,
          supportedExtensions: this.supportedExtensions
        }
      };

    } catch (error: any) {
      console.error('Code metrics collection failed:', error);
      throw new Error(`Code metrics collection failed: ${error?.message || 'Unknown error'}`);
    }
  }

  private async discoverSourceFiles(scope: AnalysisScope): Promise<string[]> {
    const files: string[] = [];

    const walkDir = async (dir: string, depth = 0): Promise<void> => {
      // Limit depth for performance
      if (depth > 10) return;

      try {
        const items = await fs.readdir(dir, { withFileTypes: true });

        for (const item of items) {
          const fullPath = path.join(dir, item.name);

          // Skip common directories
          if (item.isDirectory()) {
            if (this.shouldSkipDirectory(item.name, scope)) {
              continue;
            }

            // For module scope, only go one level deep
            if (scope === 'module' && depth > 1) {
              continue;
            }

            await walkDir(fullPath, depth + 1);
          } else if (item.isFile() && this.isSourceFile(item.name)) {
            files.push(fullPath);
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    };

    await walkDir(this.projectRoot);
    return files;
  }

  private shouldSkipDirectory(dirName: string, scope: AnalysisScope): boolean {
    const alwaysSkip = [
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
      'obj' // .NET
    ];

    if (alwaysSkip.includes(dirName)) {
      return true;
    }

    // For incremental scope, skip test directories
    if (scope === 'incremental' && (dirName === 'test' || dirName === 'tests' || dirName === '__tests__')) {
      return true;
    }

    return false;
  }

  private isSourceFile(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    return this.supportedExtensions.includes(ext);
  }

  private async analyzeFile(filePath: string): Promise<SourceFile> {
    const content = await fs.readFile(filePath, 'utf-8');
    const stats = await fs.stat(filePath);

    const language = this.detectLanguage(filePath);
    const hash = this.simpleHash(content);

    return {
      path: path.relative(this.projectRoot, filePath),
      content,
      language,
      size: stats.size,
      modified: stats.mtime,
      hash
    };
  }

  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();

    const languageMap: { [key: string]: string } = {
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.go': 'go',
      '.rs': 'rust',
      '.py': 'python',
      '.java': 'java',
      '.cpp': 'cpp',
      '.cc': 'cpp',
      '.cxx': 'cpp',
      '.c': 'c',
      '.h': 'c',
      '.hpp': 'cpp'
    };

    return languageMap[ext] || 'unknown';
  }

  private simpleHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}