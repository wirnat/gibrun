import { SymbolInfo } from '@core/duckdb-manager.js';
import { LanguageSymbolExtractor } from './base.js';

// Python Symbol Extractor
export class PythonSymbolExtractor extends LanguageSymbolExtractor {
  extractSymbols(filePath: string, content: string): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];

    // Function extraction
    this.extractPythonFunctions(filePath, content, symbols);

    // Class extraction
    this.extractPythonClasses(filePath, content, symbols);

    return symbols;
  }

  private extractPythonFunctions(filePath: string, content: string, symbols: SymbolInfo[]): void {
    const funcRegex = /^(\s*)def\s+(\w+)\s*\([^)]*\):/gm;
    let match;
    while ((match = funcRegex.exec(content)) !== null) {
      const lineNumber = this.getLineNumber(content, match.index);
      const name = match[2];

      if (!this.shouldIncludeSymbol(name)) continue;

      const complexity = this.calculatePythonComplexity(content, match.index);

      symbols.push({
        id: this.generateSymbolId(filePath, name, lineNumber),
        name,
        type: 'function',
        file_path: filePath,
        line_number: lineNumber,
        signature: match[0].trim(),
        visibility: name.startsWith('_') ? 'private' : 'public',
        complexity,
        language: 'python',
        metadata: {
          parameters: this.extractPythonFunctionParameters(match[0]),
          decorators: this.extractPythonDecorators(content, match.index)
        }
      });
    }
  }

  private extractPythonClasses(filePath: string, content: string, symbols: SymbolInfo[]): void {
    const classRegex = /^(\s*)class\s+(\w+)(\([^)]*\))?:/gm;
    let match;
    while ((match = classRegex.exec(content)) !== null) {
      const lineNumber = this.getLineNumber(content, match.index);
      const name = match[2];

      if (!this.shouldIncludeSymbol(name)) continue;

      symbols.push({
        id: this.generateSymbolId(filePath, name, lineNumber),
        name,
        type: 'class',
        file_path: filePath,
        line_number: lineNumber,
        visibility: name.startsWith('_') ? 'private' : 'public',
        complexity: 1,
        language: 'python',
        metadata: {
          inherits: match[3] ? match[3].slice(1, -1).split(',').map(s => s.trim()) : []
        }
      });
    }
  }

  private calculatePythonComplexity(content: string, startIndex: number): number {
    const funcEnd = this.findPythonFunctionEnd(content, startIndex);
    if (funcEnd === -1) return 1;

    const funcContent = content.substring(startIndex, funcEnd);
    let complexity = 1;

    const controlFlowPatterns = [
      /\bif\s+/g, /\belif\s+/g, /\belse\s*:/g, /\bfor\s+/g,
      /\bwhile\s+/g, /\btry\s*:/g, /\bexcept\s+/g, /\bwith\s+/g,
      /\band\s+/g, /\bor\s+/g
    ];

    for (const pattern of controlFlowPatterns) {
      const matches = funcContent.match(pattern);
      if (matches) complexity += matches.length;
    }

    return complexity;
  }

  extractDependencies(content: string): string[] {
    const dependencies: string[] = [];
    const pythonImportRegex = /^\s*(?:import\s+(\w+)|from\s+(\w+)\s+import)/gm;
    let match;

    while ((match = pythonImportRegex.exec(content)) !== null) {
      const module = match[1] || match[2];
      if (module) {
        dependencies.push(module);
      }
    }

    return [...new Set(dependencies)];
  }

  private extractPythonFunctionParameters(signature: string): string[] {
    const paramMatch = signature.match(/def\s+\w+\s*\(([^)]*)\)/);
    if (!paramMatch) return [];
    return paramMatch[1].split(',').map(p => p.trim()).filter(p => p && !p.includes('='));
  }

  private extractPythonDecorators(content: string, funcIndex: number): string[] {
    const decorators: string[] = [];
    const lines = content.split('\n');
    const funcLine = this.getLineNumber(content, funcIndex) - 1;

    for (let i = funcLine - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith('@')) {
        decorators.unshift(line);
      } else if (line) {
        break;
      }
    }

    return decorators;
  }

  private findPythonFunctionEnd(content: string, startIndex: number): number {
    const lines = content.split('\n');
    const startLine = this.getLineNumber(content, startIndex) - 1;
    const funcLine = lines[startLine];
    const funcIndent = funcLine.length - funcLine.trimStart().length;

    for (let i = startLine + 1; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) continue;

      const indent = line.length - line.trimStart().length;
      if (indent <= funcIndent && !line.startsWith(' ')) {
        return content.indexOf(line, content.indexOf(lines[i - 1] || ''));
      }
    }

    return content.length;
  }
}