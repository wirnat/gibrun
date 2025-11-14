# DuckDB Cache System Feature

## Overview

DuckDB Cache System adalah fitur untuk mengimplementasikan berbagai jenis cache menggunakan DuckDB sebagai unified database. Sistem ini menggantikan multiple cache mechanisms dengan satu analytical database yang powerful untuk menyimpan dan query cache data secara efisien.

## 🎯 Problem Statement

### Current Challenges
- Multiple cache systems (memory, file, database) yang terfragmentasi
- Sulit untuk query dan analyze cache effectiveness
- Tidak ada persistent cross-session caching
- Limited analytics untuk cache performance
- Manual cache invalidation yang error-prone
- Tidak ada unified cache management

### Solution
DuckDB Cache System menyediakan:
- Unified cache storage dengan SQL analytics capabilities
- Intelligent cache invalidation dan eviction
- Cross-session memory persistence
- Performance monitoring dan optimization
- Multiple cache types dalam satu system

## 🔧 Technical Architecture

### Cache Types Overview

#### **1. Analysis Results Cache**
Cache hasil analisis yang expensive untuk menghindari recomputation.

#### **2. Query Result Cache**
Cache hasil query analytics yang kompleks dan berulang.

#### **3. File Content Cache**
Cache parsed file content, AST data, dan symbol information.

#### **4. Session Memory Cache**
Persistent memory untuk opencode integration dan cross-session context.

#### **5. API Response Cache**
Cache external API calls untuk mengurangi network latency.

### Database Schema Design

#### Core Cache Tables
```sql
-- Analysis results cache
CREATE TABLE analysis_cache (
    cache_key VARCHAR PRIMARY KEY,
    analysis_type VARCHAR NOT NULL,
    parameters JSON,
    result JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    is_valid BOOLEAN DEFAULT TRUE,
    hit_count INTEGER DEFAULT 0,
    last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    computation_cost DOUBLE,
    result_size_bytes INTEGER
);

-- Query results cache
CREATE TABLE query_cache (
    query_hash VARCHAR PRIMARY KEY,
    query_sql TEXT NOT NULL,
    parameters JSON,
    result JSON,
    execution_time_ms INTEGER,
    result_row_count INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    hit_count INTEGER DEFAULT 0,
    last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- File content cache
CREATE TABLE file_content_cache (
    file_path VARCHAR PRIMARY KEY,
    checksum VARCHAR NOT NULL,
    content TEXT,
    parsed_ast JSON,
    symbols_extracted JSON,
    last_parsed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    parse_time_ms INTEGER,
    content_size_bytes INTEGER,
    is_valid BOOLEAN DEFAULT TRUE
);

-- Session memory cache
CREATE TABLE session_memory (
    session_id VARCHAR,
    memory_key VARCHAR,
    memory_value JSON,
    memory_type VARCHAR,
    salience_score DOUBLE DEFAULT 1.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    access_count INTEGER DEFAULT 0,
    expires_at TIMESTAMP,
    PRIMARY KEY (session_id, memory_key)
);

-- API response cache
CREATE TABLE api_response_cache (
    cache_key VARCHAR PRIMARY KEY,
    url VARCHAR NOT NULL,
    method VARCHAR DEFAULT 'GET',
    request_headers JSON,
    response_status INTEGER,
    response_headers JSON,
    response_body TEXT,
    response_size_bytes INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    hit_count INTEGER DEFAULT 0,
    last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    response_time_ms INTEGER
);

-- Performance indexes
CREATE INDEX idx_analysis_cache_type ON analysis_cache(analysis_type);
CREATE INDEX idx_analysis_cache_expires ON analysis_cache(expires_at);
CREATE INDEX idx_analysis_cache_access ON analysis_cache(last_accessed);
CREATE INDEX idx_query_cache_expires ON query_cache(expires_at);
CREATE INDEX idx_file_cache_checksum ON file_content_cache(checksum);
CREATE INDEX idx_session_memory_type ON session_memory(memory_type);
CREATE INDEX idx_api_cache_url ON api_response_cache(url);
CREATE INDEX idx_api_cache_expires ON api_response_cache(expires_at);
```

### Cache Manager Architecture

