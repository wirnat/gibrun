import { DuckDBManager } from '@/core/duckdb-manager.js';
import { logInfo, logError } from '@/services/logger-service.js';
import { promisifyRun, promisifyAll, promisifyGet } from '@/utils/duckdb-promisify.js';

export interface SearchOptions {
  limit?: number;
  language?: string;
  type?: string;
  filePath?: string;
  minScore?: number;
  fuzzy?: boolean;
  caseSensitive?: boolean;
}

export interface SearchResult {
  symbol: {
    id: string;
    name: string;
    type: string;
    file_path: string;
    line_number: number;
    signature?: string;
    language: string;
  };
  score: number;
  context: {
    last_modified: Date;
    file_lines: number;
  };
  highlights?: string[];
}

export interface MultiFieldSearchResult extends SearchResult {
  matched_fields: string[];
  field_scores: Record<string, number>;
}

export interface SearchIndexStats {
  total_documents: number;
  last_updated: Date;
  index_size_bytes: number;
  search_performance: {
    avg_query_time_ms: number;
    total_queries: number;
    cache_hit_rate: number;
  };
}

/**
 * Full-Text Search Engine with DuckDB FTS integration
 * Provides BM25 ranking, multi-field search, and index maintenance
 */
export class FullTextSearchEngine {
  private ftsTableName = 'symbols_fts';
  private searchCache = new Map<string, { results: SearchResult[]; timestamp: number }>();
  private readonly cacheExpiryMs = 5 * 60 * 1000; // 5 minutes

  constructor(private duckdbManager: DuckDBManager) {}

  /**
   * Perform full-text search with BM25 ranking
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    // Check cache first
    const cacheKey = this.generateCacheKey(query, options);
    const cached = this.searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiryMs) {
      logInfo('Returning cached search results', { query, resultsCount: cached.results.length });
      return cached.results;
    }

    const connection = this.duckdbManager.getConnection();

    try {
      // Ensure FTS index exists
      await this.ensureFtsIndex(connection);

      // Build search query
      let sqlParts: string[] = [
        `SELECT
          s.id, s.name, s.type, s.file_path, s.line_number,
          s.signature, s.language,
          f.last_modified, f.lines_count,
          fts_match_bm25(s.name || ' ' || COALESCE(s.signature, '') || ' ' || s.file_path, ?) as score
        FROM ${this.ftsTableName} s
        JOIN files f ON s.file_path = f.file_path
        WHERE score > ?`
      ];

      const params: any[] = [query, options.minScore || 0];

      // Add filters
      if (options.language) {
        sqlParts.push(' AND s.language = ?');
        params.push(options.language);
      }

      if (options.type) {
        sqlParts.push(' AND s.type = ?');
        params.push(options.type);
      }

      if (options.filePath) {
        sqlParts.push(' AND s.file_path LIKE ?');
        params.push(`%${options.filePath}%`);
      }

      // Add ordering and limit
      sqlParts.push(' ORDER BY score DESC');

      if (options.limit) {
        sqlParts.push(' LIMIT ?');
        params.push(options.limit);
      } else {
        sqlParts.push(' LIMIT 50'); // Default limit
      }

      const sql = sqlParts.join('');

      const startTime = Date.now();
      const result = await  promisifyAll(connection,sql, ...params);
      const queryTime = Date.now() - startTime;

      const searchResults: SearchResult[] = result.map((row: any) => ({
        symbol: {
          id: row.id,
          name: row.name,
          type: row.type,
          file_path: row.file_path,
          line_number: row.line_number,
          signature: row.signature,
          language: row.language
        },
        score: row.score,
        context: {
          last_modified: new Date(row.last_modified),
          file_lines: row.lines_count
        },
        highlights: this.generateHighlights(query, row.name, row.signature, row.file_path)
      }));

      // Cache results
      this.searchCache.set(cacheKey, { results: searchResults, timestamp: Date.now() });

      logInfo('Full-text search completed', {
        query,
        resultsCount: searchResults.length,
        queryTimeMs: queryTime,
        options
      });

      return searchResults;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError('Full-text search failed', { error: errorMessage, query, options });
      throw new Error(`Full-text search failed: ${errorMessage}`);
    } finally {
      connection.close();
    }
  }

  /**
   * Multi-field search with detailed field matching
   */
  async multiFieldSearch(query: string, options: SearchOptions = {}): Promise<MultiFieldSearchResult[]> {
    const connection = this.duckdbManager.getConnection();

    try {
      await this.ensureFtsIndex(connection);

      // Search across multiple fields with individual scoring
      let sqlParts: string[] = [
        `SELECT
          s.id, s.name, s.type, s.file_path, s.line_number,
          s.signature, s.language,
          f.last_modified, f.lines_count,
          fts_match_bm25(s.name, ?) as name_score,
          fts_match_bm25(COALESCE(s.signature, ''), ?) as signature_score,
          fts_match_bm25(s.file_path, ?) as path_score
        FROM ${this.ftsTableName} s
        JOIN files f ON s.file_path = f.file_path
        WHERE (name_score > 0 OR signature_score > 0 OR path_score > 0)`
      ];

      const params: any[] = [query, query, query];

      // Add filters
      if (options.language) {
        sqlParts.push(' AND s.language = ?');
        params.push(options.language);
      }

      if (options.type) {
        sqlParts.push(' AND s.type = ?');
        params.push(options.type);
      }

      const sql = sqlParts.join('');

      // Calculate combined score and filter
      const minScore = options.minScore || 0;
      const results = await  promisifyAll(connection,sql, ...params);

      const multiFieldResults: MultiFieldSearchResult[] = (results as any[])
        .map((row: any) => {
          const fieldScores = {
            name: row.name_score || 0,
            signature: row.signature_score || 0,
            path: row.path_score || 0
          };

          const maxScore = Math.max(...Object.values(fieldScores));
          const matchedFields = Object.entries(fieldScores)
            .filter(([_, score]) => score > 0)
            .map(([field, _]) => field);

          return {
            symbol: {
              id: row.id,
              name: row.name,
              type: row.type,
              file_path: row.file_path,
              line_number: row.line_number,
              signature: row.signature,
              language: row.language
            },
            score: maxScore,
            context: {
              last_modified: new Date(row.last_modified),
              file_lines: row.lines_count
            },
            highlights: this.generateHighlights(query, row.name, row.signature, row.file_path),
            matched_fields: matchedFields,
            field_scores: fieldScores
          };
        })
        .filter(result => result.score > minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, options.limit || 50);

      logInfo('Multi-field search completed', {
        query,
        resultsCount: multiFieldResults.length,
        options
      });

      return multiFieldResults;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError('Multi-field search failed', { error: errorMessage, query });
      throw new Error(`Multi-field search failed: ${errorMessage}`);
    } finally {
      connection.close();
    }
  }

