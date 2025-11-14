import { logInfo, logError } from '@/services/logger-service.js';
import { DuckDBCacheManager } from '@core/duckdb-cache-manager.js';
import { InvalidationResult } from '@types/cache.js';
import { promisifyRun, promisifyAll, promisifyGet } from '@utils/duckdb-promisify.js';

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
 * Cache Invalidation Manager - Intelligent cache invalidation strategies
 */
export class CacheInvalidationManager {
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
   * Invalidate all expired entries across all cache types
   */
  async invalidateExpiredEntries(): Promise<InvalidationResult> {
    const connection = this.cacheManager.getConnection();

    try {
      // For DuckDB, we can't easily get the number of affected rows
      // so we'll run the deletions and assume they were successful
      await Promise.all([
        promisifyRun(connection, 'DELETE FROM analysis_cache WHERE expires_at <= CURRENT_TIMESTAMP'),
        promisifyRun(connection, 'DELETE FROM query_cache WHERE expires_at <= CURRENT_TIMESTAMP'),
        promisifyRun(connection, 'DELETE FROM api_response_cache WHERE expires_at <= CURRENT_TIMESTAMP'),
        promisifyRun(connection, 'DELETE FROM session_memory WHERE expires_at <= CURRENT_TIMESTAMP')
      ]);

      const result: InvalidationResult = {
        analysis_cache: 0, // Cannot determine affected rows in DuckDB
        query_cache: 0,
        api_cache: 0,
        session_memory: 0,
        total_invalidated: 0
      };

      result.total_invalidated = result.analysis_cache + result.query_cache +
                                result.api_cache + result.session_memory;

      if (result.total_invalidated > 0) {
        this.logger.info('Expired cache entries invalidated', result);
      }

      return result;

    } catch (error) {
      this.logger.error('Failed to invalidate expired entries', error);
      return {
        analysis_cache: 0,
        query_cache: 0,
        api_cache: 0,
        session_memory: 0,
        total_invalidated: 0
      };
    } finally {
      connection.close();
    }
  }

  /**
   * Invalidate cache entries by pattern
   */
  async invalidateByPattern(pattern: string, cacheType?: string): Promise<InvalidationResult> {
    const likePattern = pattern.replace(/\*/g, '%');
    let result: InvalidationResult = {
      analysis_cache: 0,
      query_cache: 0,
      api_cache: 0,
      session_memory: 0,
      total_invalidated: 0
    };

    const connection = this.cacheManager.getConnection();

    try {
      if (!cacheType || cacheType === 'analysis') {
        await promisifyRun(connection,
          'UPDATE analysis_cache SET is_valid = false WHERE cache_key LIKE ?',
          [likePattern]
        );
        result.analysis_cache = 0; // Cannot determine affected rows in DuckDB
      }

      if (!cacheType || cacheType === 'query') {
        await promisifyRun(connection,
          'UPDATE query_cache SET expires_at = CURRENT_TIMESTAMP WHERE query_sql LIKE ?',
          [likePattern]
        );
        result.query_cache = 0; // Cannot determine affected rows in DuckDB
      }

      if (!cacheType || cacheType === 'api') {
        await promisifyRun(connection,
          'UPDATE api_response_cache SET expires_at = CURRENT_TIMESTAMP WHERE url LIKE ?',
          [likePattern]
        );
        result.api_cache = 0; // Cannot determine affected rows in DuckDB
      }

      if (!cacheType || cacheType === 'session') {
        await promisifyRun(connection,
          'UPDATE session_memory SET expires_at = CURRENT_TIMESTAMP WHERE key LIKE ?',
          [likePattern]
        );
        result.session_memory = 0; // Cannot determine affected rows in DuckDB
      }

      if (!cacheType || cacheType === 'query') {
        await promisifyRun(connection,
          'UPDATE query_cache SET expires_at = CURRENT_TIMESTAMP WHERE query_sql LIKE ?',
          [likePattern]
        );
        result.query_cache = 0; // Cannot determine affected rows in DuckDB
      }

      if (!cacheType || cacheType === 'api') {
        await promisifyRun(connection,
          'UPDATE api_response_cache SET expires_at = CURRENT_TIMESTAMP WHERE url LIKE ?',
          [likePattern]
        );
        result.api_cache = 0; // Cannot determine affected rows in DuckDB
      }

      if (!cacheType || cacheType === 'memory') {
        await promisifyRun(connection,
          'UPDATE session_memory SET expires_at = CURRENT_TIMESTAMP WHERE memory_key LIKE ?',
          [likePattern]
        );
        result.session_memory = 0; // Cannot determine affected rows in DuckDB
      }

      result.total_invalidated = result.analysis_cache + result.query_cache +
                                result.api_cache + result.session_memory;

      if (result.total_invalidated > 0) {
        this.logger.info('Cache entries invalidated by pattern', { pattern, cacheType, ...result });
      }

      return result;

    } catch (error) {
      this.logger.error('Failed to invalidate by pattern', error, { pattern, cacheType });
      return result;
    } finally {
      connection.close();
    }
  }