#### DuckDB Cache Manager
```typescript
export class DuckDBCacheManager {
  private db: Database.Database;
  private cacheConfig: CacheConfig;

  constructor(projectRoot: string, config: CacheConfig) {
    this.cacheConfig = config;
    this.db = new Database(path.join(projectRoot, '.gibrun', 'cache.db'));
    this.initializeCache();
  }

  private async initializeCache(): Promise<void> {
    // Enable DuckDB optimizations
    await this.db.exec(`
      SET memory_limit = '${this.cacheConfig.memoryLimit}';
      SET threads = ${this.cacheConfig.threads};
      SET enable_progress_bar = false;
    `);

    await this.createSchema();
    await this.setupMaintenanceTasks();
  }

  private async createSchema(): Promise<void> {
    // Create all cache tables
    await this.db.exec(`
      ${analysisCacheSchema}
      ${queryCacheSchema}
      ${fileContentCacheSchema}
      ${sessionMemorySchema}
      ${apiResponseCacheSchema}
    `);
  }

  private async setupMaintenanceTasks(): Promise<void> {
    // Setup periodic cleanup
    setInterval(() => {
      this.performMaintenance();
    }, this.cacheConfig.maintenanceIntervalMs);
  }

  async performMaintenance(): Promise<void> {
    await this.invalidateExpiredEntries();
    await this.optimizeStorage();
    await this.updateStatistics();
  }
}
```

#### Analysis Cache Manager
```typescript
export class AnalysisCacheManager {
  private db: Database.Database;

  async getCachedResult(cacheKey: string): Promise<AnalysisResult | null> {
    const result = await this.db.all(`
      SELECT result, expires_at, is_valid, hit_count, computation_cost
      FROM analysis_cache
      WHERE cache_key = ? AND is_valid = true AND expires_at > NOW()
    `, [cacheKey]);

    if (result.length === 0) return null;

    // Update access statistics
    await this.updateCacheStats(cacheKey);

    return {
      ...JSON.parse(result[0].result),
      fromCache: true,
      computationCost: result[0].computation_cost,
      hitCount: result[0].hit_count
    };
  }

  async setCachedResult(
    cacheKey: string,
    analysisType: string,
    result: any,
    ttlHours: number = 24,
    computationCost: number = 0
  ): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + ttlHours);

    const resultSize = JSON.stringify(result).length;

    await this.db.run(`
      INSERT OR REPLACE INTO analysis_cache
      (cache_key, analysis_type, result, expires_at, computation_cost, result_size_bytes)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      cacheKey,
      analysisType,
      JSON.stringify(result),
      expiresAt.toISOString(),
      computationCost,
      resultSize
    ]);
  }

  private async updateCacheStats(cacheKey: string): Promise<void> {
    await this.db.run(`
      UPDATE analysis_cache
      SET hit_count = hit_count + 1, last_accessed = CURRENT_TIMESTAMP
      WHERE cache_key = ?
    `, [cacheKey]);
  }
}
```

#### Query Cache Manager
```typescript
export class QueryCacheManager {
  private db: Database.Database;

  async executeCachedQuery(sql: string, params: any[] = []): Promise<any[]> {
    const queryHash = this.hashQuery(sql, params);

    // Check cache first
    const cached = await this.getCachedQuery(queryHash);
    if (cached && this.isCacheValid(cached)) {
      await this.recordCacheHit(queryHash);
      return cached.result;
    }

    // Execute query
    const startTime = Date.now();
    const result = await this.db.all(sql, ...params);
    const executionTime = Date.now() - startTime;

    // Cache if expensive
    if (this.shouldCacheQuery(executionTime, result.length)) {
      await this.cacheQueryResult(queryHash, sql, params, result, executionTime);
    }

    return result;
  }

  private hashQuery(sql: string, params: any[]): string {
    const normalizedSql = sql.replace(/\s+/g, ' ').trim();
    return crypto.createHash('md5')
      .update(normalizedSql + JSON.stringify(params))
      .digest('hex');
  }

  private shouldCacheQuery(executionTime: number, resultSize: number): boolean {
    return executionTime > 100 || resultSize > 1000; // Configurable thresholds
  }

  private async isCacheValid(cached: any): Promise<boolean> {
    return new Date(cached.expires_at) > new Date();
  }
}
```

#### Session Memory Manager
```typescript
export class SessionMemoryManager {
  private db: Database.Database;

