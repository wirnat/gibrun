import Database from 'duckdb';
import { logInfo, logError } from '@/services/logger-service.js';

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

export class DatabaseInitializer {
  constructor(
    private db: Database.Database,
    private logger: LoggerService = new SimpleLogger()
  ) {}

  async initializeDatabase(): Promise<void> {
    try {
      this.logger.info('Initializing DuckDB database');
      await this.configureDatabase();
      await this.createSchema();
      await this.createIndexes();
      this.logger.info('DuckDB database initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize database', error);
      throw error;
    }
  }

  private async configureDatabase(): Promise<void> {
    const pragmas = [
      "PRAGMA memory_limit='256MB'",
      "PRAGMA threads=4",
      "PRAGMA temp_directory=''",
      "PRAGMA enable_progress_bar=false",
      "PRAGMA enable_object_cache=true"
    ];

    for (const pragma of pragmas) {
      await new Promise<void>((resolve, reject) => {
        this.db.exec(pragma, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }

  private async createSchema(): Promise<void> {
    const schema = `
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

      CREATE TABLE IF NOT EXISTS symbols (
        id VARCHAR PRIMARY KEY,
        name VARCHAR NOT NULL,
        type VARCHAR NOT NULL,
        file_path VARCHAR NOT NULL,
        line_number INTEGER,
        signature TEXT,
        visibility VARCHAR,
        complexity INTEGER,
        language VARCHAR,
        metadata JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS metrics (
        id VARCHAR PRIMARY KEY,
        file_path VARCHAR,
        symbol_id VARCHAR,
        metric_type VARCHAR NOT NULL,
        metric_name VARCHAR NOT NULL,
        metric_value DOUBLE,
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        analysis_version VARCHAR
      );

      CREATE TABLE IF NOT EXISTS dependencies (
        id VARCHAR PRIMARY KEY,
        from_file VARCHAR NOT NULL,
        to_file VARCHAR NOT NULL,
        dependency_type VARCHAR NOT NULL,
        symbol_name VARCHAR,
        is_external BOOLEAN DEFAULT FALSE,
        package_name VARCHAR,
        version VARCHAR,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS git_history (
        commit_hash VARCHAR PRIMARY KEY,
        author VARCHAR NOT NULL,
        email VARCHAR NOT NULL,
        date TIMESTAMP NOT NULL,
        message TEXT,
        files_changed INTEGER,
        insertions INTEGER,
        deletions INTEGER,
        commit_type VARCHAR,
        branch VARCHAR,
        tags VARCHAR,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS todos (
        id VARCHAR PRIMARY KEY,
        text TEXT NOT NULL,
        type VARCHAR,
        category VARCHAR,
        file_path VARCHAR,
        line_number INTEGER,
        priority VARCHAR,
        status VARCHAR,
        assignee VARCHAR,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS analysis_cache (
        cache_key VARCHAR PRIMARY KEY,
        data JSON,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS metadata (
        key VARCHAR PRIMARY KEY,
        value JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await new Promise<void>((resolve, reject) => {
      this.db.exec(schema, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private async createIndexes(): Promise<void> {
    const indexes = [
      "CREATE INDEX IF NOT EXISTS idx_symbols_file_path ON symbols(file_path)",
      "CREATE INDEX IF NOT EXISTS idx_symbols_type ON symbols(type)",
      "CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name)",
      "CREATE INDEX IF NOT EXISTS idx_symbols_language ON symbols(language)",
      "CREATE INDEX IF NOT EXISTS idx_metrics_file_path ON metrics(file_path)",
      "CREATE INDEX IF NOT EXISTS idx_metrics_symbol_id ON metrics(symbol_id)",
      "CREATE INDEX IF NOT EXISTS idx_metrics_type_name ON metrics(metric_type, metric_name)",
      "CREATE INDEX IF NOT EXISTS idx_metrics_recorded_at ON metrics(recorded_at)",
      "CREATE INDEX IF NOT EXISTS idx_dependencies_from_file ON dependencies(from_file)",
      "CREATE INDEX IF NOT EXISTS idx_dependencies_to_file ON dependencies(to_file)",
      "CREATE INDEX IF NOT EXISTS idx_dependencies_type ON dependencies(dependency_type)",
      "CREATE INDEX IF NOT EXISTS idx_files_directory ON files(directory)",
      "CREATE INDEX IF NOT EXISTS idx_files_extension ON files(extension)",
      "CREATE INDEX IF NOT EXISTS idx_files_language ON files(language)",
      "CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status)",
      "CREATE INDEX IF NOT EXISTS idx_todos_priority ON todos(priority)",
      "CREATE INDEX IF NOT EXISTS idx_analysis_cache_expires ON analysis_cache(expires_at)"
    ];

    for (const index of indexes) {
      await new Promise<void>((resolve, reject) => {
        this.db.exec(index, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }
}