  /**
   * Invalidate file-related cache entries
   */
  async invalidateFileRelatedCache(filePath: string): Promise<InvalidationResult> {
    const connection = this.cacheManager.getConnection();

    try {
      let result: InvalidationResult = {
        analysis_cache: 0,
        query_cache: 0,
        api_cache: 0,
        session_memory: 0,
        total_invalidated: 0
      };

      // Invalidate analysis results that depend on this file
      await promisifyRun(connection, `
        UPDATE analysis_cache
        SET is_valid = false
        WHERE parameters::text LIKE ?
      `, [`%${filePath}%`]);
      result.analysis_cache = 0; // Cannot determine affected rows in DuckDB

      // Invalidate file content cache
      await promisifyRun(connection,
        'UPDATE file_content_cache SET is_valid = false WHERE file_path = ?',
        [filePath]
      );
      // Note: file_content_cache invalidation doesn't count toward total since it's not in InvalidationResult

      // Invalidate dependent caches
      const dependentResult = await this.invalidateDependentCaches(filePath);
      result.analysis_cache += dependentResult;

      result.total_invalidated = result.analysis_cache + result.query_cache +
                                result.api_cache + result.session_memory;

      if (result.total_invalidated > 0) {
        this.logger.info('File-related cache invalidated', { filePath, ...result });
      }

      return result;

    } catch (error) {
      this.logger.error('Failed to invalidate file-related cache', error, { filePath });
      return {
        analysis_cache: 0,
        query_cache: 0,
        api_cache: 0,
        session_memory: 0,
        total_invalidated: 0
      };
    } finally {
      connection.close();
    }
  }

  /**
   * Invalidate caches that depend on the given file
   */
  private async invalidateDependentCaches(filePath: string): Promise<number> {
    const connection = this.cacheManager.getConnection();

    try {
      // Find files that import this file (simplified - would need dependency tracking)
      // For now, we'll use a simple pattern match on analysis parameters
      await promisifyRun(connection, `
        UPDATE analysis_cache
        SET is_valid = false
        WHERE parameters::text LIKE ?
        AND cache_key NOT LIKE ?
      `, [`%${filePath}%`, `%${filePath}%`]); // Avoid double invalidation

      return 0; // Cannot determine affected rows in DuckDB

    } catch (error) {
      this.logger.error('Failed to invalidate dependent caches', error, { filePath });
      return 0;
    } finally {
      connection.close();
    }
  }

  /**
   * Invalidate cache by time range
   */
  async invalidateByTimeRange(
    olderThanHours: number,
    cacheType?: string
  ): Promise<InvalidationResult> {
    const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000).toISOString();

    let result: InvalidationResult = {
      analysis_cache: 0,
      query_cache: 0,
      api_cache: 0,
      session_memory: 0,
      total_invalidated: 0
    };

    const connection = this.cacheManager.getConnection();

