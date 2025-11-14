import * as path from 'path';
import * as fs from 'fs/promises';
import Database from 'duckdb';
import { logInfo, logError } from '@/services/logger-service.js';
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

export interface FileInfo {
  file_path: string;
  file_name: string;
  directory: string;
  extension: string;
  language: string;
  size_bytes: number;
  lines_count: number;
  last_modified: Date;
  checksum: string;
  is_binary?: boolean;
}

export interface SymbolInfo {
  id: string;
  name: string;
  type: string;
  file_path: string;
  line_number: number;
  signature?: string;
  visibility?: string;
  complexity?: number;
  language: string;
  metadata?: any;
}

export interface MetricData {
  id: string;
  file_path?: string;
  symbol_id?: string;
  metric_type: string;
  metric_name: string;
  metric_value: number;
  recorded_at?: Date;
  analysis_version?: string;
}

export interface DependencyInfo {
  id: string;
  from_file: string;
  to_file: string;
  dependency_type: string;
  symbol_name?: string;
  is_external?: boolean;
  package_name?: string;
  version?: string;
}

export interface GitHistoryInfo {
  commit_hash: string;
  author: string;
  email: string;
  date: Date;
  message: string;
  files_changed: number;
  insertions: number;
  deletions: number;
  commit_type?: string;
  branch?: string;
  tags?: string[];
}

export interface TodoInfo {
  id: string;
  text: string;
  type?: string;
  category?: string;
  file_path?: string;
  line_number?: number;
  priority?: string;
  status?: string;
  assignee?: string;
  completed_at?: Date;
}

export interface AnalysisCacheInfo {
  cache_key: string;
  analysis_type: string;
  parameters: any;
  result: any;
  expires_at?: Date;
  is_valid?: boolean;
}

export interface MetadataInfo {
  key: string;
  value: any;
}

/**
 * DuckDB Manager for project indexing with high-performance analytics capabilities
 */
export class DuckDBManager {
  private db!: Database.Database;
  private dbPath: string;
  private logger: LoggerService;
  private initialized = false;
  private connectionPool: Database.Connection[] = [];
  private maxPoolSize = 5;

  constructor(
    private projectRoot: string,
    logger?: LoggerService
  ) {
    this.dbPath = path.join(projectRoot, '.gibrun', 'project_index.db');
    this.logger = logger || new SimpleLogger();
    this.initializeDatabase();
  }

  /**
   * Initialize database connection and schema
   */
  private async initializeDatabase(): Promise<void> {
    try {
      this.logger.info('Initializing DuckDB database', { dbPath: this.dbPath });

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

      this.initialized = true;
      this.logger.info('DuckDB database initialized successfully');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to initialize DuckDB database', { error: errorMessage });
      throw new Error(`Database initialization failed: ${errorMessage}`);
    }
  }

  /**
   * Configure database performance settings
   */
  private async configureDatabase(): Promise<void> {
    const connection = this.db.connect();

    try {
      // Performance optimizations
      await promisifyRun(connection, `
        SET memory_limit = '256MB';
        SET threads = 4;
        SET enable_progress_bar = false;
        SET enable_object_cache = true;
        SET max_memory = '256MB';
      `);

      this.logger.debug('Database performance settings configured');

    } finally {
      connection.close();
    }
  }

