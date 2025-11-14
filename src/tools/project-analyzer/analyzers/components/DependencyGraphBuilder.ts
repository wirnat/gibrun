// src/tools/project-analyzer/analyzers/components/DependencyGraphBuilder.ts
import * as path from 'path';
import {
  DependencyGraph,
  DependencyNode,
  DependencyEdge,
  CircularDependency
} from '../../types/index.js';
import { LayerClassifier, LayerType } from './LayerClassifier.js';

export class DependencyGraphBuilder {
  private layerClassifier = new LayerClassifier();

  build(files: any[], dependencies: any[]): DependencyGraph {
    const nodes = this.createNodes(files);
    const edges = this.createEdges(files, nodes);
    const circularDeps = this.detectCircularDependencies(edges);

    return {
      nodes,
      edges,
      circularDependencies: circularDeps,
      strength: this.calculateStrength(edges, nodes)
    };
  }

  private createNodes(files: any[]): DependencyNode[] {
    return files.map(file => {
      const filePath = file.path || '';
      const layer = this.layerClassifier.classify(filePath, file.content || '');
      return {
        id: filePath,
        layer: this.mapLayerType(layer),
        dependencies: 0
      };
    });
  }

  private createEdges(files: any[], nodes: DependencyNode[]): DependencyEdge[] {
    const edges: DependencyEdge[] = [];
    const nodeMap = new Map(nodes.map(node => [node.id, node]));

    for (const file of files) {
      const filePath = file.path || '';
      const content = file.content || '';
      const imports = this.extractImports(content, file.language || 'unknown');

      for (const importPath of imports) {
        const resolvedPath = this.resolveImportPath(filePath, importPath);
        if (resolvedPath && nodeMap.has(resolvedPath)) {
          const fromNode = nodeMap.get(filePath)!;
          edges.push({
            from: filePath,
            to: resolvedPath,
            type: 'direct'
          });
          fromNode.dependencies += 1;
        }
      }
    }

    return edges;
  }

  private extractImports(content: string, language: string): string[] {
    const imports: string[] = [];

    try {
      switch (language) {
        case 'javascript':
        case 'typescript':
          this.extractJSImports(content, imports);
          break;
        case 'go':
          this.extractGoImports(content, imports);
          break;
        case 'python':
          this.extractPythonImports(content, imports);
          break;
      }
    } catch (error) {
      // Ignore parsing errors
    }

    return imports;
  }

  private extractJSImports(content: string, imports: string[]): void {
    const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

    let match;
    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }
    while ((match = requireRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }
  }

  private extractGoImports(content: string, imports: string[]): void {
    const importRegex = /import\s+[\(\s]*["]([^"]+)["]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }
  }

  private extractPythonImports(content: string, imports: string[]): void {
    const importRegex = /^(?:from\s+([^\s]+)\s+import|import\s+([^\s]+))/gm;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1] || match[2];
      if (importPath) imports.push(importPath);
    }
  }

  private resolveImportPath(fromPath: string, importPath: string): string | null {
    if (!importPath.startsWith('./') && !importPath.startsWith('../')) {
      return null;
    }

    const fromDir = path.dirname(fromPath);
    const resolved = path.resolve(fromDir, importPath);
    const extensions = ['.js', '.ts', '.jsx', '.tsx', '.go', '.py'];

    for (const ext of extensions) {
      const candidate = resolved + ext;
      if (!candidate.includes('/node_modules/')) {
        return candidate;
      }
    }

    return null;
  }

  private detectCircularDependencies(edges: DependencyEdge[]): CircularDependency[] {
    const circularDeps: CircularDependency[] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const graph = this.buildAdjacencyList(edges);

    const detectCycle = (node: string, path: string[] = []): boolean => {
      if (recursionStack.has(node)) {
        const cycleStart = path.indexOf(node);
        if (cycleStart !== -1) {
          const cycle = path.slice(cycleStart);
          circularDeps.push({
            nodes: cycle,
            description: `Circular dependency detected: ${cycle.join(' -> ')}`
          });
        }
        return true;
      }

      if (visited.has(node)) return false;

      visited.add(node);
      recursionStack.add(node);

      const neighbors = graph.get(node) || [];
      for (const neighbor of neighbors) {
        if (detectCycle(neighbor, [...path, node])) {
          return true;
        }
      }

      recursionStack.delete(node);
      return false;
    };

    for (const node of Array.from(graph.keys())) {
      if (!visited.has(node)) {
        detectCycle(node);
      }
    }

    return circularDeps;
  }

  private buildAdjacencyList(edges: DependencyEdge[]): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    for (const edge of edges) {
      if (!graph.has(edge.from)) {
        graph.set(edge.from, []);
      }
      graph.get(edge.from)!.push(edge.to);
    }
    return graph;
  }

  private calculateStrength(edges: DependencyEdge[], nodes: DependencyNode[]): 'loose' | 'moderate' | 'tight' | 'very_tight' | 'unknown' {
    const totalDeps = edges.length;
    const avgDeps = nodes.length > 0 ? totalDeps / nodes.length : 0;

    if (avgDeps < 2) return 'loose';
    if (avgDeps < 5) return 'moderate';
    if (avgDeps < 10) return 'tight';
    return 'very_tight';
  }

  private mapLayerType(layer: LayerType): 'presentation' | 'business' | 'data' | 'infrastructure' | 'unidentified' {
    switch (layer) {
      case 'presentation': return 'presentation';
      case 'business': return 'business';
      case 'data': return 'data';
      case 'infrastructure': return 'infrastructure';
      default: return 'unidentified';
    }
  }
}