  /**
   * Fuzzy search for approximate matches
   */
  async fuzzySearch(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    // Implement fuzzy search using Levenshtein distance or similar algorithms
    // For now, use prefix matching and edit distance approximations
    const connection = this.duckdbManager.getConnection();

    try {
      await this.ensureFtsIndex(connection);

      // Use DuckDB's string similarity functions
      let sqlParts: string[] = [
        `SELECT
          s.id, s.name, s.type, s.file_path, s.line_number,
          s.signature, s.language,
          f.last_modified, f.lines_count,
          (1.0 - levenshtein(s.name, ?)::DOUBLE / GREATEST(length(s.name), length(?))) as similarity_score
        FROM ${this.ftsTableName} s
        JOIN files f ON s.file_path = f.file_path
        WHERE similarity_score > 0.6
          AND length(s.name) >= 3`
      ];

      const params: any[] = [query, query];

      // Add filters
      if (options.language) {
        sqlParts.push(' AND s.language = ?');
        params.push(options.language);
      }

      if (options.type) {
        sqlParts.push(' AND s.type = ?');
        params.push(options.type);
      }

      sqlParts.push(' ORDER BY similarity_score DESC LIMIT ?');
      params.push(options.limit || 20);

      const sql = sqlParts.join('');

      const result = await  promisifyAll(connection,sql, ...params);

      const fuzzyResults: SearchResult[] = result.map((row: any) => ({
        symbol: {
          id: row.id,
          name: row.name,
          type: row.type,
          file_path: row.file_path,
          line_number: row.line_number,
          signature: row.signature,
          language: row.language
        },
        score: row.similarity_score,
        context: {
          last_modified: new Date(row.last_modified),
          file_lines: row.lines_count
        },
        highlights: [`Fuzzy match: ${row.name}`]
      }));

      logInfo('Fuzzy search completed', {
        query,
        resultsCount: fuzzyResults.length,
        options
      });

      return fuzzyResults;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError('Fuzzy search failed', { error: errorMessage, query });
      throw new Error(`Fuzzy search failed: ${errorMessage}`);
    } finally {
      connection.close();
    }
  }

