// src/tools/project-analyzer/collectors/DataCollectorManager.ts
import { promises as fs } from 'fs';
import * as path from 'path';
import { readdir } from 'fs/promises';
import { AnalysisScope, RawProjectData, DataCollector } from '@analyzer-types/index.js';

// Helper function for simple glob matching
async function matchGlobPattern(pattern: string, baseDir: string): Promise<string[]> {
  const results: string[] = [];
  const parts = pattern.split('/');
  const basePath = path.resolve(baseDir);

  await collectFiles(basePath, parts, 0, results);
  return results;
}

async function collectFiles(dir: string, patternParts: string[], partIndex: number, results: string[]): Promise<void> {
  if (partIndex >= patternParts.length) {
    return;
  }

  const currentPart = patternParts[partIndex];
  const isLastPart = partIndex === patternParts.length - 1;

  try {
    const items = await readdir(dir, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(dir, item.name);

      if (matchesPattern(item.name, currentPart)) {
        if (isLastPart) {
          if (item.isFile()) {
            results.push(fullPath);
          }
        } else {
          if (item.isDirectory()) {
            await collectFiles(fullPath, patternParts, partIndex + 1, results);
          }
        }
      } else if (currentPart === '**' && item.isDirectory()) {
        await collectFiles(fullPath, patternParts, partIndex, results);
        if (!isLastPart) {
          await collectFiles(fullPath, patternParts, partIndex + 1, results);
        }
      }
    }
  } catch (error) {
    // Skip directories we can't read
  }
}

function matchesPattern(filename: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern === '**') return true;

  // Convert glob to regex
  const regexPattern = pattern
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
    .replace(/\./g, '\\.');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filename);
}

export class DataCollectorManager {
  private collectors: Map<string, DataCollector> = new Map();
  private projectRoot: string;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
  }

  registerCollector(name: string, collector: DataCollector): void {
    this.collectors.set(name, collector);
  }

  async collect(scope: AnalysisScope = 'full'): Promise<RawProjectData> {
    const startTime = Date.now();

    try {
      // Collect data in parallel from all registered collectors
      const collectionPromises = Array.from(this.collectors.entries()).map(
        async ([name, collector]) => {
          try {
            const data = await collector.collect(scope);
            return { name, data, success: true };
          } catch (error: any) {
            console.warn(`Collector ${name} failed:`, error);
            return { name, data: {}, success: false, error: error?.message || 'Unknown error' };
          }
        }
      );

      const results = await Promise.allSettled(collectionPromises);

      // Aggregate results
      const rawData: RawProjectData = {
        files: [],
        dependencies: [],
        gitHistory: [],
        testResults: []
      };

      let totalFiles = 0;
      let failedCollectors = 0;

      for (const result of results) {
        if (result.status === 'fulfilled') {
          const { name, data, success } = result.value;
          if (success) {
            // Merge collected data into rawData
            Object.assign(rawData, data);
            if (data && typeof data === 'object' && 'files' in data && Array.isArray(data.files)) {
              totalFiles += data.files.length;
            }
          } else {
            failedCollectors++;
            console.warn(`Collector ${name} failed: ${result.value.error}`);
          }
        } else {
          failedCollectors++;
          console.error('Collection promise rejected:', result.reason);
        }
      }

      const collectionTime = Date.now() - startTime;

      console.log(`Data collection completed in ${collectionTime}ms. Files: ${totalFiles}, Failed collectors: ${failedCollectors}`);

      return rawData;

    } catch (error: any) {
      console.error('Data collection failed:', error);
      throw new Error(`Data collection failed: ${error?.message || 'Unknown error'}`);
    }
  }

  getCollector(name: string): DataCollector | undefined {
    return this.collectors.get(name);
  }

  listCollectors(): string[] {
    return Array.from(this.collectors.keys());
  }

  getProjectRoot(): string {
    return this.projectRoot;
  }

  async validateProjectStructure(): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];

    try {
      // Check if project root exists
      await fs.access(this.projectRoot);
    } catch {
      issues.push(`Project root does not exist: ${this.projectRoot}`);
      return { valid: false, issues };
    }

    // Check for common project files
    const projectFiles = [
      'package.json',
      'go.mod',
      'Cargo.toml',
      'requirements.txt',
      'pyproject.toml'
    ];

    let hasProjectFile = false;
    for (const file of projectFiles) {
      try {
        await fs.access(path.join(this.projectRoot, file));
        hasProjectFile = true;
        break;
      } catch {
        // File doesn't exist, continue checking
      }
    }

    if (!hasProjectFile) {
      issues.push('No recognizable project file found (package.json, go.mod, etc.)');
    }

    // Check for source code
    const sourcePatterns = [
      '**/*.{js,ts,jsx,tsx}',
      '**/*.go',
      '**/*.rs',
      '**/*.py',
      '**/*.{java,cpp,h}'
    ];

    let hasSourceCode = false;
    for (const pattern of sourcePatterns) {
      const matches = await matchGlobPattern(pattern, this.projectRoot);
      // Filter out ignored directories
      const filteredMatches = matches.filter(match =>
        !match.includes('node_modules/') &&
        !match.includes('.git/') &&
        !match.includes('dist/') &&
        !match.includes('build/')
      );
      if (filteredMatches.length > 0) {
        hasSourceCode = true;
        break;
      }
    }

    if (!hasSourceCode) {
      issues.push('No source code files found in project');
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }
}