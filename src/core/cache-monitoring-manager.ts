import { logInfo, logError } from '@/services/logger-service.js';
import { DuckDBCacheManager } from '@/core/duckdb-cache-manager.js';
import { CacheOverview, CacheStats, CostSavings, EfficiencyReport } from '@/types/cache.js';
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
 * Cache Monitoring Manager - Performance metrics and statistics
 */
export class CacheMonitoringManager {
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
   * Get comprehensive cache overview
   */
  async getCacheOverview(): Promise<CacheOverview> {
    const connection = this.cacheManager.getConnection();

    try {
      const [
        analysisStats,
        queryStats,
        fileStats,
        apiStats,
        memoryStats
      ] = await Promise.all([
        this.getAnalysisCacheStats(),
        this.getQueryCacheStats(),
        this.getFileCacheStats(),
        this.getAPICacheStats(),
        this.getMemoryStats()
      ]);

      const totalSize = analysisStats.size_bytes + queryStats.size_bytes +
                       fileStats.size_bytes + apiStats.size_bytes + memoryStats.size_bytes;

      const overview: CacheOverview = {
        analysis_cache: analysisStats,
        query_cache: queryStats,
        file_cache: fileStats,
        api_cache: apiStats,
        session_memory: memoryStats,
        total_size_bytes: totalSize,
        total_size_mb: totalSize / (1024 * 1024),
        generated_at: new Date()
      };

      this.logger.debug('Cache overview generated', {
        total_size_mb: overview.total_size_mb,
        generated_at: overview.generated_at
      });

      return overview;

    } catch (error) {
      this.logger.error('Failed to get cache overview', error);
      // Return empty overview on error
      return {
        analysis_cache: this.getEmptyCacheStats(),
        query_cache: this.getEmptyCacheStats(),
        file_cache: this.getEmptyCacheStats(),
        api_cache: this.getEmptyCacheStats(),
        session_memory: this.getEmptyCacheStats(),
        total_size_bytes: 0,
        total_size_mb: 0,
        generated_at: new Date()
      };
    } finally {
      connection.close();
    }
  }

  /**
   * Get analysis cache statistics
   */
  private async getAnalysisCacheStats(): Promise<CacheStats> {
    const connection = this.cacheManager.getConnection();

    try {
      const stats = await promisifyAll(connection, `
        SELECT
          COUNT(*) as total_entries,
          COUNT(CASE WHEN is_valid = true AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP) THEN 1 END) as valid_entries,
          COUNT(CASE WHEN expires_at > CURRENT_TIMESTAMP THEN 1 END) as non_expired,
          COALESCE(SUM(result_size_bytes), 0) as size_bytes,
          COALESCE(AVG(CASE WHEN hit_count > 0 THEN hit_count END), 0) as avg_hit_rate,
          COALESCE(AVG(computation_cost), 0) as avg_computation_cost,
          COALESCE(SUM(hit_count), 0) as total_hits
        FROM analysis_cache
      `);

      const data = stats[0] as any;
      const totalEntries = data.total_entries || 0;
      const totalHits = data.total_hits || 0;

      return {
        total_entries: totalEntries,
        valid_entries: data.valid_entries || 0,
        non_expired_entries: data.non_expired || 0,
        hit_rate: totalEntries > 0 ? totalHits / totalEntries : 0,
        size_bytes: data.size_bytes || 0,
        avg_computation_cost: data.avg_computation_cost || 0
      };

    } catch (error) {
      this.logger.error('Failed to get analysis cache stats', error);
      return this.getEmptyCacheStats();
    } finally {
      connection.close();
    }
  }

  /**
   * Get query cache statistics
   */
  private async getQueryCacheStats(): Promise<CacheStats> {
    const connection = this.cacheManager.getConnection();

    try {
      const stats = await promisifyAll(connection, `
        SELECT
          COUNT(*) as total_entries,
          COUNT(CASE WHEN expires_at > CURRENT_TIMESTAMP THEN 1 END) as valid_entries,
          COUNT(CASE WHEN expires_at > CURRENT_TIMESTAMP THEN 1 END) as non_expired,
          COALESCE(SUM(LENGTH(result)), 0) as size_bytes,
          COALESCE(AVG(hit_count), 0) as avg_hit_rate,
          COALESCE(AVG(execution_time_ms), 0) as avg_computation_cost,
          COALESCE(SUM(hit_count), 0) as total_hits
        FROM query_cache
      `);

      const data = stats[0] as any;
      const totalEntries = data.total_entries || 0;
      const totalHits = data.total_hits || 0;

      return {
        total_entries: totalEntries,
        valid_entries: data.valid_entries || 0,
        non_expired_entries: data.non_expired || 0,
        hit_rate: totalEntries > 0 ? totalHits / totalEntries : 0,
        size_bytes: data.size_bytes || 0,
        avg_computation_cost: data.avg_computation_cost || 0
      };

    } catch (error) {
      this.logger.error('Failed to get query cache stats', error);
      return this.getEmptyCacheStats();
    } finally {
      connection.close();
    }
  }