  /**
   * Create database schema with all required tables
   */
  private async createSchema(): Promise<void> {
    const connection = this.db.connect();

    try {
      const schema = `
        -- Files table: File structure and metadata
        CREATE TABLE IF NOT EXISTS files (
          file_path VARCHAR PRIMARY KEY,
          file_name VARCHAR NOT NULL,
          directory VARCHAR NOT NULL,
          extension VARCHAR,
          language VARCHAR,
          size_bytes INTEGER,
          lines_count INTEGER,
          last_modified TIMESTAMP,
          checksum VARCHAR,
          is_binary BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Symbols table: Functions, classes, variables
        CREATE TABLE IF NOT EXISTS symbols (
          id VARCHAR PRIMARY KEY,
          name VARCHAR NOT NULL,
          type VARCHAR NOT NULL,
          file_path VARCHAR NOT NULL,
          line_number INTEGER,
          signature VARCHAR,
          visibility VARCHAR,
          complexity INTEGER,
          language VARCHAR,
          metadata JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (file_path) REFERENCES files(file_path)
        );

        -- Metrics table: Time-series code metrics
        CREATE TABLE IF NOT EXISTS metrics (
          id VARCHAR PRIMARY KEY,
          file_path VARCHAR,
          symbol_id VARCHAR,
          metric_type VARCHAR NOT NULL,
          metric_name VARCHAR NOT NULL,
          metric_value DOUBLE NOT NULL,
          recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          analysis_version VARCHAR,
          FOREIGN KEY (file_path) REFERENCES files(file_path),
          FOREIGN KEY (symbol_id) REFERENCES symbols(id)
        );

        -- Dependencies table: Code relationships
        CREATE TABLE IF NOT EXISTS dependencies (
          id VARCHAR PRIMARY KEY,
          from_file VARCHAR NOT NULL,
          to_file VARCHAR,
          dependency_type VARCHAR NOT NULL,
          symbol_name VARCHAR,
          is_external BOOLEAN DEFAULT FALSE,
          package_name VARCHAR,
          version VARCHAR,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (from_file) REFERENCES files(file_path)
        );

        -- Git history table: Version tracking
        CREATE TABLE IF NOT EXISTS git_history (
          commit_hash VARCHAR PRIMARY KEY,
          author VARCHAR NOT NULL,
          email VARCHAR,
          date TIMESTAMP NOT NULL,
          message VARCHAR,
          files_changed INTEGER DEFAULT 0,
          insertions INTEGER DEFAULT 0,
          deletions INTEGER DEFAULT 0,
          commit_type VARCHAR,
          branch VARCHAR,
          tags VARCHAR[],
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- TODOs table: Task management
        CREATE TABLE IF NOT EXISTS todos (
          id VARCHAR PRIMARY KEY,
          text VARCHAR NOT NULL,
          type VARCHAR,
          category VARCHAR,
          file_path VARCHAR,
          line_number INTEGER,
          priority VARCHAR,
          status VARCHAR DEFAULT 'open',
          assignee VARCHAR,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          completed_at TIMESTAMP,
          FOREIGN KEY (file_path) REFERENCES files(file_path)
        );

        -- Analysis cache table: Performance optimization
        CREATE TABLE IF NOT EXISTS analysis_cache (
          cache_key VARCHAR PRIMARY KEY,
          analysis_type VARCHAR NOT NULL,
          parameters JSON,
          result JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMP,
          is_valid BOOLEAN DEFAULT TRUE
        );

        -- Metadata table: Configuration and metadata
        CREATE TABLE IF NOT EXISTS metadata (
          key VARCHAR PRIMARY KEY,
          value JSON,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `;

      await promisifyRun(connection, schema);
      this.logger.debug('Database schema created successfully');

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
        -- Files table indexes
        CREATE INDEX IF NOT EXISTS idx_files_path ON files(file_path);
        CREATE INDEX IF NOT EXISTS idx_files_language ON files(language);
        CREATE INDEX IF NOT EXISTS idx_files_directory ON files(directory);
        CREATE INDEX IF NOT EXISTS idx_files_extension ON files(extension);
        CREATE INDEX IF NOT EXISTS idx_files_modified ON files(last_modified);

        -- Symbols table indexes
        CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file_path);
        CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
        CREATE INDEX IF NOT EXISTS idx_symbols_type ON symbols(type);
        CREATE INDEX IF NOT EXISTS idx_symbols_language ON symbols(language);
        CREATE INDEX IF NOT EXISTS idx_symbols_complexity ON symbols(complexity);

        -- Metrics table indexes
        CREATE INDEX IF NOT EXISTS idx_metrics_file ON metrics(file_path);
        CREATE INDEX IF NOT EXISTS idx_metrics_symbol ON metrics(symbol_id);
        CREATE INDEX IF NOT EXISTS idx_metrics_type ON metrics(metric_type);
        CREATE INDEX IF NOT EXISTS idx_metrics_name ON metrics(metric_name);
        CREATE INDEX IF NOT EXISTS idx_metrics_time ON metrics(recorded_at);

        -- Dependencies table indexes
        CREATE INDEX IF NOT EXISTS idx_dependencies_from ON dependencies(from_file);
        CREATE INDEX IF NOT EXISTS idx_dependencies_to ON dependencies(to_file);
        CREATE INDEX IF NOT EXISTS idx_dependencies_type ON dependencies(dependency_type);
        CREATE INDEX IF NOT EXISTS idx_dependencies_symbol ON dependencies(symbol_name);

        -- Git history indexes
        CREATE INDEX IF NOT EXISTS idx_git_date ON git_history(date);
        CREATE INDEX IF NOT EXISTS idx_git_author ON git_history(author);
        CREATE INDEX IF NOT EXISTS idx_git_branch ON git_history(branch);

        -- TODOs table indexes
        CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status);
        CREATE INDEX IF NOT EXISTS idx_todos_priority ON todos(priority);
        CREATE INDEX IF NOT EXISTS idx_todos_file ON todos(file_path);
        CREATE INDEX IF NOT EXISTS idx_todos_assignee ON todos(assignee);

