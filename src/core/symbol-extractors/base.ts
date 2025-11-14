import { SymbolInfo } from '@core/duckdb-manager.js';

export interface SymbolExtractionResult {
  symbols: SymbolInfo[];
  dependencies: string[];
  errors: string[];
}

export interface SymbolExtractorOptions {
  includePrivate?: boolean;
  maxFileSize?: number;
  timeout?: number;
}

// Base Language Extractor
export abstract class LanguageSymbolExtractor {
  protected options: SymbolExtractorOptions;

  constructor(options: SymbolExtractorOptions) {
    this.options = options;
  }

  abstract extractSymbols(filePath: string, content: string): SymbolInfo[];
  abstract extractDependencies(content: string): string[];

  protected generateSymbolId(filePath: string, name: string, lineNumber: number): string {
    const normalizedPath = filePath.replace(/\\/g, '/');
    return `${normalizedPath}:${name}:${lineNumber}`;
  }

  protected getLineNumber(content: string, charIndex: number): number {
    const lines = content.substring(0, charIndex).split('\n');
    return lines.length;
  }

  protected shouldIncludeSymbol(name: string): boolean {
    if (this.options.includePrivate) return true;
    return !name.startsWith('_') && name.charAt(0) === name.charAt(0).toUpperCase();
  }
}