  /**
   * Get file cache statistics
   */
  private async getFileCacheStats(): Promise<CacheStats> {
    const connection = this.cacheManager.getConnection();

    try {
      const stats = await promisifyAll(connection, `
        SELECT
          COUNT(*) as total_entries,
          COUNT(CASE WHEN is_valid = true THEN 1 END) as valid_entries,
          COUNT(CASE WHEN is_valid = true THEN 1 END) as non_expired,
          COALESCE(SUM(content_size_bytes), 0) as size_bytes,
          0 as avg_hit_rate,
          0 as avg_computation_cost,
          0 as total_hits
        FROM file_content_cache
      `);

      const data = stats[0] as any;

      return {
        total_entries: data.total_entries || 0,
        valid_entries: data.valid_entries || 0,
        non_expired_entries: data.non_expired || 0,
        hit_rate: 0, // File cache doesn't track hits in the same way
        size_bytes: data.size_bytes || 0,
        avg_computation_cost: 0
      };

    } catch (error) {
      this.logger.error('Failed to get file cache stats', error);
      return this.getEmptyCacheStats();
    } finally {
      connection.close();
    }
  }

  /**
   * Get API cache statistics
   */
  private async getAPICacheStats(): Promise<CacheStats> {
    const connection = this.cacheManager.getConnection();

    try {
      const stats = await promisifyAll(connection, `
        SELECT
          COUNT(*) as total_entries,
          COUNT(CASE WHEN expires_at > CURRENT_TIMESTAMP THEN 1 END) as valid_entries,
          COUNT(CASE WHEN expires_at > CURRENT_TIMESTAMP THEN 1 END) as non_expired,
          COALESCE(SUM(response_size_bytes), 0) as size_bytes,
          COALESCE(AVG(hit_count), 0) as avg_hit_rate,
          COALESCE(AVG(response_time_ms), 0) as avg_computation_cost,
          COALESCE(SUM(hit_count), 0) as total_hits
        FROM api_response_cache
      `);

      const data = stats[0] as any;
      const totalEntries = data.total_entries || 0;
      const totalHits = data.total_hits || 0;

      return {
        total_entries: totalEntries,
        valid_entries: data.valid_entries || 0,
        non_expired_entries: data.non_expired || 0,
        hit_rate: totalEntries > 0 ? totalHits / totalEntries : 0,
        size_bytes: data.size_bytes || 0,
        avg_computation_cost: data.avg_computation_cost || 0
      };

    } catch (error) {
      this.logger.error('Failed to get API cache stats', error);
      return this.getEmptyCacheStats();
    } finally {
      connection.close();
    }
  }

  /**
   * Get session memory statistics
   */
  private async getMemoryStats(): Promise<CacheStats> {
    const connection = this.cacheManager.getConnection();

    try {
      const stats = await promisifyAll(connection, `
        SELECT
          COUNT(*) as total_entries,
          COUNT(CASE WHEN expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP THEN 1 END) as valid_entries,
          COUNT(CASE WHEN expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP THEN 1 END) as non_expired,
          COALESCE(SUM(LENGTH(memory_value)), 0) as size_bytes,
          COALESCE(AVG(access_count), 0) as avg_hit_rate,
          0 as avg_computation_cost,
          COALESCE(SUM(access_count), 0) as total_hits
        FROM session_memory
      `);

      const data = stats[0] as any;
      const totalEntries = data.total_entries || 0;
      const totalHits = data.total_hits || 0;

      return {
        total_entries: totalEntries,
        valid_entries: data.valid_entries || 0,
        non_expired_entries: data.non_expired || 0,
        hit_rate: totalEntries > 0 ? totalHits / totalEntries : 0,
        size_bytes: data.size_bytes || 0,
        avg_computation_cost: 0
      };

    } catch (error) {
      this.logger.error('Failed to get memory stats', error);
      return this.getEmptyCacheStats();
    } finally {
      connection.close();
    }
  }

  /**
   * Get empty cache stats (for error cases)
   */
  private getEmptyCacheStats(): CacheStats {
    return {
      total_entries: 0,
      valid_entries: 0,
      non_expired_entries: 0,
      hit_rate: 0,
      size_bytes: 0,
      avg_computation_cost: 0
    };
  }

