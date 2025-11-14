import { SymbolInfo } from '@/core/duckdb-manager.js';
import { LanguageSymbolExtractor } from './base.js';

// Go Symbol Extractor
export class GoSymbolExtractor extends LanguageSymbolExtractor {
  extractSymbols(filePath: string, content: string): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];

    // Function extraction
    this.extractGoFunctions(filePath, content, symbols);

    // Struct extraction
    this.extractGoStructs(filePath, content, symbols);

    // Interface extraction
    this.extractGoInterfaces(filePath, content, symbols);

    return symbols;
  }

  private extractGoFunctions(filePath: string, content: string, symbols: SymbolInfo[]): void {
    const funcRegex = /^(\s*)(func\s+(?:\([^)]*\)\s+)?(\w+)\s*\([^)]*\)\s*(?:\([^)]*\))?\s*{?)/gm;
    let match;
    while ((match = funcRegex.exec(content)) !== null) {
      const lineNumber = this.getLineNumber(content, match.index);
      const signature = match[2].trim();
      const name = match[3];

      if (!this.shouldIncludeSymbol(name)) continue;

      const complexity = this.calculateGoComplexity(content, match.index);

      symbols.push({
        id: this.generateSymbolId(filePath, name, lineNumber),
        name,
        type: 'function',
        file_path: filePath,
        line_number: lineNumber,
        signature,
        visibility: name.charAt(0) === name.charAt(0).toUpperCase() ? 'public' : 'private',
        complexity,
        language: 'go',
        metadata: {
          parameters: this.extractFunctionParameters(signature),
          returnType: this.extractGoReturnType(signature)
        }
      });
    }
  }

  private extractGoStructs(filePath: string, content: string, symbols: SymbolInfo[]): void {
    const structRegex = /^(\s*)type\s+(\w+)\s+struct\s*{/gm;
    let match;
    while ((match = structRegex.exec(content)) !== null) {
      const lineNumber = this.getLineNumber(content, match.index);
      const name = match[2];

      if (!this.shouldIncludeSymbol(name)) continue;

      symbols.push({
        id: this.generateSymbolId(filePath, name, lineNumber),
        name,
        type: 'struct',
        file_path: filePath,
        line_number: lineNumber,
        visibility: name.charAt(0) === name.charAt(0).toUpperCase() ? 'public' : 'private',
        complexity: 1,
        language: 'go',
        metadata: {
          fields: this.extractGoStructFields(content, match.index)
        }
      });
    }
  }

  private extractGoInterfaces(filePath: string, content: string, symbols: SymbolInfo[]): void {
    const interfaceRegex = /^(\s*)type\s+(\w+)\s+interface\s*{/gm;
    let match;
    while ((match = interfaceRegex.exec(content)) !== null) {
      const lineNumber = this.getLineNumber(content, match.index);
      const name = match[2];

      if (!this.shouldIncludeSymbol(name)) continue;

      symbols.push({
        id: this.generateSymbolId(filePath, name, lineNumber),
        name,
        type: 'interface',
        file_path: filePath,
        line_number: lineNumber,
        visibility: name.charAt(0) === name.charAt(0).toUpperCase() ? 'public' : 'private',
        complexity: 1,
        language: 'go',
        metadata: {
          methods: this.extractGoInterfaceMethods(content, match.index)
        }
      });
    }
  }

  private calculateGoComplexity(content: string, startIndex: number): number {
    const funcEnd = this.findFunctionEnd(content, startIndex, '{', '}');
    if (funcEnd === -1) return 1;

    const funcContent = content.substring(startIndex, funcEnd);
    let complexity = 1;

    const controlFlowPatterns = [
      /\bif\s+/g, /\belse\s+/g, /\bfor\s+/g, /\bswitch\s+/g,
      /\bcase\s+/g, /\bselect\s+/g, /\bgoroutine\s+/g, /\b&&/g, /\b\|\|/g
    ];

    for (const pattern of controlFlowPatterns) {
      const matches = funcContent.match(pattern);
      if (matches) complexity += matches.length;
    }

    return complexity;
  }

  extractDependencies(content: string): string[] {
    const dependencies: string[] = [];
    const goImportRegex = /import\s+(?:\([^)]*\)|"[^"]*")/g;
    let match;

    while ((match = goImportRegex.exec(content)) !== null) {
      const importBlock = match[0];
      if (importBlock.includes('(')) {
        const endIndex = content.indexOf(')', match.index);
        if (endIndex !== -1) {
          const imports = content.substring(match.index, endIndex + 1);
          const singleImports = imports.match(/"[^"]*"/g);
          if (singleImports) {
            dependencies.push(...singleImports.map(imp => imp.slice(1, -1)));
          }
        }
      } else {
        const singleMatch = importBlock.match(/"([^"]*)"/);
        if (singleMatch) {
          dependencies.push(singleMatch[1]);
        }
      }
    }

    return [...new Set(dependencies)];
  }

  private extractFunctionParameters(signature: string): string[] {
    const paramMatch = signature.match(/\(([^)]*)\)/);
    if (!paramMatch) return [];
    return paramMatch[1].split(',').map(p => p.trim()).filter(p => p);
  }

  private extractGoReturnType(signature: string): string {
    const returnMatch = signature.match(/\)\s*([^)]*)\s*{?$/);
    return returnMatch ? returnMatch[1].trim() : '';
  }

  private extractGoStructFields(content: string, startIndex: number): string[] {
    const fields: string[] = [];
    const lines = content.split('\n');
    const startLine = this.getLineNumber(content, startIndex) - 1;

    for (let i = startLine + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === '}') break;
      if (line && !line.startsWith('//')) {
        fields.push(line);
      }
    }

    return fields;
  }

  private extractGoInterfaceMethods(content: string, startIndex: number): string[] {
    const methods: string[] = [];
    const lines = content.split('\n');
    const startLine = this.getLineNumber(content, startIndex) - 1;

    for (let i = startLine + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === '}') break;
      if (line && !line.startsWith('//')) {
        methods.push(line);
      }
    }

    return methods;
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