import * as path from 'path';
import * as fs from 'fs/promises';
import Database from 'duckdb';
import { logInfo, logError } from '@/services/logger-service.js';
import { CacheConfig } from '@/types/cache.js';
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
 * DuckDB Cache Manager - Core cache manager with database initialization
 */
export class DuckDBCacheManager {
  private db!: Database.Database;
  private dbPath: string;
  private logger: LoggerService;
  private initialized = false;
  private maintenanceTimer?: NodeJS.Timeout;

  constructor(
    private projectRoot: string,
    private cacheConfig: CacheConfig,
    logger?: LoggerService
  ) {
    this.dbPath = path.join(projectRoot, '.gibrun', 'cache.db');
    this.logger = logger || new SimpleLogger();
    this.initializeCache();
  }

  /**
   * Initialize cache database and schema
   */
  private async initializeCache(): Promise<void> {
    try {
      this.logger.info('Initializing DuckDB cache database', { dbPath: this.dbPath });

      // Ensure directory exists
      const dbDir = path.dirname(this.dbPath);
      await fs.mkdir(dbDir, { recursive: true });

      // Create database connection
      this.db = new Database.Database(this.dbPath);

      // Configure performance settings
      await this.configureDatabase();

      // Create schema and indexes
      await this.createSchema();
      await this.createIndexes();

      // Setup maintenance tasks
      this.setupMaintenanceTasks();

      this.initialized = true;
      this.logger.info('DuckDB cache database initialized successfully');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to initialize DuckDB cache database', { error: errorMessage });
      throw new Error(`Cache database initialization failed: ${errorMessage}`);
    }
  }

  /**
   * Configure database performance settings
   */
  private async configureDatabase(): Promise<void> {
    const connection = this.db.connect();

    try {
      await  promisifyRun(connection,`
        SET memory_limit = '${this.cacheConfig.memoryLimit}';
        SET threads = ${this.cacheConfig.threads};
        SET enable_progress_bar = false;
        SET enable_object_cache = true;
      `);

      this.logger.debug('Cache database performance settings configured');

    } finally {
      connection.close();
    }
  }

  /**
   * Create database schema with all cache tables
   */
  private async createSchema(): Promise<void> {
    const connection = this.db.connect();

    try {
      const schema = `
        -- Analysis results cache
        CREATE TABLE IF NOT EXISTS analysis_cache (
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
        CREATE TABLE IF NOT EXISTS query_cache (
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
        CREATE TABLE IF NOT EXISTS file_content_cache (
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
        CREATE TABLE IF NOT EXISTS session_memory (
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
        CREATE TABLE IF NOT EXISTS api_response_cache (
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
      `;

      await  promisifyRun(connection,schema);
      this.logger.debug('Cache database schema created successfully');

    } finally {
      connection.close();
    }
  }

  /**
   * Create performance indexes for optimal query speed
   */
  private async createIndexes(): Promise<void> {
    const connection = this.db.connect();

    try {
      const indexes = `
        -- Analysis cache indexes
        CREATE INDEX IF NOT EXISTS idx_analysis_cache_type ON analysis_cache(analysis_type);
        CREATE INDEX IF NOT EXISTS idx_analysis_cache_expires ON analysis_cache(expires_at);
        CREATE INDEX IF NOT EXISTS idx_analysis_cache_access ON analysis_cache(last_accessed);

        -- Query cache indexes
        CREATE INDEX IF NOT EXISTS idx_query_cache_expires ON query_cache(expires_at);

        -- File cache indexes
        CREATE INDEX IF NOT EXISTS idx_file_cache_checksum ON file_content_cache(checksum);

        -- Session memory indexes
        CREATE INDEX IF NOT EXISTS idx_session_memory_type ON session_memory(memory_type);

        -- API cache indexes
        CREATE INDEX IF NOT EXISTS idx_api_cache_url ON api_response_cache(url);
        CREATE INDEX IF NOT EXISTS idx_api_cache_expires ON api_response_cache(expires_at);
      `;

      await  promisifyRun(connection,indexes);
      this.logger.debug('Cache database indexes created successfully');

    } finally {
      connection.close();
    }
  }

  /**
   * Setup periodic maintenance tasks
   */
  private setupMaintenanceTasks(): void {
    this.maintenanceTimer = setInterval(() => {
      this.performMaintenance().catch(error => {
        this.logger.error('Cache maintenance failed', error);
      });
    }, this.cacheConfig.maintenanceIntervalMs);

    this.logger.debug('Cache maintenance tasks scheduled', {
      intervalMs: this.cacheConfig.maintenanceIntervalMs
    });
  }

  /**
   * Perform maintenance operations
   */
  async performMaintenance(): Promise<void> {
    try {
      this.logger.debug('Starting cache maintenance');

      await this.invalidateExpiredEntries();
      await this.optimizeStorage();
      await this.updateStatistics();

      this.logger.debug('Cache maintenance completed');

    } catch (error) {
      this.logger.error('Cache maintenance failed', error);
    }
  }

  /**
   * Invalidate expired cache entries
   */
  private async invalidateExpiredEntries(): Promise<void> {
    const connection = this.db.connect();

    try {
      const now = new Date().toISOString();

      await promisifyRun(connection, 'DELETE FROM analysis_cache WHERE expires_at <= ?', [now]);
      await promisifyRun(connection, 'DELETE FROM query_cache WHERE expires_at <= ?', [now]);
      await promisifyRun(connection, 'DELETE FROM api_response_cache WHERE expires_at <= ?', [now]);
      await promisifyRun(connection, 'DELETE FROM session_memory WHERE expires_at <= ?', [now]);

      this.logger.debug('Expired cache entries invalidated');

    } finally {
      connection.close();
    }
  }

  /**
   * Optimize storage and rebuild indexes
   */
  private async optimizeStorage(): Promise<void> {
    const connection = this.db.connect();

    try {
      // Analyze tables for query optimization
      await  promisifyRun(connection,'ANALYZE;');

      // Vacuum database to reclaim space
      await  promisifyRun(connection,'VACUUM;');

      this.logger.debug('Cache storage optimized');

    } finally {
      connection.close();
    }
  }

  /**
   * Update cache statistics
   */
  private async updateStatistics(): Promise<void> {
    // This could be extended to update metadata tables with statistics
    this.logger.debug('Cache statistics updated');
  }

  /**
   * Get database connection for queries
   */
  public getConnection(): Database.Connection {
    if (!this.initialized) {
      throw new Error('Cache database not initialized');
    }
    return this.db.connect();
  }

  /**
   * Close database connection
   */
  public async close(): Promise<void> {
    if (this.maintenanceTimer) {
      clearInterval(this.maintenanceTimer);
    }

    if (this.db) {
      this.db.close();
      this.logger.debug('Cache database connection closed');
    }
  }

  /**
   * Get database path
   */
  public getDatabasePath(): string {
    return this.dbPath;
  }

  /**
   * Check if database is initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get cache configuration
   */
  public getConfig(): CacheConfig {
    return { ...this.cacheConfig };
  }
}