  /**
   * Get cache efficiency report
   */
  async getCacheEfficiencyReport(): Promise<EfficiencyReport> {
    try {
      const overview = await this.getCacheOverview();

      return {
        overall_hit_rate: this.calculateOverallHitRate(overview),
        cache_utilization: this.calculateUtilization(overview),
        cost_savings: await this.calculateCostSavings(),
        performance_improvement: await this.calculatePerformanceImprovement(),
        recommendations: await this.generateOptimizationRecommendations(overview)
      };

    } catch (error) {
      this.logger.error('Failed to get cache efficiency report', error);
      return {
        overall_hit_rate: 0,
        cache_utilization: 0,
        cost_savings: {
          time_saved_seconds: 0,
          estimated_cost_savings: 0,
          cache_entries_saved: 0
        },
        performance_improvement: 0,
        recommendations: ['Unable to generate efficiency report due to error']
      };
    }
  }

  /**
   * Calculate overall hit rate across all caches
   */
  private calculateOverallHitRate(overview: CacheOverview): number {
    const totalHits = overview.analysis_cache.hit_rate * overview.analysis_cache.total_entries +
                     overview.query_cache.hit_rate * overview.query_cache.total_entries +
                     overview.api_cache.hit_rate * overview.api_cache.total_entries +
                     overview.session_memory.hit_rate * overview.session_memory.total_entries;

    const totalEntries = overview.analysis_cache.total_entries +
                        overview.query_cache.total_entries +
                        overview.api_cache.total_entries +
                        overview.session_memory.total_entries;

    return totalEntries > 0 ? totalHits / totalEntries : 0;
  }

  /**
   * Calculate cache utilization percentage
   */
  private calculateUtilization(overview: CacheOverview): number {
    const validEntries = overview.analysis_cache.valid_entries +
                        overview.query_cache.valid_entries +
                        overview.api_cache.valid_entries +
                        overview.session_memory.valid_entries;

    const totalEntries = overview.analysis_cache.total_entries +
                        overview.query_cache.total_entries +
                        overview.api_cache.total_entries +
                        overview.session_memory.total_entries;

    return totalEntries > 0 ? (validEntries / totalEntries) * 100 : 0;
  }

  /**
   * Calculate cost savings from cache hits
   */
  private async calculateCostSavings(): Promise<CostSavings> {
    const connection = this.cacheManager.getConnection();

    try {
      // Calculate time saved from analysis cache hits
      const analysisSavings = await  promisifyAll(connection,`
        SELECT COALESCE(SUM(computation_cost * hit_count), 0) as time_saved_seconds
        FROM analysis_cache
        WHERE hit_count > 0
      `);

      const timeSaved = (analysisSavings[0] as any).time_saved_seconds || 0;

      // Get number of cache entries that have been hit
      const cacheEntriesSaved = await this.getCacheEntriesSaved();

      return {
        time_saved_seconds: timeSaved,
        estimated_cost_savings: timeSaved * 0.01, // $0.01 per second of computation
        cache_entries_saved: cacheEntriesSaved
      };

    } catch (error) {
      this.logger.error('Failed to calculate cost savings', error);
      return {
        time_saved_seconds: 0,
        estimated_cost_savings: 0,
        cache_entries_saved: 0
      };
    } finally {
      connection.close();
    }
  }

  /**
   * Get number of cache entries that have been accessed
   */
  private async getCacheEntriesSaved(): Promise<number> {
    const connection = this.cacheManager.getConnection();

    try {
      const result = await  promisifyAll(connection,`
        SELECT
          (SELECT COUNT(*) FROM analysis_cache WHERE hit_count > 0) +
          (SELECT COUNT(*) FROM query_cache WHERE hit_count > 0) +
          (SELECT COUNT(*) FROM api_response_cache WHERE hit_count > 0) +
          (SELECT COUNT(*) FROM session_memory WHERE access_count > 0) as saved_entries
      `);

      return (result[0] as any).saved_entries || 0;

    } catch (error) {
      this.logger.error('Failed to get cache entries saved', error);
      return 0;
    } finally {
      connection.close();
    }
  }

  /**
   * Calculate performance improvement percentage
   */
  private async calculatePerformanceImprovement(): Promise<number> {
    // This would require historical performance data
    // For now, return a simple calculation based on hit rates
    try {
      const overview = await this.getCacheOverview();
      const hitRate = this.calculateOverallHitRate(overview);

      // Assume 50% performance improvement for each cache hit
      return hitRate * 50;
    } catch (error) {
      this.logger.error('Failed to calculate performance improvement', error);
      return 0;
    }
  }

