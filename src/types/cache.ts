// src/types/cache.ts - Cache system type definitions

export interface CacheConfig {
  memoryLimit: string;
  threads: number;
  maintenanceIntervalMs: number;
  defaultTtlHours: number;
  maxCacheSizeMb: number;
}

export interface AnalysisResult {
  score?: number;
  issues?: any[];
  metrics?: any;
  fromCache?: boolean;
  computationCost?: number;
  hitCount?: number;
}

export interface QueryResult {
  rows: any[];
  executionTime: number;
  rowCount: number;
  fromCache?: boolean;
}

export interface MemoryType {
  semantic: 'semantic';
  episodic: 'episodic';
  procedural: 'procedural';
  emotional: 'emotional';
  reflective: 'reflective';
}

export type MemoryTypeValue = keyof MemoryType;

export interface RelatedMemory {
  key: string;
  value: any;
  type: MemoryTypeValue;
  salience: number;
}

export interface CacheStats {
  total_entries: number;
  valid_entries: number;
  non_expired_entries: number;
  hit_rate: number;
  size_bytes: number;
  avg_computation_cost?: number;
}

export interface CacheOverview {
  analysis_cache: CacheStats;
  query_cache: CacheStats;
  file_cache: CacheStats;
  api_cache: CacheStats;
  session_memory: CacheStats;
  total_size_bytes: number;
  total_size_mb: number;
  generated_at: Date;
}

export interface CostSavings {
  time_saved_seconds: number;
  estimated_cost_savings: number;
  cache_entries_saved: number;
}

export interface EfficiencyReport {
  overall_hit_rate: number;
  cache_utilization: number;
  cost_savings: CostSavings;
  performance_improvement: number;
  recommendations: string[];
}

export interface InvalidationResult {
  analysis_cache: number;
  query_cache: number;
  api_cache: number;
  session_memory: number;
  total_invalidated: number;
}

export interface CacheKeyGenerator {
  generateAnalysisKey(operation: string, params: any): string;
  generateQueryKey(sql: string, params: any[]): string;
  generateAPIKey(url: string, method: string, headers: any): string;
}

export interface CacheEvictionPolicy {
  evict(maxEntries: number): Promise<number>;
}

export interface SizeBasedEvictionPolicy extends CacheEvictionPolicy {
  evict(maxSizeBytes: number): Promise<number>;
}