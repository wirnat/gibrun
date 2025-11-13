// src/tools/project-analyzer/collectors/DependencyCollector.ts
import { promises as fs } from 'fs';
import * as path from 'path';
import { AnalysisScope, DependencyInfo, DataCollector, CollectedData } from '../types/index.js';

interface PackageManager {
  name: string;
  files: string[];
  parseDependencies: (content: string, filePath: string) => Promise<DependencyInfo[]>;
}

export class DependencyCollector implements DataCollector {
  private projectRoot: string;
  private packageManagers: PackageManager[] = [];

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
    this.initializePackageManagers();
  }

  async collect(scope: AnalysisScope = 'full'): Promise<CollectedData> {
    const startTime = Date.now();

    try {
      const allDependencies: DependencyInfo[] = [];

      // Check each package manager
      for (const pm of this.packageManagers) {
        const dependencies = await this.collectFromPackageManager(pm, scope);
        allDependencies.push(...dependencies);
      }

      // Remove duplicates (same name and version)
      const uniqueDependencies = this.deduplicateDependencies(allDependencies);

      const collectionTime = Date.now() - startTime;

      return {
        dependencies: uniqueDependencies,
        metadata: {
          totalDependencies: uniqueDependencies.length,
          collectionTime,
          scope,
          packageManagers: this.packageManagers.map(pm => pm.name)
        }
      };

    } catch (error: any) {
      console.error('Dependency collection failed:', error);
      throw new Error(`Dependency collection failed: ${error?.message || 'Unknown error'}`);
    }
  }

  private initializePackageManagers(): void {
    this.packageManagers = [
      {
        name: 'npm',
        files: ['package.json', 'package-lock.json', 'yarn.lock'],
        parseDependencies: this.parseNpmDependencies.bind(this)
      },
      {
        name: 'go',
        files: ['go.mod', 'go.sum'],
        parseDependencies: this.parseGoDependencies.bind(this)
      },
      {
        name: 'rust',
        files: ['Cargo.toml', 'Cargo.lock'],
        parseDependencies: this.parseRustDependencies.bind(this)
      },
      {
        name: 'python',
        files: ['requirements.txt', 'pyproject.toml', 'Pipfile', 'Pipfile.lock'],
        parseDependencies: this.parsePythonDependencies.bind(this)
      },
      {
        name: 'java',
        files: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
        parseDependencies: this.parseJavaDependencies.bind(this)
      }
    ];
  }

  private async collectFromPackageManager(pm: PackageManager, scope: AnalysisScope): Promise<DependencyInfo[]> {
    const dependencies: DependencyInfo[] = [];

    for (const file of pm.files) {
      const filePath = path.join(this.projectRoot, file);

      try {
        await fs.access(filePath);
        const content = await fs.readFile(filePath, 'utf-8');
        const deps = await pm.parseDependencies(content, filePath);
        dependencies.push(...deps);
      } catch (error) {
        // File doesn't exist or can't be read, skip
        continue;
      }
    }

    return dependencies;
  }

  private async parseNpmDependencies(content: string, filePath: string): Promise<DependencyInfo[]> {
    const dependencies: DependencyInfo[] = [];

    try {
      const packageJson = JSON.parse(content);

      // Parse dependencies
      const depTypes = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

      for (const depType of depTypes) {
        if (packageJson[depType]) {
          for (const [name, version] of Object.entries(packageJson[depType])) {
            const type = this.mapNpmDepType(depType);
            dependencies.push({
              name: name as string,
              version: version as string,
              type,
              source: 'npm'
            });
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to parse npm dependencies from ${filePath}:`, error);
    }

    return dependencies;
  }

  private mapNpmDepType(depType: string): 'runtime' | 'dev' | 'peer' | 'optional' {
    switch (depType) {
      case 'dependencies': return 'runtime';
      case 'devDependencies': return 'dev';
      case 'peerDependencies': return 'peer';
      case 'optionalDependencies': return 'optional';
      default: return 'runtime';
    }
  }

  private async parseGoDependencies(content: string, filePath: string): Promise<DependencyInfo[]> {
    const dependencies: DependencyInfo[] = [];

    try {
      const lines = content.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('require') || trimmed.startsWith('\t')) {
          // Parse go.mod format: require github.com/package v1.2.3
          const parts = trimmed.split(/\s+/);
          if (parts.length >= 2) {
            const name = parts[1];
            const version = parts.length > 2 ? parts[2] : 'latest';

            dependencies.push({
              name,
              version,
              type: 'runtime',
              source: 'go'
            });
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to parse Go dependencies from ${filePath}:`, error);
    }

    return dependencies;
  }

  private async parseRustDependencies(content: string, filePath: string): Promise<DependencyInfo[]> {
    const dependencies: DependencyInfo[] = [];

    try {
      const lines = content.split('\n');
      let inDependenciesSection = false;

      for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed === '[dependencies]') {
          inDependenciesSection = true;
          continue;
        } else if (trimmed.startsWith('[') && trimmed !== '[dependencies]') {
          inDependenciesSection = false;
          continue;
        }

        if (inDependenciesSection && trimmed && !trimmed.startsWith('#')) {
          // Parse: package = "1.2.3" or package = { version = "1.2.3" }
          const equalIndex = trimmed.indexOf('=');
          if (equalIndex > 0) {
            const name = trimmed.substring(0, equalIndex).trim();
            const versionPart = trimmed.substring(equalIndex + 1).trim();

            let version = 'latest';
            if (versionPart.includes('"')) {
              const versionMatch = versionPart.match(/"([^"]+)"/);
              if (versionMatch) {
                version = versionMatch[1];
              }
            } else if (versionPart.includes('version')) {
              const versionMatch = versionPart.match(/version\s*=\s*"([^"]+)"/);
              if (versionMatch) {
                version = versionMatch[1];
              }
            }

            dependencies.push({
              name,
              version,
              type: 'runtime',
              source: 'rust'
            });
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to parse Rust dependencies from ${filePath}:`, error);
    }

    return dependencies;
  }

  private async parsePythonDependencies(content: string, filePath: string): Promise<DependencyInfo[]> {
    const dependencies: DependencyInfo[] = [];

    try {
      const filename = path.basename(filePath);

      if (filename === 'requirements.txt') {
        const lines = content.split('\n');

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            // Parse: package==1.2.3 or package>=1.0.0
            const packageMatch = trimmed.match(/^([a-zA-Z0-9\-_.]+)([><=~!]+.+)?$/);
            if (packageMatch) {
              const name = packageMatch[1];
              const version = packageMatch[2] || 'latest';

              dependencies.push({
                name,
                version,
                type: 'runtime',
                source: 'python'
              });
            }
          }
        }
      } else if (filename === 'pyproject.toml') {
        // Basic TOML parsing for dependencies
        const lines = content.split('\n');
        let inDependenciesSection = false;

        for (const line of lines) {
          const trimmed = line.trim();

          if (trimmed.includes('[tool.poetry.dependencies]') || trimmed.includes('[project.dependencies]')) {
            inDependenciesSection = true;
            continue;
          } else if (trimmed.startsWith('[') && !trimmed.includes('dependencies')) {
            inDependenciesSection = false;
            continue;
          }

          if (inDependenciesSection && trimmed && !trimmed.startsWith('#')) {
            const depMatch = trimmed.match(/^([^=]+)\s*=\s*["']([^"']+)["']/);
            if (depMatch) {
              const name = depMatch[1].trim();
              const version = depMatch[2];

              dependencies.push({
                name,
                version,
                type: 'runtime',
                source: 'python'
              });
            }
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to parse Python dependencies from ${filePath}:`, error);
    }

    return dependencies;
  }

  private async parseJavaDependencies(content: string, filePath: string): Promise<DependencyInfo[]> {
    const dependencies: DependencyInfo[] = [];

    try {
      const filename = path.basename(filePath);

      if (filename === 'pom.xml') {
        // Basic XML parsing for Maven dependencies
        const lines = content.split('\n');
        let inDependency = false;
        let currentDep: { name?: string; version?: string; groupId?: string } = {};

        for (const line of lines) {
          const trimmed = line.trim();

          if (trimmed.includes('<dependency>')) {
            inDependency = true;
            currentDep = {};
          } else if (trimmed.includes('</dependency>')) {
            if (currentDep.name && currentDep.version) {
              dependencies.push({
                name: currentDep.name,
                version: currentDep.version,
                type: 'runtime',
                source: 'maven'
              });
            }
            inDependency = false;
          } else if (inDependency) {
            if (trimmed.includes('<groupId>')) {
              const match = trimmed.match(/<groupId>([^<]+)<\/groupId>/);
              if (match) currentDep.groupId = match[1];
            } else if (trimmed.includes('<artifactId>')) {
              const match = trimmed.match(/<artifactId>([^<]+)<\/artifactId>/);
              if (match) currentDep.name = match[1];
            } else if (trimmed.includes('<version>')) {
              const match = trimmed.match(/<version>([^<]+)<\/version>/);
              if (match) currentDep.version = match[1];
            }
          }
        }
      } else if (filename.includes('gradle')) {
        // Basic Gradle dependency parsing
        const lines = content.split('\n');

        for (const line of lines) {
          const trimmed = line.trim();

          // Match: implementation 'group:artifact:version'
          const depMatch = trimmed.match(/implementation\s+['"]([^:]+):([^:]+):([^'"]+)['"]/);
          if (depMatch) {
            const [, groupId, artifactId, version] = depMatch;
            const name = `${groupId}:${artifactId}`;

            dependencies.push({
              name,
              version,
              type: 'runtime',
              source: 'gradle'
            });
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to parse Java dependencies from ${filePath}:`, error);
    }

    return dependencies;
  }

  private deduplicateDependencies(dependencies: DependencyInfo[]): DependencyInfo[] {
    const seen = new Set<string>();
    const unique: DependencyInfo[] = [];

    for (const dep of dependencies) {
      const key = `${dep.name}:${dep.version}:${dep.source}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(dep);
      }
    }

    return unique;
  }
}