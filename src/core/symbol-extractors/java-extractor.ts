import { LanguageSymbolExtractor } from './base.js';
import { SymbolInfo } from '@/core/duckdb-manager.js';

export class JavaSymbolExtractor extends LanguageSymbolExtractor {
  extractSymbols(filePath: string, content: string): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];

    // Class extraction
    this.extractJavaClasses(filePath, content, symbols);

    // Method extraction
    this.extractJavaMethods(filePath, content, symbols);

    // Field extraction
    this.extractJavaFields(filePath, content, symbols);

    return symbols;
  }

  private extractJavaClasses(filePath: string, content: string, symbols: SymbolInfo[]): void {
    // Match class declarations: public class ClassName { or class ClassName {
    const classRegex = /(?:public\s+|private\s+|protected\s+)?(?:abstract\s+|final\s+)?class\s+(\w+)/g;
    let match;

    while ((match = classRegex.exec(content)) !== null) {
      const lineNumber = this.getLineNumber(content, match.index);
      const name = match[1];

      if (!this.shouldIncludeSymbol(name)) continue;

      symbols.push({
        id: this.generateSymbolId(filePath, name, lineNumber),
        name,
        type: 'class',
        file_path: filePath,
        line_number: lineNumber,
        visibility: content.substring(match.index - 20, match.index).includes('public') ? 'public' :
                   content.substring(match.index - 20, match.index).includes('private') ? 'private' : 'package',
        complexity: 1,
        language: 'java',
        metadata: {
          modifiers: this.extractJavaModifiers(content, match.index)
        }
      });
    }
  }

  private extractJavaMethods(filePath: string, content: string, symbols: SymbolInfo[]): void {
    // Match method declarations: public void methodName( or private int methodName(
    const methodRegex = /(?:public\s+|private\s+|protected\s+)?(?:static\s+|final\s+|abstract\s+)?(?:\w+\s+)+(\w+)\s*\([^)]*\)\s*(?:throws\s+[^;]+)?(?:\{|;)/g;
    let match;

    while ((match = methodRegex.exec(content)) !== null) {
      // Skip constructors (they have the same name as the class)
      if (this.isConstructor(content, match)) continue;

      const lineNumber = this.getLineNumber(content, match.index);
      const name = match[1];

      if (!this.shouldIncludeSymbol(name)) continue;

      const complexity = this.calculateJavaComplexity(content, match.index);

      symbols.push({
        id: this.generateSymbolId(filePath, name, lineNumber),
        name,
        type: 'method',
        file_path: filePath,
        line_number: lineNumber,
        signature: match[0].trim(),
        visibility: content.substring(match.index - 20, match.index).includes('public') ? 'public' :
                   content.substring(match.index - 20, match.index).includes('private') ? 'private' : 'package',
        complexity,
        language: 'java',
        metadata: {
          parameters: this.extractJavaParameters(match[0]),
          returnType: this.extractJavaReturnType(match[0]),
          modifiers: this.extractJavaModifiers(content, match.index)
        }
      });
    }
  }

  private extractJavaFields(filePath: string, content: string, symbols: SymbolInfo[]): void {
    // Match field declarations: private int fieldName; or public String fieldName =
    const fieldRegex = /(?:public\s+|private\s+|protected\s+)?(?:static\s+|final\s+)?(\w+)\s+(\w+)\s*[=;]/g;
    let match;

    while ((match = fieldRegex.exec(content)) !== null) {
      const lineNumber = this.getLineNumber(content, match.index);
      const type = match[1];
      const name = match[2];

      // Skip method parameters and local variables by checking context
      if (!this.isFieldDeclaration(content, match.index)) continue;

      if (!this.shouldIncludeSymbol(name)) continue;

      symbols.push({
        id: this.generateSymbolId(filePath, name, lineNumber),
        name,
        type: 'field',
        file_path: filePath,
        line_number: lineNumber,
        visibility: content.substring(match.index - 20, match.index).includes('public') ? 'public' :
                   content.substring(match.index - 20, match.index).includes('private') ? 'private' : 'package',
        complexity: 1,
        language: 'java',
        metadata: {
          fieldType: type,
          modifiers: this.extractJavaModifiers(content, match.index)
        }
      });
    }
  }

  private calculateJavaComplexity(content: string, startIndex: number): number {
    const methodEnd = this.findJavaMethodEnd(content, startIndex);
    if (methodEnd === -1) return 1;

    const methodContent = content.substring(startIndex, methodEnd);
    let complexity = 1;

    const controlFlowPatterns = [
      /\bif\s*\(/g, /\belse\s+/g, /\bfor\s*\(/g, /\bwhile\s*\(/g,
      /\bdo\s*\{/g, /\bswitch\s*\(/g, /\bcatch\s*\(/g, /\bcase\s+/g,
      /\b&&/g, /\b\|\|/g, /\?/g
    ];

    for (const pattern of controlFlowPatterns) {
      const matches = methodContent.match(pattern);
      if (matches) complexity += matches.length;
    }

    return complexity;
  }

  extractDependencies(content: string): string[] {
    const dependencies: string[] = [];

    // Import statements: import java.util.List;
    const importRegex = /^\s*import\s+([^;]+);/gm;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1].trim();
      // Extract package name (e.g., "java.util.List" -> "java.util")
      const packageName = importPath.split('.').slice(0, -1).join('.');
      if (packageName) {
        dependencies.push(packageName);
      }
    }

    return [...new Set(dependencies)];
  }

  private extractJavaModifiers(content: string, startIndex: number): string[] {
    const modifiers: string[] = [];
    const beforeMatch = content.substring(Math.max(0, startIndex - 100), startIndex);

    if (beforeMatch.includes('public')) modifiers.push('public');
    if (beforeMatch.includes('private')) modifiers.push('private');
    if (beforeMatch.includes('protected')) modifiers.push('protected');
    if (beforeMatch.includes('static')) modifiers.push('static');
    if (beforeMatch.includes('final')) modifiers.push('final');
    if (beforeMatch.includes('abstract')) modifiers.push('abstract');

    return modifiers;
  }

  private extractJavaParameters(signature: string): string[] {
    const paramMatch = signature.match(/\(([^)]*)\)/);
    if (!paramMatch) return [];

    return paramMatch[1].split(',').map(p => p.trim()).filter(p => p);
  }

  private extractJavaReturnType(signature: string): string {
    // Extract return type from method signature
    const returnTypeMatch = signature.match(/(?:public\s+|private\s+|protected\s+)?(?:static\s+|final\s+|abstract\s+)?(\w+(?:<[^>]+>)?(?:\[\])?)\s+\w+\s*\(/);
    return returnTypeMatch ? returnTypeMatch[1] : 'void';
  }

  private isConstructor(content: string, match: RegExpExecArray): boolean {
    // Check if this method has the same name as a class in the file
    const methodName = match[1];
    const classRegex = new RegExp(`class\\s+${methodName}\\b`);
    return classRegex.test(content);
  }

  private isFieldDeclaration(content: string, index: number): boolean {
    // Check if this is inside a class but not inside a method
    const beforeContext = content.substring(Math.max(0, index - 500), index);
    const afterContext = content.substring(index, Math.min(content.length, index + 100));

    // Count braces to determine if we're inside a method
    let braceCount = 0;
    for (let i = 0; i < beforeContext.length; i++) {
      if (beforeContext[i] === '{') braceCount++;
      if (beforeContext[i] === '}') braceCount--;
    }

    // If brace count is 1, we're inside a class but not inside a method
    return braceCount === 1 && !afterContext.includes('(');
  }

  private findJavaMethodEnd(content: string, startIndex: number): number {
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

      if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          return i;
        }
      }
    }

    return -1;
  }
}