  async storeMemory(
    sessionId: string,
    key: string,
    value: any,
    type: MemoryType = 'semantic',
    salience: number = 1.0,
    ttlHours?: number
  ): Promise<void> {
    const expiresAt = ttlHours ?
      new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString() : null;

    await this.db.run(`
      INSERT OR REPLACE INTO session_memory
      (session_id, memory_key, memory_value, memory_type, salience_score, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      sessionId,
      key,
      JSON.stringify(value),
      type,
      salience,
      expiresAt
    ]);
  }

  async retrieveMemory(sessionId: string, key: string): Promise<any | null> {
    const result = await this.db.all(`
      SELECT memory_value, salience_score, access_count
      FROM session_memory
      WHERE session_id = ? AND memory_key = ?
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    `, [sessionId, key]);

    if (result.length === 0) return null;

    // Update access statistics
    await this.updateMemoryAccess(sessionId, key);

    return {
      value: JSON.parse(result[0].memory_value),
      salience: result[0].salience_score,
      accessCount: result[0].access_count
    };
  }

  async findRelatedMemories(sessionId: string, key: string): Promise<RelatedMemory[]> {
    // Find memories with similar keys or related content
    const result = await this.db.all(`
      SELECT memory_key, memory_value, memory_type, salience_score
      FROM session_memory
      WHERE session_id = ?
        AND memory_key != ?
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
      ORDER BY salience_score DESC
      LIMIT 10
    `, [sessionId, key]);

    return result.map(row => ({
      key: row.memory_key,
      value: JSON.parse(row.memory_value),
      type: row.memory_type,
      salience: row.salience_score
    }));
  }

  private async updateMemoryAccess(sessionId: string, key: string): Promise<void> {
    await this.db.run(`
      UPDATE session_memory
      SET access_count = access_count + 1, last_accessed = CURRENT_TIMESTAMP
      WHERE session_id = ? AND memory_key = ?
    `, [sessionId, key]);
  }
}
```

### Intelligent Cache Invalidation

#### Cache Invalidation Manager
```typescript
export class CacheInvalidationManager {
  private db: Database.Database;

  async invalidateExpiredEntries(): Promise<InvalidationResult> {
    const results = await Promise.all([
      this.db.run('DELETE FROM analysis_cache WHERE expires_at <= CURRENT_TIMESTAMP'),
      this.db.run('DELETE FROM query_cache WHERE expires_at <= CURRENT_TIMESTAMP'),
      this.db.run('DELETE FROM api_response_cache WHERE expires_at <= CURRENT_TIMESTAMP'),
      this.db.run('DELETE FROM session_memory WHERE expires_at <= CURRENT_TIMESTAMP')
    ]);

    return {
      analysis_cache: results[0].changes || 0,
      query_cache: results[1].changes || 0,
      api_cache: results[2].changes || 0,
      session_memory: results[3].changes || 0,
      total_invalidated: results.reduce((sum, r) => sum + (r.changes || 0), 0)
    };
  }

  async invalidateByPattern(pattern: string, cacheType?: string): Promise<InvalidationResult> {
    const likePattern = pattern.replace(/\*/g, '%');
    let result = { analysis_cache: 0, query_cache: 0, api_cache: 0, session_memory: 0, total_invalidated: 0 };

    if (!cacheType || cacheType === 'analysis') {
      const analysisResult = await this.db.run(
        'UPDATE analysis_cache SET is_valid = false WHERE cache_key LIKE ?',
        [likePattern]
      );
      result.analysis_cache = analysisResult.changes || 0;
    }

    if (!cacheType || cacheType === 'query') {
      const queryResult = await this.db.run(
        'UPDATE query_cache SET expires_at = CURRENT_TIMESTAMP WHERE query_sql LIKE ?',
        [likePattern]
      );
      result.query_cache = queryResult.changes || 0;
    }

    result.total_invalidated = result.analysis_cache + result.query_cache + result.api_cache + result.session_memory;

    return result;
  }

  async invalidateFileRelatedCache(filePath: string): Promise<void> {
    // Invalidate analysis results that depend on this file
    await this.db.run(`
      UPDATE analysis_cache
      SET is_valid = false
      WHERE parameters::text LIKE ?
    `, [`%${filePath}%`]);

    // Invalidate file content cache
    await this.db.run('UPDATE file_content_cache SET is_valid = false WHERE file_path = ?', [filePath]);

    // Invalidate dependent caches
    await this.invalidateDependentCaches(filePath);
  }

  private async invalidateDependentCaches(filePath: string): Promise<void> {
    // Find files that import this file
    const dependents = await this.db.all(`
      SELECT DISTINCT f.file_path
      FROM file_dependencies_cache d
      JOIN file_content_cache f ON d.file_path = f.file_path
      WHERE d.dependency_path = ? AND f.is_valid = true
    `, [filePath]);

    for (const dependent of dependents) {
      await this.invalidateFileRelatedCache(dependent.file_path);
    }
  }
}
```

### Cache Performance Monitoring

#### Cache Monitoring Manager
```typescript
export class CacheMonitoringManager {
  private db: Database.Database;

  async getCacheOverview(): Promise<CacheOverview> {
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

    const totalSize = analysisStats.size + queryStats.size + fileStats.size + apiStats.size;

    return {
      analysis_cache: analysisStats,
      query_cache: queryStats,
      file_cache: fileStats,
      api_cache: apiStats,
      session_memory: memoryStats,
      total_size_bytes: totalSize,
      total_size_mb: totalSize / (1024 * 1024),
      generated_at: new Date()
    };
  }

  private async getAnalysisCacheStats(): Promise<CacheStats> {
    const stats = await this.db.all(`
      SELECT
        COUNT(*) as total_entries,
        COUNT(CASE WHEN is_valid = true THEN 1 END) as valid_entries,
        COUNT(CASE WHEN expires_at > CURRENT_TIMESTAMP THEN 1 END) as non_expired,
        SUM(result_size_bytes) as size_bytes,
        AVG(hit_count) as avg_hit_rate,
        AVG(computation_cost) as avg_computation_cost,
        SUM(hit_count) as total_hits
      FROM analysis_cache
    `);

    const data = stats[0];
    return {
      total_entries: data.total_entries,
      valid_entries: data.valid_entries,
      non_expired_entries: data.non_expired,
      hit_rate: data.total_entries > 0 ? data.total_hits / data.total_entries : 0,
      size_bytes: data.size_bytes,
      avg_computation_cost: data.avg_computation_cost
    };
  }

  async getCacheEfficiencyReport(): Promise<EfficiencyReport> {
    const overview = await this.getCacheOverview();

    return {
      overall_hit_rate: this.calculateOverallHitRate(overview),
      cache_utilization: this.calculateUtilization(overview),
      cost_savings: await this.calculateCostSavings(),
      performance_improvement: await this.calculatePerformanceImprovement(),
      recommendations: await this.generateOptimizationRecommendations(overview)
    };
  }

  private calculateOverallHitRate(overview: CacheOverview): number {
    const totalHits = overview.analysis_cache.hit_rate * overview.analysis_cache.total_entries +
                     overview.query_cache.hit_rate * overview.query_cache.total_entries +
                     overview.api_cache.hit_rate * overview.api_cache.total_entries;

    const totalEntries = overview.analysis_cache.total_entries +
                        overview.query_cache.total_entries +
                        overview.api_cache.total_entries;

    return totalEntries > 0 ? totalHits / totalEntries : 0;
  }

  private async calculateCostSavings(): Promise<CostSavings> {
    // Calculate time saved by cache hits
    const analysisSavings = await this.db.all(`
      SELECT SUM(computation_cost * hit_count) as time_saved_seconds
      FROM analysis_cache
      WHERE hit_count > 0
    `);

    const timeSaved = analysisSavings[0]?.time_saved_seconds || 0;

    return {
      time_saved_seconds: timeSaved,
      estimated_cost_savings: timeSaved * 0.01, // $0.01 per second of computation
      cache_entries_saved: await this.getCacheEntriesSaved()
    };
  }

  private async getCacheEntriesSaved(): Promise<number> {
    const result = await this.db.all(`
      SELECT COUNT(*) as saved_entries
      FROM analysis_cache
      WHERE hit_count > 0
    `);

    return result[0]?.saved_entries || 0;
  }

  private async generateOptimizationRecommendations(overview: CacheOverview): Promise<string[]> {
    const recommendations: string[] = [];

    // Check cache sizes
    if (overview.total_size_mb > 500) {
      recommendations.push('Consider increasing cache size limit or implementing more aggressive eviction');
    }

    // Check hit rates
    if (overview.analysis_cache.hit_rate < 0.5) {
      recommendations.push('Analysis cache hit rate is low - consider adjusting TTL or cache key strategy');
    }

    // Check memory usage
    if (overview.session_memory.total_entries > 10000) {
      recommendations.push('High session memory usage - consider implementing memory cleanup policies');
    }

    return recommendations;
  }
}
```

## 📋 MCP Tools

### Cache Management Tools

#### `cache_get_overview`
Get comprehensive cache statistics and performance metrics.

**Parameters:**
```typescript
{
  "cache_types": ["analysis", "query", "file", "api", "memory"],
  "include_efficiency": true,
  "time_range": "24h"
}
```

**Response:**
```typescript
{
  "overview": {
    "analysis_cache": {
      "total_entries": 150,
      "valid_entries": 145,
      "hit_rate": 0.85,
      "size_mb": 45.2
    },
    "query_cache": {
      "total_entries": 89,
      "hit_rate": 0.92,
      "avg_execution_time_saved_ms": 250
    },
    "total_size_mb": 156.8,
    "overall_efficiency": 0.88
  },
  "efficiency_report": {
    "cost_savings": {
      "time_saved_seconds": 1250,
      "estimated_cost_savings": 12.50
    },
    "recommendations": [
      "Analysis cache performing well",
      "Consider increasing query cache TTL"
    ]
  }
}
```

#### `cache_invalidate_entries`
Invalidate cache entries by pattern or criteria.

**Parameters:**
```typescript
{
  "cache_type": "analysis",
  "pattern": "architecture_*",
  "older_than": "24h",
  "dry_run": false
}
```

**Response:**
```typescript
{
  "invalidated": {
    "analysis_cache": 12,
    "query_cache": 0,
    "total": 12
  },
  "errors": []
}
```

#### `cache_cleanup_maintenance`
Perform cache maintenance operations.

**Parameters:**
```typescript
{
  "operations": ["cleanup_expired", "optimize_storage", "rebuild_indexes"],
  "max_cache_size_mb": 256,
  "dry_run": false
}
```

**Response:**
```typescript
{
  "maintenance_results": {
    "expired_cleaned": 25,
    "storage_optimized": true,
    "indexes_rebuilt": true,
    "size_before_mb": 312.5,
    "size_after_mb": 245.8
  }
}
```

#### `cache_analyze_performance`
Analyze cache performance and provide optimization recommendations.

**Parameters:**
```typescript
{
  "analysis_type": "comprehensive",
  "time_range": "7d",
  "include_recommendations": true
}
```

**Response:**
```typescript
{
  "performance_analysis": {
    "hit_rates": {
      "overall": 0.87,
      "by_cache_type": {
        "analysis": 0.85,
        "query": 0.92,
        "api": 0.78
      }
    },
    "performance_trends": [
      { "date": "2024-01-01", "hit_rate": 0.82 },
      { "date": "2024-01-02", "hit_rate": 0.88 }
    ],
    "bottlenecks": [
      "API cache has low hit rate - consider adjusting TTL"
    ],
    "recommendations": [
      "Increase API cache TTL from 5min to 15min",
      "Implement LRU eviction for analysis cache",
      "Add more specific cache keys for analysis results"
    ]
  }
}
```

### Session Memory Tools

#### `memory_store_value`
Store value in session memory.

**Parameters:**
```typescript
{
  "session_id": "opencode-session-123",
  "key": "project_context",
  "value": {
    "last_analysis": "2024-01-15T10:30:00Z",
    "health_score": 85,
    "critical_issues": ["auth_vulnerability"]
  },
  "type": "semantic",
  "salience": 0.9,
  "ttl_hours": 168
}
```

#### `memory_retrieve_value`
Retrieve value from session memory.

**Parameters:**
```typescript
{
  "session_id": "opencode-session-123",
  "key": "project_context"
}
```

**Response:**
```typescript
{
  "value": {
    "last_analysis": "2024-01-15T10:30:00Z",
    "health_score": 85,
    "critical_issues": ["auth_vulnerability"]
  },
  "metadata": {
    "type": "semantic",
    "salience": 0.9,
    "access_count": 5,
    "last_accessed": "2024-01-15T14:20:00Z"
  }
}
```

#### `memory_find_related`
Find related memories in session.

**Parameters:**
```typescript
{
  "session_id": "opencode-session-123",
  "key": "project_context",
  "limit": 5
}
```

## 🎯 Detection & Analysis Logic

### Cache Key Generation
```typescript
export class CacheKeyGenerator {
  static generateAnalysisKey(operation: string, params: any): string {
    // Include relevant parameters that affect result
    const keyComponents = {
      operation,
      scope: params.scope,
      file_path: params.file_path,
      language: params.language,
      // Hash large parameters
      content_hash: params.content ? this.hashString(params.content) : null
    };

    return this.hashObject(keyComponents);
  }

  static generateQueryKey(sql: string, params: any[]): string {
    const normalizedSql = sql.replace(/\s+/g, ' ').trim();
    return crypto.createHash('md5')
      .update(normalizedSql + JSON.stringify(params))
      .digest('hex');
  }

  static generateAPIKey(url: string, method: string, headers: any): string {
    // Include only cache-relevant headers
    const cacheHeaders = this.extractCacheHeaders(headers);
    return crypto.createHash('md5')
      .update(`${method}:${url}:${JSON.stringify(cacheHeaders)}`)
      .digest('hex');
  }

  private static extractCacheHeaders(headers: any): any {
    const relevantHeaders = ['authorization', 'accept', 'accept-language', 'user-agent'];
    const cacheHeaders: any = {};

    for (const header of relevantHeaders) {
      if (headers[header]) {
        cacheHeaders[header] = headers[header];
      }
    }

    return cacheHeaders;
  }

  private static hashString(str: string): string {
    return crypto.createHash('md5').update(str).digest('hex').substring(0, 8);
  }

  private static hashObject(obj: any): string {
    return crypto.createHash('md5').update(JSON.stringify(obj)).digest('hex');
  }
}
```

### Cache Eviction Policies

#### LRU Eviction
```typescript
export class LRUEvictionPolicy {
  async evict(maxEntries: number): Promise<number> {
    const result = await this.db.run(`
      DELETE FROM analysis_cache
      WHERE cache_key NOT IN (
        SELECT cache_key FROM analysis_cache
        ORDER BY last_accessed DESC
        LIMIT ?
      )
    `, [maxEntries]);

    return result.changes || 0;
  }
}
```

#### Size-Based Eviction
```typescript
export class SizeBasedEvictionPolicy {
  async evict(maxSizeBytes: number): Promise<number> {
    const currentSize = await this.getTotalCacheSize();

    if (currentSize <= maxSizeBytes) return 0;

    const excessSize = currentSize - maxSizeBytes;
    let deletedSize = 0;
    let deletedCount = 0;

    // Delete oldest entries until under limit
    const entries = await this.db.all(`
      SELECT cache_key, result_size_bytes
      FROM analysis_cache
      ORDER BY last_accessed ASC
    `);

    for (const entry of entries) {
      if (deletedSize >= excessSize) break;

      await this.db.run('DELETE FROM analysis_cache WHERE cache_key = ?', [entry.cache_key]);
      deletedSize += entry.result_size_bytes;
      deletedCount++;
    }

    return deletedCount;
  }
}
```

## 🔗 Integration Points

### Project Analyzer Integration
- Cache analysis results untuk menghindari recomputation
- Use cached file content untuk incremental analysis
- Store analysis metadata dalam cache untuk tracking

### LSP Integration
- Cache symbol information untuk fast lookups
- Store parsed AST data untuk incremental parsing
- Cache diagnostics results untuk quick retrieval

### opencode Integration
- Session memory untuk persistent context
- Cache analysis results untuk cross-session usage
- Store user preferences dan project state

## 🧪 Testing Strategy

### Unit Tests
```typescript
// test/unit/cache-manager.test.ts
describe('CacheManager', () => {
  let cacheManager: AnalysisCacheManager;

  beforeEach(async () => {
    cacheManager = new AnalysisCacheManager(':memory:');
  });

  test('should cache and retrieve analysis results', async () => {
    const cacheKey = 'test_analysis';
    const result = { score: 85, issues: ['bug1', 'bug2'] };

    await cacheManager.setCachedResult(cacheKey, 'quality', result, 1);

    const cached = await cacheManager.getCachedResult(cacheKey);
    expect(cached).toEqual({
      ...result,
      fromCache: true,
      hitCount: 1
    });
  });

  test('should expire cache entries', async () => {
    const cacheKey = 'expiring_cache';
    const result = { data: 'test' };

    // Set cache with very short TTL
    await cacheManager.setCachedResult(cacheKey, 'test', result, 0.001); // 3.6 seconds

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 4000));

    const cached = await cacheManager.getCachedResult(cacheKey);
    expect(cached).toBeNull();
  });
});
```

### Integration Tests
```typescript
// test/integration/cache-integration.test.ts
describe('Cache Integration', () => {
  let projectIndexer: ProjectIndexer;
  let cacheManager: DuckDBCacheManager;

  beforeAll(async () => {
    projectIndexer = new ProjectIndexer('/tmp/test-project');
    cacheManager = new DuckDBCacheManager('/tmp/test-project');
    await projectIndexer.initialize();
  });

  test('should cache analysis results automatically', async () => {
    // Perform analysis
    const result = await projectIndexer.analyze('quality');

    // Check if result is cached
    const cacheKey = CacheKeyGenerator.generateAnalysisKey('quality', {});
    const cached = await cacheManager.getAnalysisCache(cacheKey);

    expect(cached).toBeDefined();
    expect(cached?.result).toEqual(result);
  });

  test('should use cached results for subsequent calls', async () => {
    const startTime = Date.now();

    // First call - should compute
    await projectIndexer.analyze('quality');
    const firstCallTime = Date.now() - startTime;

    // Second call - should use cache
    const secondStartTime = Date.now();
    const result2 = await projectIndexer.analyze('quality');
    const secondCallTime = Date.now() - secondStartTime;

    // Second call should be significantly faster
    expect(secondCallTime).toBeLessThan(firstCallTime * 0.5);
    expect(result2.fromCache).toBe(true);
  });
});
```

### Performance Tests
```typescript
// test/performance/cache-performance.test.ts
describe('Cache Performance', () => {
  test('cache operations should be fast', async () => {
    const operations = [];

    // Test cache set operations
    for (let i = 0; i < 100; i++) {
      operations.push(cacheManager.setCachedResult(
        `test_key_${i}`,
        'test',
        { data: `value_${i}` },
        1
      ));
    }

    const startTime = Date.now();
    await Promise.all(operations);
    const totalTime = Date.now() - startTime;

    // Should complete within reasonable time
    expect(totalTime).toBeLessThan(5000); // 5 seconds for 100 operations
    expect(totalTime / 100).toBeLessThan(100); // < 100ms per operation
  });

  test('cache hit rate should be high for repeated queries', async () => {
    const query = 'SELECT * FROM symbols WHERE language = ?';
    const params = ['go'];

    // Execute same query multiple times
    for (let i = 0; i < 10; i++) {
      await queryCache.executeCachedQuery(query, params);
    }

    const stats = await queryCache.getPerformanceStats();
    expect(stats.hit_rate).toBeGreaterThan(0.8); // > 80% hit rate
  });
});
```

## 📈 Success Metrics

### Performance Metrics
- **Cache Hit Rate**: >80% untuk analysis cache, >90% untuk query cache
- **Response Time**: <50ms untuk cache hits, <200ms untuk cache misses
- **Memory Usage**: <256MB untuk large codebases
- **Storage Efficiency**: 60%+ size reduction dengan compression

### Reliability Metrics
- **Data Integrity**: 100% ACID compliance
- **Cache Consistency**: <0.1% inconsistency rate
- **Invalidation Accuracy**: >95% correct invalidation
- **Recovery Time**: <30 seconds untuk cache rebuild

### Business Impact Metrics
- **Time Savings**: 40% reduction in analysis execution time
- **Cost Reduction**: 30% reduction in computational costs
- **Developer Productivity**: 25% faster development cycles
- **System Performance**: 50% improvement in overall responsiveness

## 🚀 Implementation Roadmap

### Phase 1: Core Cache Infrastructure (2-3 weeks)
- [ ] DuckDB Cache Manager dengan basic operations
- [ ] Analysis Results Cache untuk expensive computations
- [ ] Query Result Cache untuk complex analytics
- [ ] File Content Cache untuk parsed data

### Phase 2: Advanced Caching Features (2-3 weeks)
- [ ] Session Memory Cache untuk opencode integration
- [ ] API Response Cache untuk external calls
- [ ] Intelligent Cache Invalidation strategies
- [ ] Cache Performance Monitoring

### Phase 3: Production Optimization (1-2 weeks)
- [ ] Cache Eviction policies (LRU, size-based)
- [ ] MCP Cache Management Tools
- [ ] Performance optimization dan tuning
- [ ] Comprehensive testing dan documentation

---

**DuckDB Cache System akan mentransformasi gibRun menjadi intelligent caching powerhouse dengan unified storage, advanced analytics, dan optimal performance!** 🚀