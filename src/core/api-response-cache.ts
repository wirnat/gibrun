import * as crypto from 'crypto';
import { logInfo, logError } from '@/services/logger-service.js';
import { DuckDBCacheManager } from '@core/duckdb-cache-manager.js';
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
 * API Response Cache - Cache external API calls
 */
export class APIResponseCache {
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
   * Get cached API response
   */
  async getCachedResponse(url: string, method: string = 'GET', headers: any = {}): Promise<{
    status: number;
    headers: any;
    body: string;
    responseTime: number;
    cached: boolean;
  } | null> {
    const cacheKey = this.generateCacheKey(url, method, headers);

    const connection = this.cacheManager.getConnection();

    try {
      const result = await promisifyAll(connection, `
        SELECT response_status, response_headers, response_body, response_time_ms, expires_at
        FROM api_response_cache
        WHERE cache_key = ? AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
      `, [cacheKey]);

      if (result.length === 0) return null;

      const row = result[0] as any;

      // Update access statistics
      await this.updateCacheStats(cacheKey);

      return {
        status: row.response_status,
        headers: JSON.parse(row.response_headers),
        body: row.response_body,
        responseTime: row.response_time_ms,
        cached: true
      };

    } catch (error) {
      this.logger.error('Failed to get cached API response', error, { url, method });
      return null;
    } finally {
      connection.close();
    }
  }

