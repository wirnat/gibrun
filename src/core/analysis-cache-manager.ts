import { logInfo, logError } from '@/services/logger-service.js';
import { DuckDBCacheManager } from '@core/duckdb-cache-manager.js';
import { AnalysisResult, CacheConfig } from '@types/cache.js';
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
 * Analysis Cache Manager - Cache expensive analysis results
 */
export class AnalysisCacheManager {
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
   * Get cached analysis result
   */
  async getCachedResult(cacheKey: string): Promise<AnalysisResult | null> {
    const connection = this.cacheManager.getConnection();

    try {
      const result = await promisifyAll(connection, `
        SELECT result, expires_at, is_valid, hit_count, computation_cost
        FROM analysis_cache
        WHERE cache_key = ? AND is_valid = true AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
      `, [cacheKey]);

      if (result.length === 0) {
        return null;
      }

      const row = result[0] as any;

      // Update access statistics
      await this.updateCacheStats(cacheKey);

      const analysisResult: AnalysisResult = {
        ...JSON.parse(row.result),
        fromCache: true,
        computationCost: row.computation_cost,
        hitCount: row.hit_count + 1 // Include the current hit
      };

      this.logger.debug('Analysis cache hit', { cacheKey, hitCount: analysisResult.hitCount });

      return analysisResult;

    } catch (error) {
      this.logger.error('Failed to get cached analysis result', error, { cacheKey });
      return null;
    } finally {
      connection.close();
    }
  }

  /**
   * Set cached analysis result
   */
  async setCachedResult(
    cacheKey: string,
    analysisType: string,
    result: any,
    ttlHours: number = 24,
    computationCost: number = 0
  ): Promise<void> {
    const connection = this.cacheManager.getConnection();

    try {
      const expiresAt = ttlHours > 0 ?
        new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString() : null;

      const resultSize = JSON.stringify(result).length;

      await promisifyRun(connection, `
        INSERT OR REPLACE INTO analysis_cache
        (cache_key, analysis_type, result, expires_at, computation_cost, result_size_bytes)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        cacheKey,
        analysisType,
        JSON.stringify(result),
        expiresAt,
        computationCost,
        resultSize
      ]);

      this.logger.debug('Analysis result cached', {
        cacheKey,
        analysisType,
        resultSize,
        ttlHours,
        computationCost
      });

    } catch (error) {
      this.logger.error('Failed to cache analysis result', error, { cacheKey, analysisType });
      throw error;
    } finally {
      connection.close();
    }
  }

  /**
   * Update cache access statistics
   */
  private async updateCacheStats(cacheKey: string): Promise<void> {
    const connection = this.cacheManager.getConnection();

    try {
      await promisifyRun(connection, `
        UPDATE analysis_cache
        SET hit_count = hit_count + 1, last_accessed = CURRENT_TIMESTAMP
        WHERE cache_key = ?
      `, [cacheKey]);

    } catch (error) {
      this.logger.error('Failed to update cache stats', error, { cacheKey });
    } finally {
      connection.close();
    }
  }

  /**
   * Check if cache key exists and is valid
   */
  async hasValidCache(cacheKey: string): Promise<boolean> {
    const connection = this.cacheManager.getConnection();

    try {
      const result = await promisifyAll(connection, `
        SELECT 1
        FROM analysis_cache
        WHERE cache_key = ? AND is_valid = true AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
        LIMIT 1
      `, [cacheKey]);

      return result.length > 0;

    } catch (error) {
      this.logger.error('Failed to check cache validity', error, { cacheKey });
      return false;
    } finally {
      connection.close();
    }
  }

  /**
   * Invalidate specific cache entry
   */
  async invalidateCache(cacheKey: string): Promise<boolean> {
    const connection = this.cacheManager.getConnection();

    try {
      await promisifyRun(connection, `
        UPDATE analysis_cache
        SET is_valid = false
        WHERE cache_key = ?
      `, [cacheKey]);

      // For DuckDB, we can't easily get the number of affected rows
      // so we'll assume the operation was successful
      const invalidated = true;

      if (invalidated) {
        this.logger.debug('Analysis cache invalidated', { cacheKey });
      }

      return invalidated;

    } catch (error) {
      this.logger.error('Failed to invalidate cache', error, { cacheKey });
      return false;
    } finally {
      connection.close();
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    total_entries: number;
    valid_entries: number;
    hit_rate: number;
    total_size_bytes: number;
    avg_computation_cost: number;
  }> {
    const connection = this.cacheManager.getConnection();

    try {
      const stats = await promisifyAll(connection, `
        SELECT
          COUNT(*) as total_entries,
          COUNT(CASE WHEN is_valid = true AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP) THEN 1 END) as valid_entries,
          COALESCE(AVG(CASE WHEN hit_count > 0 THEN hit_count END), 0) as avg_hit_rate,
          COALESCE(SUM(result_size_bytes), 0) as total_size_bytes,
          COALESCE(AVG(computation_cost), 0) as avg_computation_cost
        FROM analysis_cache
      `);

      const data = stats[0] as any;
      return {
        total_entries: data.total_entries || 0,
        valid_entries: data.valid_entries || 0,
        hit_rate: data.total_entries > 0 ? (data.avg_hit_rate || 0) : 0,
        total_size_bytes: data.total_size_bytes || 0,
        avg_computation_cost: data.avg_computation_cost || 0
      };

    } catch (error) {
      this.logger.error('Failed to get cache stats', error);
      return {
        total_entries: 0,
        valid_entries: 0,
        hit_rate: 0,
        total_size_bytes: 0,
        avg_computation_cost: 0
      };
    } finally {
      connection.close();
    }
  }

  /**
   * Clear all expired entries
   */
  async clearExpired(): Promise<number> {
    const connection = this.cacheManager.getConnection();

    try {
      await promisifyRun(connection, `
        DELETE FROM analysis_cache
        WHERE expires_at <= CURRENT_TIMESTAMP
      `);

      // For DuckDB, we can't easily get the number of affected rows
      // so we'll assume the operation was successful
      const deleted = 0;

      if (deleted > 0) {
        this.logger.debug('Expired analysis cache entries cleared', { count: deleted });
      }

      return deleted;

    } catch (error) {
      this.logger.error('Failed to clear expired cache entries', error);
      return 0;
    } finally {
      connection.close();
    }
  }

  /**
   * Get cache keys by analysis type
   */
  async getCacheKeysByType(analysisType: string): Promise<string[]> {
    const connection = this.cacheManager.getConnection();

    try {
      const result = await promisifyAll(connection, `
        SELECT cache_key
        FROM analysis_cache
        WHERE analysis_type = ? AND is_valid = true
        ORDER BY last_accessed DESC
      `, [analysisType]);

      return result.map((row: any) => row.cache_key);

    } catch (error) {
      this.logger.error('Failed to get cache keys by type', error, { analysisType });
      return [];
    } finally {
      connection.close();
    }
  }
}