  /**
   * Update the full-text search index
   */
  async updateSearchIndex(): Promise<void> {
    const connection = this.duckdbManager.getConnection();

    try {
      logInfo('Starting FTS index update');

      // Drop existing FTS table
      await promisifyRun(connection, `DROP TABLE IF EXISTS ${this.ftsTableName}`);

      // Create new FTS table from symbols
      await promisifyRun(connection, `
        CREATE TABLE ${this.ftsTableName} AS
        SELECT * FROM symbols WHERE 1=0
      `);

      // Insert all current symbols
      await promisifyRun(connection, `
        INSERT INTO ${this.ftsTableName}
        SELECT * FROM symbols
      `);

      // Create FTS index
      await promisifyRun(connection, `
        CREATE INDEX IF NOT EXISTS symbol_search_idx ON ${this.ftsTableName}
        USING FTS (name, signature, file_path)
      `);

      // Clear cache
      this.searchCache.clear();

      logInfo('FTS index updated successfully');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError('FTS index update failed', { error: errorMessage });
      throw new Error(`FTS index update failed: ${errorMessage}`);
    } finally {
      connection.close();
    }
  }

  /**
   * Get search index statistics
   */
  async getIndexStats(): Promise<SearchIndexStats> {
    const connection = this.duckdbManager.getConnection();

    try {
      // Get basic stats
      const stats = await  promisifyAll(connection,`
        SELECT
          COUNT(*) as total_documents,
          MAX(updated_at) as last_updated
        FROM ${this.ftsTableName}
      `);

      // Get index size (approximate)
      const sizeStats = await  promisifyAll(connection,`
        SELECT SUM(estimated_size) as index_size_bytes
        FROM duckdb_tables()
        WHERE table_name LIKE '%${this.ftsTableName}%'
      `);

      // Mock performance stats (in real implementation, track actual metrics)
      const performanceStats = {
        avg_query_time_ms: 45, // Mock value
        total_queries: this.searchCache.size,
        cache_hit_rate: 0.75 // Mock value
      };

      return {
        total_documents: stats[0].total_documents || 0,
        last_updated: stats[0].last_updated ? new Date(stats[0].last_updated) : new Date(),
        index_size_bytes: sizeStats[0].index_size_bytes || 0,
        search_performance: performanceStats
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError('Failed to get index stats', { error: errorMessage });
      throw new Error(`Failed to get index stats: ${errorMessage}`);
    } finally {
      connection.close();
    }
  }

  /**
   * Optimize search index for better performance
   */
  async optimizeIndex(): Promise<void> {
    const connection = this.duckdbManager.getConnection();

    try {
      logInfo('Starting FTS index optimization');

      // Analyze the FTS table
      await promisifyRun(connection, `ANALYZE ${this.ftsTableName}`);

      // Rebuild FTS index
      await promisifyRun(connection, `REINDEX symbol_search_idx`);

      // Vacuum to reclaim space
      await promisifyRun(connection, 'VACUUM');

      logInfo('FTS index optimization completed');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError('FTS index optimization failed', { error: errorMessage });
      throw new Error(`FTS index optimization failed: ${errorMessage}`);
    } finally {
      connection.close();
    }
  }

  /**
   * Clear search cache
   */
  clearCache(): void {
    this.searchCache.clear();
    logInfo('Search cache cleared');
  }

  // ===== Private Helper Methods =====

  private async ensureFtsIndex(connection: any): Promise<void> {
    try {
      // Check if FTS table exists
      const result = await  promisifyAll(connection,`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='${this.ftsTableName}'
      `);

      if (result.length === 0) {
        await this.updateSearchIndex();
      }
    } catch (error) {
      // If check fails, try to create index
      await this.updateSearchIndex();
    }
  }

  private generateCacheKey(query: string, options: SearchOptions): string {
    return `${query}:${JSON.stringify(options)}`;
  }

  private generateHighlights(query: string, name: string, signature: string | null, filePath: string): string[] {
    const highlights: string[] = [];
    const queryLower = query.toLowerCase();

    // Highlight matches in name
    if (name.toLowerCase().includes(queryLower)) {
      highlights.push(`Name: ${name}`);
    }

    // Highlight matches in signature
    if (signature && signature.toLowerCase().includes(queryLower)) {
      highlights.push(`Signature: ${signature}`);
    }

    // Highlight matches in file path
    if (filePath.toLowerCase().includes(queryLower)) {
      highlights.push(`Path: ${filePath}`);
    }

    return highlights;
  }
}