  /**
   * Cache API response
   */
  async cacheResponse(
    url: string,
    method: string,
    requestHeaders: any,
    responseStatus: number,
    responseHeaders: any,
    responseBody: string,
    responseTime: number,
    ttlSeconds: number = 300 // 5 minutes default
  ): Promise<void> {
    const cacheKey = this.generateCacheKey(url, method, requestHeaders);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const responseSize = Buffer.byteLength(responseBody, 'utf8');

    const connection = this.cacheManager.getConnection();

    try {
      await promisifyRun(connection, `
        INSERT OR REPLACE INTO api_response_cache
        (cache_key, url, method, request_headers, response_status, response_headers, response_body, response_size_bytes, expires_at, response_time_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        cacheKey,
        url,
        method,
        JSON.stringify(requestHeaders),
        responseStatus,
        JSON.stringify(responseHeaders),
        responseBody,
        responseSize,
        expiresAt,
        responseTime
      ]);

      this.logger.debug('API response cached', {
        url,
        method,
        status: responseStatus,
        responseSize,
        ttlSeconds
      });

    } catch (error) {
      this.logger.error('Failed to cache API response', error, { url, method });
    } finally {
      connection.close();
    }
  }

  /**
   * Generate cache key for API request
   */
  private generateCacheKey(url: string, method: string, headers: any): string {
    // Include only cache-relevant headers
    const cacheHeaders = this.extractCacheHeaders(headers);
    const keyData = `${method}:${url}:${JSON.stringify(cacheHeaders)}`;

    return crypto.createHash('md5').update(keyData).digest('hex');
  }

  /**
   * Extract cache-relevant headers
   */
  private extractCacheHeaders(headers: any): any {
    const relevantHeaders = [
      'authorization',
      'accept',
      'accept-language',
      'user-agent',
      'x-api-key',
      'x-auth-token'
    ];

    const cacheHeaders: any = {};

    for (const header of relevantHeaders) {
      const lowerHeader = header.toLowerCase();
      if (headers[lowerHeader]) {
        cacheHeaders[lowerHeader] = headers[lowerHeader];
      }
    }

    return cacheHeaders;
  }

  /**
   * Update cache access statistics
   */
  private async updateCacheStats(cacheKey: string): Promise<void> {
    const connection = this.cacheManager.getConnection();

    try {
      await promisifyRun(connection, `
        UPDATE api_response_cache
        SET hit_count = hit_count + 1, last_accessed = CURRENT_TIMESTAMP
        WHERE cache_key = ?
      `, [cacheKey]);

    } catch (error) {
      this.logger.error('Failed to update API cache stats', error, { cacheKey });
    } finally {
      connection.close();
    }
  }

  /**
   * Check if response is cached and valid
   */
  async isCached(url: string, method: string = 'GET', headers: any = {}): Promise<boolean> {
    const cacheKey = this.generateCacheKey(url, method, headers);

    const connection = this.cacheManager.getConnection();

    try {
      const result = await promisifyAll(connection, `
        SELECT 1
        FROM api_response_cache
        WHERE cache_key = ? AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
        LIMIT 1
      `, [cacheKey]);

      return result.length > 0;

    } catch (error) {
      this.logger.error('Failed to check API cache', error, { url, method });
      return false;
    } finally {
      connection.close();
    }
  }

  /**
   * Invalidate API cache by URL pattern
   */
  async invalidateByUrlPattern(pattern: string): Promise<number> {
    const connection = this.cacheManager.getConnection();

    try {
      const likePattern = pattern.replace(/\*/g, '%');
      await promisifyRun(connection, `
        UPDATE api_response_cache
        SET expires_at = CURRENT_TIMESTAMP
        WHERE url LIKE ?
      `, [likePattern]);

      // For DuckDB, we can't easily get the number of affected rows
      // so we'll assume the operation was successful
      const invalidated = 0;

      if (invalidated > 0) {
        this.logger.debug('API cache invalidated by URL pattern', { pattern, count: invalidated });
      }

      return invalidated;

    } catch (error) {
      this.logger.error('Failed to invalidate API cache by URL pattern', error, { pattern });
      return 0;
    } finally {
      connection.close();
    }
  }

  /**
   * Get API cache statistics
   */
  async getCacheStats(): Promise<{
    total_requests: number;
    cached_requests: number;
    hit_rate: number;
    avg_response_time_saved: number;
    total_cache_size_mb: number;
    most_requested_urls: Array<{ url: string; hit_count: number }>;
  }> {
    const connection = this.cacheManager.getConnection();

    try {
      const stats = await promisifyAll(connection, `
        SELECT
          COUNT(*) as total_requests,
          COUNT(CASE WHEN hit_count > 0 THEN 1 END) as cached_requests,
          COALESCE(AVG(hit_count), 0) as avg_hit_rate,
          COALESCE(AVG(response_time_ms), 0) as avg_response_time,
          COALESCE(SUM(response_size_bytes), 0) / (1024 * 1024) as cache_size_mb
        FROM api_response_cache
      `);

      const data = stats[0] as any;

      // Get most requested URLs
      const topUrls = await promisifyAll(connection, `
        SELECT url, hit_count
        FROM api_response_cache
        ORDER BY hit_count DESC
        LIMIT 10
      `);

      const mostRequestedUrls = topUrls.map((row: any) => ({
        url: row.url,
        hit_count: row.hit_count
      }));

      const totalRequests = data.total_requests || 0;
      const cachedRequests = data.cached_requests || 0;

      return {
        total_requests: totalRequests,
        cached_requests: cachedRequests,
        hit_rate: totalRequests > 0 ? (cachedRequests / totalRequests) : 0,
        avg_response_time_saved: data.avg_response_time || 0,
        total_cache_size_mb: data.cache_size_mb || 0,
        most_requested_urls: mostRequestedUrls
      };

    } catch (error) {
      this.logger.error('Failed to get API cache stats', error);
      return {
        total_requests: 0,
        cached_requests: 0,
        hit_rate: 0,
        avg_response_time_saved: 0,
        total_cache_size_mb: 0,
        most_requested_urls: []
      };
    } finally {
      connection.close();
    }
  }

  /**
   * Clear expired API cache entries
   */
  async clearExpired(): Promise<number> {
    const connection = this.cacheManager.getConnection();

    try {
      await promisifyRun(connection, `
        DELETE FROM api_response_cache
        WHERE expires_at <= CURRENT_TIMESTAMP
      `);

      // For DuckDB, we can't easily get the number of affected rows
      // so we'll assume the operation was successful
      const deleted = 0;

      if (deleted > 0) {
        this.logger.debug('Expired API cache entries cleared', { count: deleted });
      }

      return deleted;

    } catch (error) {
      this.logger.error('Failed to clear expired API cache', error);
      return 0;
    } finally {
      connection.close();
    }
  }

  /**
   * Get slow API responses (for optimization insights)
   */
  async getSlowResponses(minResponseTime: number = 1000, limit: number = 20): Promise<Array<{
    url: string;
    method: string;
    response_time_ms: number;
    status: number;
    cached: boolean;
  }>> {
    const connection = this.cacheManager.getConnection();

    try {
      const result = await promisifyAll(connection, `
        SELECT url, method, response_time_ms, response_status, hit_count > 0 as cached
        FROM api_response_cache
        WHERE response_time_ms >= ?
        ORDER BY response_time_ms DESC
        LIMIT ?
      `, [minResponseTime, limit]);

      return result.map((row: any) => ({
        url: row.url,
        method: row.method,
        response_time_ms: row.response_time_ms,
        status: row.response_status,
        cached: row.cached
      }));

    } catch (error) {
      this.logger.error('Failed to get slow API responses', error);
      return [];
    } finally {
      connection.close();
    }
  }

  /**
   * Pre-warm cache with frequently requested URLs
   */
  async preWarmCache(urls: Array<{ url: string; method?: string; headers?: any }>): Promise<{
    attempted: number;
    successful: number;
    failed: number;
  }> {
    let successful = 0;
    let failed = 0;

    for (const { url, method = 'GET', headers = {} } of urls) {
      try {
        // Check if already cached
        const isCached = await this.isCached(url, method, headers);
        if (isCached) {
          successful++;
          continue;
        }

        // For pre-warming, we would typically make the actual request here
        // For now, we'll just mark as attempted
        this.logger.debug('Pre-warm cache entry would be fetched', { url, method });

      } catch (error) {
        failed++;
        this.logger.error('Failed to pre-warm cache entry', error, { url, method });
      }
    }

    return {
      attempted: urls.length,
      successful,
      failed
    };
  }
}