  /**
   * Generate optimization recommendations
   */
  private async generateOptimizationRecommendations(overview: CacheOverview): Promise<string[]> {
    const recommendations: string[] = [];

    try {
      // Check cache sizes
      if (overview.total_size_mb > 500) {
        recommendations.push('Consider increasing cache size limit or implementing more aggressive eviction');
      }

      // Check hit rates
      if (overview.analysis_cache.hit_rate < 0.5) {
        recommendations.push('Analysis cache hit rate is low - consider adjusting TTL or cache key strategy');
      }

      if (overview.query_cache.hit_rate < 0.7) {
        recommendations.push('Query cache hit rate could be improved - review query patterns');
      }

      if (overview.api_cache.hit_rate < 0.6) {
        recommendations.push('API cache hit rate is low - consider adjusting TTL or caching strategy');
      }

      // Check memory usage
      if (overview.session_memory.total_entries > 10000) {
        recommendations.push('High session memory usage - consider implementing memory cleanup policies');
      }

      // Check file cache
      if (overview.file_cache.total_entries > 1000 && overview.file_cache.hit_rate === 0) {
        recommendations.push('File cache is populated but not being utilized effectively');
      }

      if (recommendations.length === 0) {
        recommendations.push('Cache performance is good - no optimization recommendations at this time');
      }

    } catch (error) {
      this.logger.error('Failed to generate optimization recommendations', error);
      recommendations.push('Unable to generate recommendations due to error');
    }

    return recommendations;
  }

  /**
   * Get cache performance trends over time
   */
  async getPerformanceTrends(hours: number = 24): Promise<Array<{
    timestamp: Date;
    hit_rate: number;
    size_mb: number;
    entries_count: number;
  }>> {
    // This would require historical data collection
    // For now, return current state as a single data point
    try {
      const overview = await this.getCacheOverview();

      return [{
        timestamp: new Date(),
        hit_rate: this.calculateOverallHitRate(overview),
        size_mb: overview.total_size_mb,
        entries_count: overview.analysis_cache.total_entries +
                      overview.query_cache.total_entries +
                      overview.api_cache.total_entries +
                      overview.session_memory.total_entries
      }];

    } catch (error) {
      this.logger.error('Failed to get performance trends', error);
      return [];
    }
  }

  /**
   * Get detailed cache health metrics
   */
  async getCacheHealthMetrics(): Promise<{
    overall_health: 'excellent' | 'good' | 'fair' | 'poor';
    issues: string[];
    metrics: {
      avg_hit_rate: number;
      cache_utilization: number;
      expired_entries_ratio: number;
      memory_efficiency: number;
    };
  }> {
    try {
      const overview = await this.getCacheOverview();
      const efficiency = await this.getCacheEfficiencyReport();

      const avgHitRate = efficiency.overall_hit_rate;
      const utilization = efficiency.cache_utilization;
      const expiredRatio = this.calculateExpiredRatio(overview);

      let overallHealth: 'excellent' | 'good' | 'fair' | 'poor' = 'poor';
      const issues: string[] = [];

      if (avgHitRate > 0.8 && utilization > 80) {
        overallHealth = 'excellent';
      } else if (avgHitRate > 0.6 && utilization > 60) {
        overallHealth = 'good';
      } else if (avgHitRate > 0.4 && utilization > 40) {
        overallHealth = 'fair';
      }

      if (avgHitRate < 0.5) {
        issues.push('Low cache hit rate indicates poor cache effectiveness');
      }

      if (utilization < 50) {
        issues.push('Low cache utilization suggests inefficient cache usage');
      }

      if (expiredRatio > 0.3) {
        issues.push('High ratio of expired entries indicates maintenance issues');
      }

      if (overview.total_size_mb > 1000) {
        issues.push('Cache size is very large, consider cleanup or size limits');
      }

      return {
        overall_health: overallHealth,
        issues,
        metrics: {
          avg_hit_rate: avgHitRate,
          cache_utilization: utilization,
          expired_entries_ratio: expiredRatio,
          memory_efficiency: overview.total_size_mb > 0 ?
            (overview.total_size_bytes / overview.total_size_mb) : 0
        }
      };

    } catch (error) {
      this.logger.error('Failed to get cache health metrics', error);
      return {
        overall_health: 'poor',
        issues: ['Unable to assess cache health due to error'],
        metrics: {
          avg_hit_rate: 0,
          cache_utilization: 0,
          expired_entries_ratio: 0,
          memory_efficiency: 0
        }
      };
    }
  }

  /**
   * Calculate expired entries ratio
   */
  private calculateExpiredRatio(overview: CacheOverview): number {
    const totalEntries = overview.analysis_cache.total_entries +
                        overview.query_cache.total_entries +
                        overview.api_cache.total_entries +
                        overview.session_memory.total_entries;

    const expiredEntries = (overview.analysis_cache.total_entries - overview.analysis_cache.non_expired_entries) +
                          (overview.query_cache.total_entries - overview.query_cache.non_expired_entries) +
                          (overview.api_cache.total_entries - overview.api_cache.non_expired_entries) +
                          (overview.session_memory.total_entries - overview.session_memory.non_expired_entries);

    return totalEntries > 0 ? expiredEntries / totalEntries : 0;
  }
}