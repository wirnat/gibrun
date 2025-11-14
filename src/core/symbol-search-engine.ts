import { DuckDBManager, SymbolInfo } from '@/core/duckdb-manager.js';
import { logInfo, logError } from '@/services/logger-service.js';
import { promisifyRun, promisifyAll, promisifyGet } from '@/utils/duckdb-promisify.js';

export interface SymbolSearchQuery {
  searchTerm?: string;
  type?: string;
  language?: string;
  filePath?: string;
  minComplexity?: number;
  limit?: number;
  sortBy?: 'name' | 'complexity' | 'line_number';
  sortOrder?: 'asc' | 'desc';
}

export interface SymbolResult extends SymbolInfo {
  last_modified: Date;
  file_lines: number;
}

export interface ReferenceResult {
  type: 'definition' | 'usage';
  file_path: string;
  line_number?: number;
  signature?: string;
  language: string;
}

export interface CrossReferenceResult {
  symbol_name: string;
  definitions: ReferenceResult[];
  usages: ReferenceResult[];
  total_references: number;
}

/**
 * Advanced Symbol Search Engine with filtering and cross-references
 * Provides high-performance symbol search with full-text capabilities
 */
export class SymbolSearchEngine {
  constructor(private duckdbManager: DuckDBManager) {}