        -- Analysis cache indexes
        CREATE INDEX IF NOT EXISTS idx_cache_type ON analysis_cache(analysis_type);
        CREATE INDEX IF NOT EXISTS idx_cache_valid ON analysis_cache(is_valid);
        CREATE INDEX IF NOT EXISTS idx_cache_expires ON analysis_cache(expires_at);

        -- Full-text search setup for symbols
        INSTALL fts;
        LOAD fts;

        CREATE TABLE IF NOT EXISTS symbols_fts AS
        SELECT * FROM symbols WHERE 1=0;

        CREATE INDEX IF NOT EXISTS symbol_search_idx ON symbols_fts
        USING FTS (name, signature, file_path);
      `;

      await promisifyRun(connection, indexes);
      this.logger.debug('Database indexes created successfully');

    } finally {
      connection.close();
    }
  }

  /**
   * Get database connection for queries
   */
  public getConnection(): Database.Connection {
    if (!this.initialized) {
      throw new Error('Database not initialized');
    }
    return this.db.connect();
  }

  /**
   * Close database connection
   */
  public async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.logger.debug('Database connection closed');
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

  // ===== CRUD Operations =====

  /**
   * Insert or update file information
   */
  public async upsertFile(fileInfo: FileInfo): Promise<void> {
    const connection = this.getConnection();

    try {
      await promisifyRun(connection, `
        INSERT OR REPLACE INTO files
        (file_path, file_name, directory, extension, language, size_bytes, lines_count, last_modified, checksum, is_binary, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [
        fileInfo.file_path,
        fileInfo.file_name,
        fileInfo.directory,
        fileInfo.extension,
        fileInfo.language,
        fileInfo.size_bytes,
        fileInfo.lines_count,
        fileInfo.last_modified.toISOString(),
        fileInfo.checksum,
        fileInfo.is_binary || false
      ]);

