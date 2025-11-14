import { existsSync, readFileSync } from "fs";

export interface ServerConfig {
  duckdb?: {
    memory_limit?: string;
    threads?: number;
    maintenance_interval_ms?: number;
    default_ttl_hours?: number;
    max_cache_size_mb?: number;
  };
  [key: string]: any;
}

export class ConfigManager {
  private static instance: ConfigManager;
  private config: ServerConfig = {};

  private constructor() {
    this.loadConfig();
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  private loadConfig(): void {
    try {
      const configPath = process.env.GIBRUN_CONFIG_PATH || './config.json';
      if (existsSync(configPath)) {
        const configData = readFileSync(configPath, 'utf-8');
        this.config = JSON.parse(configData);
      }
    } catch (error) {
      console.log('No configuration file found, using defaults');
    }
  }

  getConfig(): ServerConfig {
    return this.config;
  }

  getDuckDBConfig() {
    const duckdbConfig = this.config.duckdb || {};
    return {
      memoryLimit: duckdbConfig.memory_limit || process.env.DUCKDB_MEMORY_LIMIT || '256MB',
      threads: parseInt(duckdbConfig.threads?.toString() || process.env.DUCKDB_THREADS || '4'),
      maintenanceIntervalMs: parseInt(duckdbConfig.maintenance_interval_ms?.toString() || process.env.DUCKDB_MAINTENANCE_INTERVAL_MS || '300000'),
      defaultTtlHours: parseInt(duckdbConfig.default_ttl_hours?.toString() || process.env.DUCKDB_DEFAULT_TTL_HOURS || '24'),
      maxCacheSizeMb: parseInt(duckdbConfig.max_cache_size_mb?.toString() || process.env.DUCKDB_MAX_CACHE_SIZE_MB || '256')
    };
  }
}