  /**
   * Advanced symbol search with multiple filtering options
   */
  async searchSymbols(query: SymbolSearchQuery): Promise<SymbolResult[]> {
    const connection = this.duckdbManager.getConnection();

    try {
      let sql = `
        SELECT
          s.id, s.name, s.type, s.file_path, s.line_number,
          s.signature, s.visibility, s.complexity, s.language,
          s.metadata, s.created_at, s.updated_at,
          f.last_modified, f.lines_count
        FROM symbols s
        JOIN files f ON s.file_path = f.file_path
        WHERE 1=1
      `;

      const params: any[] = [];

      // Add search filters
      if (query.searchTerm) {
        sql += ' AND s.name ILIKE ?';
        params.push(`%${query.searchTerm}%`);
      }

      if (query.type) {
        sql += ' AND s.type = ?';
        params.push(query.type);
      }

      if (query.language) {
        sql += ' AND s.language = ?';
        params.push(query.language);
      }

      if (query.filePath) {
        sql += ' AND s.file_path = ?';
        params.push(query.filePath);
      }

      if (query.minComplexity !== undefined) {
        sql += ' AND s.complexity >= ?';
        params.push(query.minComplexity);
      }

      // Add ordering
      const sortBy = query.sortBy || 'name';
      const sortOrder = query.sortOrder || 'asc';
      sql += ` ORDER BY s.${sortBy} ${sortOrder}`;

      // Add limit
      if (query.limit) {
        sql += ' LIMIT ?';
        params.push(query.limit);
      }

      const result = await  promisifyAll(connection,sql, ...params);

      logInfo('Symbol search completed', {
        query: query.searchTerm || 'all',
        resultsCount: result.length,
        filters: {
          type: query.type,
          language: query.language,
          minComplexity: query.minComplexity
        }
      });

      return result.map((row: any) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        file_path: row.file_path,
        line_number: row.line_number,
        signature: row.signature,
        visibility: row.visibility,
        complexity: row.complexity,
        language: row.language,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        last_modified: new Date(row.last_modified),
        file_lines: row.lines_count
      }));

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError('Symbol search failed', { error: errorMessage, query });
      throw new Error(`Symbol search failed: ${errorMessage}`);
    } finally {
      connection.close();
    }
  }

  /**
   * Find all references to a symbol (definitions and usages)
   */
  async findReferences(symbolName: string, filePath?: string): Promise<ReferenceResult[]> {
    const connection = this.duckdbManager.getConnection();

    try {
      let sql = `
        SELECT
          'definition' as reference_type,
          s.file_path,
          s.line_number,
          s.signature,
          s.language
        FROM symbols s
        WHERE s.name = ?

        UNION ALL

        SELECT
          'usage' as reference_type,
          d.from_file as file_path,
          NULL as line_number,
          d.symbol_name as signature,
          f.language
        FROM dependencies d
        JOIN files f ON d.from_file = f.file_path
        WHERE d.symbol_name = ?
      `;

      const params: any[] = [symbolName, symbolName];

      if (filePath) {
        sql += ' AND (s.file_path = ? OR d.from_file = ?)';
        params.push(filePath, filePath);
      }

      sql += ' ORDER BY file_path, line_number';

      const result = await  promisifyAll(connection,sql, ...params);

      logInfo('Reference search completed', {
        symbolName,
        resultsCount: result.length
      });

      return result.map((row: any) => ({
        type: row.reference_type as 'definition' | 'usage',
        file_path: row.file_path,
        line_number: row.line_number,
        signature: row.signature,
        language: row.language
      }));

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError('Reference search failed', { error: errorMessage, symbolName });
      throw new Error(`Reference search failed: ${errorMessage}`);
    } finally {
      connection.close();
    }
  }

  /**
   * Get comprehensive cross-references for a symbol
   */
  async getCrossReferences(symbolName: string): Promise<CrossReferenceResult> {
    const allReferences = await this.findReferences(symbolName);

    const definitions = allReferences.filter(ref => ref.type === 'definition');
    const usages = allReferences.filter(ref => ref.type === 'usage');

    return {
      symbol_name: symbolName,
      definitions,
      usages,
      total_references: allReferences.length
    };
  }

  /**
   * Find symbols by type and language
   */
  async findSymbolsByType(type: string, language?: string, limit = 100): Promise<SymbolResult[]> {
    return this.searchSymbols({
      type,
      language,
      limit,
      sortBy: 'name',
      sortOrder: 'asc'
    });
  }

  /**
   * Find complex symbols (high complexity)
   */
  async findComplexSymbols(minComplexity = 10, language?: string, limit = 50): Promise<SymbolResult[]> {
    return this.searchSymbols({
      minComplexity,
      language,
      limit,
      sortBy: 'complexity',
      sortOrder: 'desc'
    });
  }

  /**
   * Search symbols in specific file
   */
  async searchInFile(filePath: string, searchTerm?: string): Promise<SymbolResult[]> {
    return this.searchSymbols({
      filePath,
      searchTerm,
      sortBy: 'line_number',
      sortOrder: 'asc'
    });
  }

  /**
   * Get symbol statistics
   */
  async getSymbolStatistics(): Promise<{
    total_symbols: number;
    by_type: Record<string, number>;
    by_language: Record<string, number>;
    avg_complexity: number;
    max_complexity: number;
  }> {
    const connection = this.duckdbManager.getConnection();

    try {
      const stats = await  promisifyAll(connection,`
        SELECT
          COUNT(*) as total_symbols,
          AVG(complexity) as avg_complexity,
          MAX(complexity) as max_complexity
        FROM symbols
      `);

      const byType = await  promisifyAll(connection,`
        SELECT type, COUNT(*) as count
        FROM symbols
        GROUP BY type
        ORDER BY count DESC
      `);

      const byLanguage = await  promisifyAll(connection,`
        SELECT language, COUNT(*) as count
        FROM symbols
        GROUP BY language
        ORDER BY count DESC
      `);

      const typeMap: Record<string, number> = {};
      byType.forEach((row: any) => {
        typeMap[row.type] = row.count;
      });

      const languageMap: Record<string, number> = {};
      byLanguage.forEach((row: any) => {
        languageMap[row.language] = row.count;
      });

      return {
        total_symbols: stats[0].total_symbols,
        by_type: typeMap,
        by_language: languageMap,
        avg_complexity: stats[0].avg_complexity || 0,
        max_complexity: stats[0].max_complexity || 0
      };

    } finally {
      connection.close();
    }
  }
}