      this.logger.debug('File information upserted', { filePath: fileInfo.file_path });

    } finally {
      connection.close();
    }
  }

  /**
   * Insert or update symbol information
   */
  public async upsertSymbol(symbolInfo: SymbolInfo): Promise<void> {
    const connection = this.getConnection();

    try {
      await promisifyRun(connection, `
        INSERT OR REPLACE INTO symbols
        (id, name, type, file_path, line_number, signature, visibility, complexity, language, metadata, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [
        symbolInfo.id,
        symbolInfo.name,
        symbolInfo.type,
        symbolInfo.file_path,
        symbolInfo.line_number,
        symbolInfo.signature || null,
        symbolInfo.visibility || null,
        symbolInfo.complexity || null,
        symbolInfo.language,
        JSON.stringify(symbolInfo.metadata || {})
      ]);

      this.logger.debug('Symbol information upserted', { symbolId: symbolInfo.id });

    } finally {
      connection.close();
    }
  }

  /**
   * Batch insert symbols for better performance
   */
  public async batchUpsertSymbols(symbols: SymbolInfo[]): Promise<void> {
    if (symbols.length === 0) return;

    const connection = this.getConnection();

    try {
      // Use prepared statement for batch insert
      const stmt = connection.prepare(`
        INSERT OR REPLACE INTO symbols
        (id, name, type, file_path, line_number, signature, visibility, complexity, language, metadata, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);

      // Batch insert all symbols
      for (const symbol of symbols) {
        await stmt.run([
          symbol.id,
          symbol.name,
          symbol.type,
          symbol.file_path,
          symbol.line_number,
          symbol.signature || null,
          symbol.visibility || null,
          symbol.complexity || null,
          symbol.language,
          symbol.metadata ? JSON.stringify(symbol.metadata) : null
        ]);
      }

      stmt.finalize();
      this.logger.debug('Batch symbol upsert completed', { count: symbols.length });

    } finally {
      connection.close();
    }
  }

  /**
   * Batch insert files for better performance
   */
  public async batchUpsertFiles(files: FileInfo[]): Promise<void> {
    if (files.length === 0) return;

    const connection = this.getConnection();

    try {
      const stmt = connection.prepare(`
        INSERT OR REPLACE INTO files
        (file_path, file_name, directory, extension, language, size_bytes, lines_count, last_modified, checksum, is_binary, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);

      for (const file of files) {
        await stmt.run([
          file.file_path,
          file.file_name,
          file.directory,
          file.extension,
          file.language,
          file.size_bytes,
          file.lines_count,
          file.last_modified.toISOString(),
          file.checksum,
          file.is_binary ? 1 : 0
        ]);
      }

      stmt.finalize();
      this.logger.debug('Batch file upsert completed', { count: files.length });

    } finally {
      connection.close();
    }
  }

  /**
   * Batch insert metrics for better performance
   */
  public async batchInsertMetrics(metrics: MetricData[]): Promise<void> {
    if (metrics.length === 0) return;

    const connection = this.getConnection();

    try {
      const stmt = connection.prepare(`
        INSERT INTO metrics
        (id, file_path, symbol_id, metric_type, metric_name, metric_value, recorded_at, analysis_version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const metric of metrics) {
        await stmt.run([
          metric.id,
          metric.file_path || null,
          metric.symbol_id || null,
          metric.metric_type,
          metric.metric_name,
          metric.metric_value,
          metric.recorded_at ? metric.recorded_at.toISOString() : new Date().toISOString(),
          metric.analysis_version || '1.0.0'
        ]);
      }

      stmt.finalize();
      this.logger.debug('Batch metric insert completed', { count: metrics.length });

    } finally {
      connection.close();
    }
  }

  /**
   * Insert metric data
   */
  public async insertMetric(metricData: MetricData): Promise<void> {
    const connection = this.getConnection();

    try {
      await promisifyRun(connection, `
        INSERT INTO metrics
        (id, file_path, symbol_id, metric_type, metric_name, metric_value, recorded_at, analysis_version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        metricData.id,
        metricData.file_path || null,
        metricData.symbol_id || null,
        metricData.metric_type,
        metricData.metric_name,
        metricData.metric_value,
        metricData.recorded_at ? metricData.recorded_at.toISOString() : null,
        metricData.analysis_version || null
      ]);

      this.logger.debug('Metric data inserted', { metricId: metricData.id });

    } finally {
      connection.close();
    }
  }

  /**
   * Insert dependency information
   */
  public async insertDependency(dependencyInfo: DependencyInfo): Promise<void> {
    const connection = this.getConnection();

    try {
      await promisifyRun(connection, `
        INSERT INTO dependencies
        (id, from_file, to_file, dependency_type, symbol_name, is_external, package_name, version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        dependencyInfo.id,
        dependencyInfo.from_file,
        dependencyInfo.to_file,
        dependencyInfo.dependency_type,
        dependencyInfo.symbol_name || null,
        dependencyInfo.is_external || false,
        dependencyInfo.package_name || null,
        dependencyInfo.version || null
      ]);

      this.logger.debug('Dependency information inserted', { dependencyId: dependencyInfo.id });

    } finally {
      connection.close();
    }
  }

  /**
   * Insert git history information
   */
  public async insertGitHistory(gitInfo: GitHistoryInfo): Promise<void> {
    const connection = this.getConnection();

    try {
      await promisifyRun(connection, `
        INSERT OR REPLACE INTO git_history
        (commit_hash, author, email, date, message, files_changed, insertions, deletions, commit_type, branch, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        gitInfo.commit_hash,
        gitInfo.author,
        gitInfo.email,
        gitInfo.date.toISOString(),
        gitInfo.message,
        gitInfo.files_changed,
        gitInfo.insertions,
        gitInfo.deletions,
        gitInfo.commit_type || null,
        gitInfo.branch || null,
        JSON.stringify(gitInfo.tags || [])
      ]);

      this.logger.debug('Git history inserted', { commitHash: gitInfo.commit_hash });

    } finally {
      connection.close();
    }
  }

  /**
   * Insert or update TODO information
   */
  public async upsertTodo(todoInfo: TodoInfo): Promise<void> {
    const connection = this.getConnection();

    try {
      await promisifyRun(connection, `
        INSERT OR REPLACE INTO todos
        (id, text, type, category, file_path, line_number, priority, status, assignee, updated_at, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
      `, [
        todoInfo.id,
        todoInfo.text,
        todoInfo.type || null,
        todoInfo.category || null,
        todoInfo.file_path || null,
        todoInfo.line_number || null,
        todoInfo.priority || null,
        todoInfo.status || 'open',
        todoInfo.assignee || null,
        todoInfo.completed_at ? todoInfo.completed_at.toISOString() : null
      ]);

      this.logger.debug('TODO information upserted', { todoId: todoInfo.id });

    } finally {
      connection.close();
    }
  }

  /**
   * Insert or update analysis cache
   */
  public async upsertAnalysisCache(cacheInfo: AnalysisCacheInfo): Promise<void> {
    const connection = this.getConnection();

    try {
      await promisifyRun(connection, `
        INSERT OR REPLACE INTO analysis_cache
        (cache_key, analysis_type, parameters, result, expires_at, is_valid)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        cacheInfo.cache_key,
        cacheInfo.analysis_type,
        JSON.stringify(cacheInfo.parameters),
        JSON.stringify(cacheInfo.result),
        cacheInfo.expires_at ? cacheInfo.expires_at.toISOString() : null,
        cacheInfo.is_valid !== false
      ]);

      this.logger.debug('Analysis cache upserted', { cacheKey: cacheInfo.cache_key });

    } finally {
      connection.close();
    }
  }

  /**
   * Set metadata value
   */
  public async setMetadata(key: string, value: any): Promise<void> {
    const connection = this.getConnection();

    try {
      await promisifyRun(connection, `
        INSERT OR REPLACE INTO metadata
        (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `, [key, JSON.stringify(value)]);

      this.logger.debug('Metadata set', { key });

    } finally {
      connection.close();
    }
  }

  /**
   * Get metadata value
   */
  public async getMetadata(key: string): Promise<any> {
    const connection = this.getConnection();

    try {
      const result = await promisifyAll(connection, 'SELECT value FROM metadata WHERE key = ?', [key]);

      if (result.length === 0) {
        return null;
      }

      return JSON.parse(result[0].value);

    } finally {
      connection.close();
    }
  }

  // ===== Query Operations =====

  /**
   * Query symbols with filtering
   */
  public async querySymbols(options: {
    searchTerm?: string;
    type?: string;
    language?: string;
    filePath?: string;
    minComplexity?: number;
    limit?: number;
    offset?: number;
  } = {}): Promise<SymbolInfo[]> {
    const connection = this.getConnection();

    try {
      let sql = `
        SELECT
          s.id, s.name, s.type, s.file_path, s.line_number,
          s.signature, s.visibility, s.complexity, s.language,
          s.metadata, s.created_at, s.updated_at
        FROM symbols s
        WHERE 1=1
      `;

      const params: any[] = [];

      if (options.searchTerm) {
        sql += ' AND s.name ILIKE ?';
        params.push(`%${options.searchTerm}%`);
      }

      if (options.type) {
        sql += ' AND s.type = ?';
        params.push(options.type);
      }

      if (options.language) {
        sql += ' AND s.language = ?';
        params.push(options.language);
      }

      if (options.filePath) {
        sql += ' AND s.file_path = ?';
        params.push(options.filePath);
      }

      if (options.minComplexity !== undefined) {
        sql += ' AND s.complexity >= ?';
        params.push(options.minComplexity);
      }

      sql += ' ORDER BY s.name';

      if (options.limit) {
        sql += ' LIMIT ?';
        params.push(options.limit);
      }

      if (options.offset) {
        sql += ' OFFSET ?';
        params.push(options.offset);
      }

      const result = await  promisifyAll(connection,sql, ...params);

      return result.map((row: any) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        file_path: row.file_path,
        line_number: row.line_number,
        signature: row.signature,
        visibility: row.visibility,
        complexity: row.complexity,
        language: row.language,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined
      }));

    } finally {
      connection.close();
    }
  }

  /**
   * Get metrics over time
   */
  public async getMetricsOverTime(options: {
    filePath?: string;
    metricType?: string;
    days?: number;
    groupBy?: 'day' | 'week' | 'month';
  } = {}): Promise<any[]> {
    const connection = this.getConnection();

    try {
      const days = options.days || 30;
      const groupBy = options.groupBy || 'day';

      let sql = `
        SELECT
          DATE_TRUNC('${groupBy}', recorded_at) as period,
          AVG(metric_value) as avg_value,
          MIN(metric_value) as min_value,
          MAX(metric_value) as max_value,
          COUNT(*) as sample_count,
          STDDEV(metric_value) as std_dev
        FROM metrics
        WHERE recorded_at >= NOW() - INTERVAL '${days} days'
      `;

      const params: any[] = [];

      if (options.filePath) {
        sql += ' AND file_path = ?';
        params.push(options.filePath);
      }

      if (options.metricType) {
        sql += ' AND metric_type = ?';
        params.push(options.metricType);
      }

      sql += ' GROUP BY DATE_TRUNC(?, recorded_at) ORDER BY period';
      params.push(groupBy);

      const result = await  promisifyAll(connection,sql, ...params);
      return result;

    } finally {
      connection.close();
    }
  }

  /**
   * Get analysis cache
   */
  public async getAnalysisCache(cacheKey: string): Promise<AnalysisCacheInfo | null> {
    const connection = this.getConnection();

    try {
      const result = await promisifyAll(connection, `
        SELECT * FROM analysis_cache
        WHERE cache_key = ? AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP) AND is_valid = TRUE
      `, [cacheKey]);

      if (result.length === 0) {
        return null;
      }

      const row = result[0];
      return {
        cache_key: row.cache_key,
        analysis_type: row.analysis_type,
        parameters: JSON.parse(row.parameters),
        result: JSON.parse(row.result),
        expires_at: row.expires_at ? new Date(row.expires_at) : undefined,
        is_valid: row.is_valid
      };

    } finally {
      connection.close();
    }
  }

  // ===== Migration Support =====

  /**
   * Migrate from JSON-based indexing to DuckDB
   */
  public async migrateFromJSON(jsonIndexPath: string): Promise<void> {
    try {
      this.logger.info('Starting migration from JSON to DuckDB', { jsonIndexPath });

      // Check if JSON index exists
      if (!(await this.fileExists(jsonIndexPath))) {
        this.logger.info('No JSON index found, skipping migration');
        return;
      }

      // Migrate each index file
      await this.migrateFilesIndex(jsonIndexPath);
      await this.migrateSymbolsIndex(jsonIndexPath);
      await this.migrateMetricsIndex(jsonIndexPath);
      await this.migrateDependenciesIndex(jsonIndexPath);
      await this.migrateTodosIndex(jsonIndexPath);

      // Update migration metadata
      await this.setMetadata('migration_completed', {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        source: 'json'
      });

      this.logger.info('Migration from JSON to DuckDB completed successfully');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Migration failed', { error: errorMessage });
      throw new Error(`Migration failed: ${errorMessage}`);
    }
  }

  private async migrateFilesIndex(jsonIndexPath: string): Promise<void> {
    const filesPath = path.join(jsonIndexPath, 'files.json');

    if (!(await this.fileExists(filesPath))) {
      return;
    }

    const filesData = JSON.parse(await fs.readFile(filesPath, 'utf8'));
    const connection = this.getConnection();

    try {
      await  promisifyRun(connection,'BEGIN TRANSACTION');

      for (const [filePath, fileData] of Object.entries(filesData as Record<string, any>)) {
        await promisifyRun(connection, `
          INSERT OR REPLACE INTO files
          (file_path, file_name, directory, extension, language, size_bytes, lines_count, last_modified, checksum, is_binary)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          filePath,
          fileData.file_name || path.basename(filePath),
          fileData.directory || path.dirname(filePath),
          fileData.extension || path.extname(filePath),
          fileData.language || this.detectLanguage(filePath),
          fileData.size_bytes || 0,
          fileData.lines_count || 0,
          fileData.last_modified || new Date().toISOString(),
          fileData.checksum || '',
          fileData.is_binary || false
        ]);
      }

      await  promisifyRun(connection,'COMMIT');
      this.logger.debug('Files index migrated', { count: Object.keys(filesData).length });

    } catch (error) {
      await  promisifyRun(connection,'ROLLBACK');
      throw error;
    } finally {
      connection.close();
    }
  }

  private async migrateSymbolsIndex(jsonIndexPath: string): Promise<void> {
    const symbolsPath = path.join(jsonIndexPath, 'symbols.json');

    if (!(await this.fileExists(symbolsPath))) {
      return;
    }

    const symbolsData = JSON.parse(await fs.readFile(symbolsPath, 'utf8'));
    const connection = this.getConnection();

    try {
      await  promisifyRun(connection,'BEGIN TRANSACTION');

      for (const [symbolId, symbolData] of Object.entries(symbolsData as Record<string, any>)) {
        await promisifyRun(connection, `
          INSERT OR REPLACE INTO symbols
          (id, name, type, file_path, line_number, signature, visibility, complexity, language, metadata)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          symbolId,
          symbolData.name,
          symbolData.type,
          symbolData.file_path,
          symbolData.line_number,
          symbolData.signature,
          symbolData.visibility,
          symbolData.complexity,
          symbolData.language,
          symbolData.metadata ? JSON.stringify(symbolData.metadata) : null
        ]);
      }

      await  promisifyRun(connection,'COMMIT');
      this.logger.debug('Symbols index migrated', { count: Object.keys(symbolsData).length });

    } catch (error) {
      await  promisifyRun(connection,'ROLLBACK');
      throw error;
    } finally {
      connection.close();
    }
  }

  private async migrateMetricsIndex(jsonIndexPath: string): Promise<void> {
    const metricsPath = path.join(jsonIndexPath, 'metrics.json');

    if (!(await this.fileExists(metricsPath))) {
      return;
    }

    const metricsData = JSON.parse(await fs.readFile(metricsPath, 'utf8'));
    const connection = this.getConnection();

    try {
      await  promisifyRun(connection,'BEGIN TRANSACTION');

      for (const [metricId, metricData] of Object.entries(metricsData as Record<string, any>)) {
        await promisifyRun(connection, `
          INSERT INTO metrics
          (id, file_path, symbol_id, metric_type, metric_name, metric_value, recorded_at, analysis_version)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          metricId,
          metricData.file_path,
          metricData.symbol_id,
          metricData.metric_type,
          metricData.metric_name,
          metricData.metric_value,
          metricData.recorded_at || new Date().toISOString(),
          metricData.analysis_version
        ]);
      }

      await  promisifyRun(connection,'COMMIT');
      this.logger.debug('Metrics index migrated', { count: Object.keys(metricsData).length });

    } catch (error) {
      await  promisifyRun(connection,'ROLLBACK');
      throw error;
    } finally {
      connection.close();
    }
  }

  private async migrateDependenciesIndex(jsonIndexPath: string): Promise<void> {
    const depsPath = path.join(jsonIndexPath, 'dependencies.json');

    if (!(await this.fileExists(depsPath))) {
      return;
    }

    const depsData = JSON.parse(await fs.readFile(depsPath, 'utf8'));
    const connection = this.getConnection();

    try {
      await  promisifyRun(connection,'BEGIN TRANSACTION');

      for (const [depId, depData] of Object.entries(depsData as Record<string, any>)) {
        await promisifyRun(connection, `
          INSERT INTO dependencies
          (id, from_file, to_file, dependency_type, symbol_name, is_external, package_name, version)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          depId,
          depData.from_file,
          depData.to_file,
          depData.dependency_type,
          depData.symbol_name,
          depData.is_external || false,
          depData.package_name,
          depData.version
        ]);
      }

      await  promisifyRun(connection,'COMMIT');
      this.logger.debug('Dependencies index migrated', { count: Object.keys(depsData).length });

    } catch (error) {
      await  promisifyRun(connection,'ROLLBACK');
      throw error;
    } finally {
      connection.close();
    }
  }

  private async migrateTodosIndex(jsonIndexPath: string): Promise<void> {
    const todosPath = path.join(jsonIndexPath, 'todos.json');

    if (!(await this.fileExists(todosPath))) {
      return;
    }

    const todosData = JSON.parse(await fs.readFile(todosPath, 'utf8'));
    const connection = this.getConnection();

    try {
      await  promisifyRun(connection,'BEGIN TRANSACTION');

      for (const [todoId, todoData] of Object.entries(todosData as Record<string, any>)) {
        await promisifyRun(connection, `
          INSERT OR REPLACE INTO todos
          (id, text, type, category, file_path, line_number, priority, status, assignee, completed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          todoId,
          todoData.text,
          todoData.type,
          todoData.category,
          todoData.file_path,
          todoData.line_number,
          todoData.priority,
          todoData.status || 'open',
          todoData.assignee,
          todoData.completed_at
        ]);
      }

      await  promisifyRun(connection,'COMMIT');
      this.logger.debug('TODOs index migrated', { count: Object.keys(todosData).length });

    } catch (error) {
      await  promisifyRun(connection,'ROLLBACK');
      throw error;
    } finally {
      connection.close();
    }
  }

  // ===== Utility Methods =====

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const languageMap: { [key: string]: string } = {
      '.go': 'go',
      '.js': 'javascript',
      '.ts': 'typescript',
      '.jsx': 'javascript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.java': 'java',
      '.cpp': 'cpp',
      '.c': 'c',
      '.rs': 'rust',
      '.php': 'php',
      '.rb': 'ruby',
      '.cs': 'csharp'
    };

    return languageMap[ext] || 'unknown';
  }

  /**
   * Get database statistics
   */
  public async getStatistics(): Promise<any> {
    const connection = this.getConnection();

    try {
      const stats = await promisifyAll(connection, `
        SELECT
          'files' as table_name, COUNT(*) as count FROM files
        UNION ALL
        SELECT 'symbols', COUNT(*) FROM symbols
        UNION ALL
        SELECT 'metrics', COUNT(*) FROM metrics
        UNION ALL
        SELECT 'dependencies', COUNT(*) FROM dependencies
        UNION ALL
        SELECT 'todos', COUNT(*) FROM todos
      `);

      return {
        tables: stats,
        total_records: stats.reduce((sum: number, table: any) => sum + table.count, 0),
        database_size_bytes: await this.getDatabaseSize()
      };

    } finally {
      connection.close();
    }
  }

  private async getDatabaseSize(): Promise<number> {
    try {
      const stats = await fs.stat(this.dbPath);
      return stats.size;
    } catch {
      return 0;
    }
  }

  /**
   * Optimize database performance
   */
  public async optimize(): Promise<void> {
    const connection = this.getConnection();

    try {
      this.logger.info('Starting database optimization');

      // Analyze tables for query optimization
      await promisifyRun(connection, 'ANALYZE;');

      // Vacuum database
      await promisifyRun(connection, 'VACUUM;');

      // Rebuild FTS index
      await promisifyRun(connection, `
        DROP TABLE IF EXISTS symbols_fts;
        CREATE TABLE symbols_fts AS SELECT * FROM symbols;
        CREATE INDEX symbol_search_idx ON symbols_fts USING FTS (name, signature, file_path);
      `);

      this.logger.info('Database optimization completed');

    } finally {
      connection.close();
    }
  }
}