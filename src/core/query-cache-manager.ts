import * as crypto from 'crypto';
import { logInfo, logError } from '@/services/logger-service.js';
import { DuckDBCacheManager } from '@/core/duckdb-cache-manager.js';
import { QueryResult } from '@/types/cache.js';
import { promisifyRun, promisifyAll, promisifyGet } from '@/utils/duckdb-promisify.js';

interface LoggerService {
  info(message: string, meta?: any): void;
  error(message: string, error?: any, meta?: any): void;
  debug(message: string, meta?: any): void;
}

class SimpleLogger implements LoggerService {
  info(message: string, meta?: any): void {
    logInfo(message, meta);
  }

  error(message: string, error?: any, meta?: any): void {
    logError(message, error, meta);
  }

  debug(message: string, meta?: any): void {
    logInfo(`[DEBUG] ${message}`, meta);
  }
}

/**
 * Query Cache Manager - Cache complex SQL query results
 */
export class QueryCacheManager {
  private logger: LoggerService;
  private cacheManager: DuckDBCacheManager;

  constructor(
    cacheManager: DuckDBCacheManager,
    logger?: LoggerService
  ) {
    this.cacheManager = cacheManager;
    this.logger = logger || new SimpleLogger();
  }

  /**
   * Execute query with caching
   */
  async executeCachedQuery(sql: string, params: any[] = []): Promise<any[]> {
    const queryHash = this.hashQuery(sql, params);

    // Check cache first
    const cached = await this.getCachedQuery(queryHash);
    if (cached && this.isCacheValid(cached)) {
      await this.recordCacheHit(queryHash);
      this.logger.debug('Query cache hit', { queryHash, rowCount: cached.result.length });
      return cached.result;
    }

    // Execute query
    const startTime = Date.now();
    const result = await this.executeQuery(sql, params);
    const executionTime = Date.now() - startTime;

    // Cache if expensive
    if (this.shouldCacheQuery(executionTime, result.length)) {
      await this.cacheQueryResult(queryHash, sql, params, result, executionTime);
    }

    return result;
  }

  /**
   * Execute query directly (helper method)
   */
  private async executeQuery(sql: string, params: any[] = []): Promise<any[]> {
    const connection = this.cacheManager.getConnection();

    try {
      const result = await  promisifyAll(connection,sql, ...params);
      return result;
    } finally {
      connection.close();
    }
  }

  /**
   * Generate hash for query and parameters
   */
  private hashQuery(sql: string, params: any[]): string {
    const normalizedSql = sql.replace(/\s+/g, ' ').trim();
    return crypto.createHash('md5')
      .update(normalizedSql + JSON.stringify(params))
      .digest('hex');
  }

  /**
   * Check if query should be cached based on execution time and result size
   */
  private shouldCacheQuery(executionTime: number, resultSize: number): boolean {
    // Cache queries that take more than 100ms or return more than 1000 rows
    return executionTime > 100 || resultSize > 1000;
  }

  /**
   * Get cached query result
   */
  private async getCachedQuery(queryHash: string): Promise<{
    result: any[];
    expires_at: string;
    execution_time_ms: number;
  } | null> {
    const connection = this.cacheManager.getConnection();

    try {
      const result = await  promisifyAll(connection,`
        SELECT result, expires_at, execution_time_ms
        FROM query_cache
        WHERE query_hash = ? AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
      `, [queryHash]);

      if (result.length === 0) return null;

      const row = result[0] as any;
      return {
        result: JSON.parse(row.result),
        expires_at: row.expires_at,
        execution_time_ms: row.execution_time_ms
      };

    } catch (error) {
      this.logger.error('Failed to get cached query', error, { queryHash });
      return null;
    } finally {
      connection.close();
    }
  }

  /**
   * Check if cached result is still valid
   */
  private isCacheValid(cached: any): boolean {
    return !cached.expires_at || new Date(cached.expires_at) > new Date();
  }

  /**
   * Record cache hit and update statistics
   */
  private async recordCacheHit(queryHash: string): Promise<void> {
    const connection = this.cacheManager.getConnection();

    try {
      await  promisifyRun(connection,`
        UPDATE query_cache
        SET hit_count = hit_count + 1, last_accessed = CURRENT_TIMESTAMP
        WHERE query_hash = ?
      `, [queryHash]);

    } catch (error) {
      this.logger.error('Failed to record cache hit', error, { queryHash });
    } finally {
      connection.close();
    }
  }

