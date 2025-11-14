import * as path from 'path';
import { SymbolExtractionResult, SymbolExtractorOptions } from './base.js';
import { GoSymbolExtractor } from './go-extractor.js';
import { TypeScriptSymbolExtractor } from './typescript-extractor.js';
import { PythonSymbolExtractor } from './python-extractor.js';
import { JavaSymbolExtractor } from './java-extractor.js';

/**
 * Symbol Extraction Engine for multiple programming languages
 * Extracts functions, classes, variables with metadata and complexity metrics
 */
export class SymbolExtractor {
  private readonly supportedLanguages = ['go', 'typescript', 'javascript', 'python', 'java'];

  /**
   * Extract symbols from source code content
   */
  async extractSymbols(
    filePath: string,
    content: string,
    options: SymbolExtractorOptions = {}
  ): Promise<SymbolExtractionResult> {
    const language = this.detectLanguage(filePath);
    const result: SymbolExtractionResult = {
      symbols: [],
      dependencies: [],
      errors: []
    };

    if (!this.supportedLanguages.includes(language)) {
      result.errors.push(`Unsupported language: ${language}`);
      return result;
    }

    try {
      // Check file size limit
      if (options.maxFileSize && content.length > options.maxFileSize) {
        result.errors.push(`File too large: ${content.length} bytes`);
        return result;
      }

      // Create appropriate extractor
      const extractor = this.createExtractor(language, options);
      result.symbols = extractor.extractSymbols(filePath, content);
      result.dependencies = extractor.extractDependencies(content);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push(`Symbol extraction failed: ${errorMessage}`);
    }

    return result;
  }

  private createExtractor(language: string, options: SymbolExtractorOptions) {
    switch (language) {
      case 'go':
        return new GoSymbolExtractor(options);
      case 'typescript':
      case 'javascript':
        return new TypeScriptSymbolExtractor(options);
      case 'python':
        return new PythonSymbolExtractor(options);
      case 'java':
        return new JavaSymbolExtractor(options);
      default:
        throw new Error(`Unsupported language: ${language}`);
    }
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
      '.java': 'java'
    };

    return languageMap[ext] || 'unknown';
  }
}