    try {
      if (!cacheType || cacheType === 'analysis') {
        await promisifyRun(connection,
          'UPDATE analysis_cache SET is_valid = false WHERE created_at <= ?',
          [cutoffTime]
        );
        result.analysis_cache = 0; // Cannot determine affected rows in DuckDB
      }

      if (!cacheType || cacheType === 'query') {
        await promisifyRun(connection,
          'UPDATE query_cache SET expires_at = CURRENT_TIMESTAMP WHERE created_at <= ?',
          [cutoffTime]
        );
        result.query_cache = 0; // Cannot determine affected rows in DuckDB
      }

      if (!cacheType || cacheType === 'api') {
        await promisifyRun(connection,
          'UPDATE api_response_cache SET expires_at = CURRENT_TIMESTAMP WHERE created_at <= ?',
          [cutoffTime]
        );
        result.api_cache = 0; // Cannot determine affected rows in DuckDB
      }

      if (!cacheType || cacheType === 'memory') {
        await promisifyRun(connection,
          'UPDATE session_memory SET expires_at = CURRENT_TIMESTAMP WHERE created_at <= ?',
          [cutoffTime]
        );
        result.session_memory = 0; // Cannot determine affected rows in DuckDB
      }

      result.total_invalidated = result.analysis_cache + result.query_cache +
                                result.api_cache + result.session_memory;

      if (result.total_invalidated > 0) {
        this.logger.info('Cache entries invalidated by time range', {
          olderThanHours,
          cacheType,
          ...result
        });
      }

      return result;

    } catch (error) {
      this.logger.error('Failed to invalidate by time range', error, { olderThanHours, cacheType });
      return result;
    } finally {
      connection.close();
    }
  }

  /**
   * Invalidate cache by size (remove least recently used entries)
   */
  async invalidateBySize(maxSizeBytes: number, cacheType?: string): Promise<InvalidationResult> {
    let result: InvalidationResult = {
      analysis_cache: 0,
      query_cache: 0,
      api_cache: 0,
      session_memory: 0,
      total_invalidated: 0
    };

    const connection = this.cacheManager.getConnection();

    try {
      if (!cacheType || cacheType === 'analysis') {
        const currentSize = await this.getCacheSize('analysis_cache', 'result_size_bytes');
        if (currentSize > maxSizeBytes) {
          const excessSize = currentSize - maxSizeBytes;
          result.analysis_cache = await this.evictBySize('analysis_cache', excessSize, 'result_size_bytes');
        }
      }

      if (!cacheType || cacheType === 'query') {
        const currentSize = await this.getCacheSize('query_cache', 'LENGTH(result)');
        if (currentSize > maxSizeBytes) {
          const excessSize = currentSize - maxSizeBytes;
          result.query_cache = await this.evictBySize('query_cache', excessSize, 'LENGTH(result)');
        }
      }

      if (!cacheType || cacheType === 'api') {
        const currentSize = await this.getCacheSize('api_response_cache', 'response_size_bytes');
        if (currentSize > maxSizeBytes) {
          const excessSize = currentSize - maxSizeBytes;
          result.api_cache = await this.evictBySize('api_response_cache', excessSize, 'response_size_bytes');
        }
      }

      result.total_invalidated = result.analysis_cache + result.query_cache +
                                result.api_cache + result.session_memory;

      if (result.total_invalidated > 0) {
        this.logger.info('Cache entries invalidated by size', { maxSizeBytes, cacheType, ...result });
      }

      return result;

    } catch (error) {
      this.logger.error('Failed to invalidate by size', error, { maxSizeBytes, cacheType });
      return result;
    } finally {
      connection.close();
    }
  }

  /**
   * Get current cache size
   */
  private async getCacheSize(tableName: string, sizeColumn: string): Promise<number> {
    const connection = this.cacheManager.getConnection();

    try {
      const result = await promisifyAll(connection,
        `SELECT COALESCE(SUM(${sizeColumn}), 0) as total_size FROM ${tableName}`
      );

      return (result[0] as any).total_size || 0;

    } catch (error) {
      this.logger.error('Failed to get cache size', error, { tableName, sizeColumn });
      return 0;
    } finally {
      connection.close();
    }
  }

  /**
   * Evict entries by size (LRU)
   */
  private async evictBySize(tableName: string, excessSize: number, sizeColumn: string): Promise<number> {
    const connection = this.cacheManager.getConnection();

    try {
      let deletedCount = 0;
      let deletedSize = 0;

      // Get entries ordered by last accessed (oldest first)
      const entries = await promisifyAll(connection, `
        SELECT ROWID, ${sizeColumn} as size
        FROM ${tableName}
        ORDER BY last_accessed ASC
      `);

      for (const entry of entries) {
        if (deletedSize >= excessSize) break;

        const row = entry as any;
        await promisifyRun(connection, `DELETE FROM ${tableName} WHERE ROWID = ?`, [row.rowid]);
        deletedSize += row.size;
        deletedCount++;
      }

      return deletedCount;

    } catch (error) {
      this.logger.error('Failed to evict by size', error, { tableName, excessSize });
      return 0;
    } finally {
      connection.close();
    }
  }

  /**
   * Invalidate all cache entries
   */
  async invalidateAll(cacheType?: string): Promise<InvalidationResult> {
    let result: InvalidationResult = {
      analysis_cache: 0,
      query_cache: 0,
      api_cache: 0,
      session_memory: 0,
      total_invalidated: 0
    };

    const connection = this.cacheManager.getConnection();

    try {
      if (!cacheType || cacheType === 'analysis') {
        await promisifyRun(connection, 'UPDATE analysis_cache SET is_valid = false');
        result.analysis_cache = 0; // Cannot determine affected rows in DuckDB
      }

      if (!cacheType || cacheType === 'query') {
        await promisifyRun(connection, 'UPDATE query_cache SET expires_at = CURRENT_TIMESTAMP');
        result.query_cache = 0; // Cannot determine affected rows in DuckDB
      }

      if (!cacheType || cacheType === 'api') {
        await promisifyRun(connection, 'UPDATE api_response_cache SET expires_at = CURRENT_TIMESTAMP');
        result.api_cache = 0; // Cannot determine affected rows in DuckDB
      }

      if (!cacheType || cacheType === 'memory') {
        await promisifyRun(connection, 'UPDATE session_memory SET expires_at = CURRENT_TIMESTAMP');
        result.session_memory = 0; // Cannot determine affected rows in DuckDB
      }

      result.total_invalidated = result.analysis_cache + result.query_cache +
                                result.api_cache + result.session_memory;

      if (result.total_invalidated > 0) {
        this.logger.info('All cache entries invalidated', { cacheType, ...result });
      }

      return result;

    } catch (error) {
      this.logger.error('Failed to invalidate all cache entries', error, { cacheType });
      return result;
    } finally {
      connection.close();
    }
  }

  /**
   * Get invalidation statistics
   */
  async getInvalidationStats(): Promise<{
    total_invalidations: number;
    recent_invalidations: Array<{
      timestamp: Date;
      pattern?: string;
      cache_type?: string;
      entries_invalidated: number;
    }>;
  }> {
    // This would require additional logging table for invalidation history
    // For now, return basic stats
    return {
      total_invalidations: 0,
      recent_invalidations: []
    };
  }
}