  /**
   * Cache query result
   */
  private async cacheQueryResult(
    queryHash: string,
    sql: string,
    params: any[],
    result: any[],
    executionTime: number
  ): Promise<void> {
    const connection = this.cacheManager.getConnection();

    try {
      // Default TTL: 1 hour for queries
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      await  promisifyRun(connection,`
        INSERT OR REPLACE INTO query_cache
        (query_hash, query_sql, parameters, result, execution_time_ms, result_row_count, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        queryHash,
        sql,
        JSON.stringify(params),
        JSON.stringify(result),
        executionTime,
        result.length,
        expiresAt
      ]);

      this.logger.debug('Query result cached', {
        queryHash,
        executionTime,
        resultRowCount: result.length
      });

    } catch (error) {
      this.logger.error('Failed to cache query result', error, { queryHash });
    } finally {
      connection.close();
    }
  }

  /**
   * Get query performance statistics
   */
  async getPerformanceStats(): Promise<{
    total_queries: number;
    cached_queries: number;
    hit_rate: number;
    avg_execution_time_saved: number;
    total_cache_size_mb: number;
  }> {
    const connection = this.cacheManager.getConnection();

    try {
      const stats = await  promisifyAll(connection,`
        SELECT
          COUNT(*) as total_queries,
          COUNT(CASE WHEN hit_count > 0 THEN 1 END) as cached_queries,
          COALESCE(AVG(hit_count), 0) as avg_hit_rate,
          COALESCE(AVG(execution_time_ms), 0) as avg_execution_time,
          COALESCE(SUM(LENGTH(result)), 0) / (1024 * 1024) as cache_size_mb
        FROM query_cache
      `);

      const data = stats[0] as any;
      const totalQueries = data.total_queries || 0;
      const cachedQueries = data.cached_queries || 0;

      return {
        total_queries: totalQueries,
        cached_queries: cachedQueries,
        hit_rate: totalQueries > 0 ? (cachedQueries / totalQueries) : 0,
        avg_execution_time_saved: data.avg_execution_time || 0,
        total_cache_size_mb: data.cache_size_mb || 0
      };

    } catch (error) {
      this.logger.error('Failed to get performance stats', error);
      return {
        total_queries: 0,
        cached_queries: 0,
        hit_rate: 0,
        avg_execution_time_saved: 0,
        total_cache_size_mb: 0
      };
    } finally {
      connection.close();
    }
  }

  /**
   * Invalidate query cache by pattern
   */
  async invalidateByPattern(pattern: string): Promise<number> {
    const connection = this.cacheManager.getConnection();

    try {
      const likePattern = pattern.replace(/\*/g, '%');
      await promisifyRun(connection, `
        UPDATE query_cache
        SET expires_at = CURRENT_TIMESTAMP
        WHERE query_sql LIKE ?
      `, [likePattern]);

      const invalidated = 0; // Cannot determine affected rows in DuckDB

      if (invalidated > 0) {
        this.logger.debug('Query cache invalidated by pattern', { pattern, count: invalidated });
      }

      return invalidated;

    } catch (error) {
      this.logger.error('Failed to invalidate query cache by pattern', error, { pattern });
      return 0;
    } finally {
      connection.close();
    }
  }

  /**
   * Clear expired query cache entries
   */
  async clearExpired(): Promise<number> {
    const connection = this.cacheManager.getConnection();

    try {
      await promisifyRun(connection, `
        DELETE FROM query_cache
        WHERE expires_at <= CURRENT_TIMESTAMP
      `);

      const deleted = 0; // Cannot determine affected rows in DuckDB

      if (deleted > 0) {
        this.logger.debug('Expired query cache entries cleared', { count: deleted });
      }

      return deleted;

    } catch (error) {
      this.logger.error('Failed to clear expired query cache', error);
      return 0;
    } finally {
      connection.close();
    }
  }

  /**
   * Get most expensive cached queries
   */
  async getMostExpensiveQueries(limit: number = 10): Promise<Array<{
    query_hash: string;
    query_sql: string;
    execution_time_ms: number;
    hit_count: number;
    last_accessed: string;
  }>> {
    const connection = this.cacheManager.getConnection();

    try {
      const result = await  promisifyAll(connection,`
        SELECT query_hash, query_sql, execution_time_ms, hit_count, last_accessed
        FROM query_cache
        WHERE execution_time_ms > 0
        ORDER BY execution_time_ms DESC
        LIMIT ?
      `, [limit]);

      return result.map((row: any) => ({
        query_hash: row.query_hash,
        query_sql: row.query_sql,
        execution_time_ms: row.execution_time_ms,
        hit_count: row.hit_count,
        last_accessed: row.last_accessed
      }));

    } catch (error) {
      this.logger.error('Failed to get most expensive queries', error);
      return [];
    } finally {
      connection.close();
    }
  }
}