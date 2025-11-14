import * as path from 'path';
import { SymbolInfo } from '@/core/duckdb-manager.js';
import { LanguageSymbolExtractor } from './base.js';

// TypeScript/JavaScript Symbol Extractor
export class TypeScriptSymbolExtractor extends LanguageSymbolExtractor {
  extractSymbols(filePath: string, content: string): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];
    const language = path.extname(filePath).includes('ts') ? 'typescript' : 'javascript';

    // Function extraction
    this.extractTSFunctions(filePath, content, symbols, language);

    // Class extraction
    this.extractTSClasses(filePath, content, symbols, language);

    // Interface extraction (TypeScript only)
    if (language === 'typescript') {
      this.extractTSInterfaces(filePath, content, symbols);
    }

    return symbols;
  }

  private extractTSFunctions(filePath: string, content: string, symbols: SymbolInfo[], language: string): void {
    const funcPatterns = [
      /\bfunction\s+(\w+)\s*\([^)]*\)/g,
      /\b(?:const|let|var)\s+(\w+)\s*[:=]\s*\([^)]*\)\s*=>/g,
      /(\w+)\s*\([^)]*\)\s*{/g,
      /\basync\s+function\s+(\w+)\s*\([^)]*\)/g,
      /\basync\s+(?:const|let|var)\s+(\w+)\s*[:=]\s*\([^)]*\)\s*=>/g
    ];

    for (const pattern of funcPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const lineNumber = this.getLineNumber(content, match.index);
        const name = match[1];

        if (!this.shouldIncludeSymbol(name)) continue;

        const complexity = this.calculateTSComplexity(content, match.index);

        symbols.push({
          id: this.generateSymbolId(filePath, name, lineNumber),
          name,
          type: 'function',
          file_path: filePath,
          line_number: lineNumber,
          signature: match[0].trim(),
          visibility: name.startsWith('_') ? 'private' : 'public',
          complexity,
          language,
          metadata: {
            parameters: this.extractTSFunctionParameters(match[0]),
            isAsync: match[0].includes('async')
          }
        });
      }
    }
  }

  private extractTSClasses(filePath: string, content: string, symbols: SymbolInfo[], language: string): void {
    const classRegex = /\bclass\s+(\w+)/g;
    let match;
    while ((match = classRegex.exec(content)) !== null) {
      const lineNumber = this.getLineNumber(content, match.index);
      const name = match[1];

      symbols.push({
        id: this.generateSymbolId(filePath, name, lineNumber),
        name,
        type: 'class',
        file_path: filePath,
        line_number: lineNumber,
        visibility: 'public',
        complexity: 1,
        language,
        metadata: {
          extends: this.extractTSExtends(content, match.index),
          implements: this.extractTSImplements(content, match.index)
        }
      });
    }
  }

  private extractTSInterfaces(filePath: string, content: string, symbols: SymbolInfo[]): void {
    const interfaceRegex = /\binterface\s+(\w+)/g;
    let match;
    while ((match = interfaceRegex.exec(content)) !== null) {
      const lineNumber = this.getLineNumber(content, match.index);
      const name = match[1];

      symbols.push({
        id: this.generateSymbolId(filePath, name, lineNumber),
        name,
        type: 'interface',
        file_path: filePath,
        line_number: lineNumber,
        visibility: 'public',
        complexity: 1,
        language: 'typescript',
        metadata: {
          extends: this.extractTSInterfaceExtends(content, match.index)
        }
      });
    }
  }

  private calculateTSComplexity(content: string, startIndex: number): number {
    const funcEnd = this.findFunctionEnd(content, startIndex, '{', '}');
    if (funcEnd === -1) return 1;

    const funcContent = content.substring(startIndex, funcEnd);
    let complexity = 1;

    const controlFlowPatterns = [
      /\bif\s*\(/g, /\belse\s+/g, /\bfor\s*\(/g, /\bwhile\s*\(/g,
      /\bdo\s*\{/g, /\bswitch\s*\(/g, /\bcatch\s*\(/g, /\bcase\s+/g,
      /\b&&/g, /\b\|\|/g, /\?/g
    ];

    for (const pattern of controlFlowPatterns) {
      const matches = funcContent.match(pattern);
      if (matches) complexity += matches.length;
    }

    return complexity;
  }

  extractDependencies(content: string): string[] {
    const dependencies: string[] = [];

    // ES6 imports
    const es6ImportRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = es6ImportRegex.exec(content)) !== null) {
      dependencies.push(match[1]);
    }

    // CommonJS require
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = requireRegex.exec(content)) !== null) {
      dependencies.push(match[1]);
    }

    return [...new Set(dependencies)];
  }

  private extractTSFunctionParameters(signature: string): string[] {
    const paramMatch = signature.match(/\(([^)]*)\)/);
    if (!paramMatch) return [];
    return paramMatch[1].split(',').map(p => p.trim()).filter(p => p);
  }

  private extractTSExtends(content: string, startIndex: number): string[] {
    const extendsMatch = content.substring(startIndex, startIndex + 200).match(/extends\s+([^{]+)/);
    if (!extendsMatch) return [];
    return extendsMatch[1].split(',').map(s => s.trim());
  }

  private extractTSImplements(content: string, startIndex: number): string[] {
    const implementsMatch = content.substring(startIndex, startIndex + 200).match(/implements\s+([^{]+)/);
    if (!implementsMatch) return [];
    return implementsMatch[1].split(',').map(s => s.trim());
  }

  private extractTSInterfaceExtends(content: string, startIndex: number): string[] {
    const extendsMatch = content.substring(startIndex, startIndex + 200).match(/extends\s+([^{]+)/);
    if (!extendsMatch) return [];
    return extendsMatch[1].split(',').map(s => s.trim());
  }

  private findFunctionEnd(content: string, startIndex: number, openBrace: string, closeBrace: string): number {
    let braceCount = 0;
    let inString = false;
    let stringChar = '';

    for (let i = startIndex; i < content.length; i++) {
      const char = content[i];

      if ((char === '"' || char === "'") && content[i - 1] !== '\\') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
          stringChar = '';
        }
        continue;
      }

      if (inString) continue;

      if (char === openBrace) {
        braceCount++;
      } else if (char === closeBrace) {
        braceCount--;
        if (braceCount === 0) {
          return i;
        }
      }
    }

    return -1;
  }
}