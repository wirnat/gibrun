import Database from 'duckdb';
import { FileInfo } from './duckdb-manager.js';
import { promisifyRun, promisifyAll, promisifyGet } from '@/utils/duckdb-promisify.js';

interface LoggerService {
  info(message: string, meta?: any): void;
  error(message: string, error?: any, meta?: any): void;
  debug(message: string, meta?: any): void;
}

export class FileOperationsManager {
  constructor(
    private db: Database.Database,
    private logger: LoggerService
  ) {}

  private getConnection(): Database.Connection {
    return this.db.connect();
  }

  async upsertFile(fileInfo: FileInfo): Promise<void> {
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
        fileInfo.is_binary ? 1 : 0
      ]);

      this.logger.debug('File information upserted', { filePath: fileInfo.file_path });
    } finally {
      connection.close();
    }
  }

  async batchUpsertFiles(files: FileInfo[]): Promise<void> {
    if (files.length === 0) return;

    const query = `
      INSERT OR REPLACE INTO files
      (file_path, file_name, directory, extension, language, size_bytes, lines_count, last_modified, checksum, is_binary, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;

    const stmt = this.db.prepare(query);

    try {
      for (const file of files) {
        await new Promise<void>((resolve, reject) => {
          stmt.run([
            file.file_path,
            file.file_name,
            file.directory,
            file.extension,
            file.language,
            file.size_bytes,
            file.lines_count,
            file.last_modified,
            file.checksum,
            file.is_binary
          ], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }

      this.logger.info(`Batch upserted ${files.length} files`);
    } finally {
      stmt.finalize();
    }
  }

  async fileExists(filePath: string): Promise<boolean> {
    const query = 'SELECT 1 FROM files WHERE file_path = ? LIMIT 1';

    try {
      const row = await promisifyGet(this.db, query, [filePath]);
      return !!row;
    } catch (err) {
      this.logger.error('Failed to check file existence', err);
      throw err;
    }
  }

  async getFilesByDirectory(directory: string): Promise<FileInfo[]> {
    const query = 'SELECT * FROM files WHERE directory = ? ORDER BY file_name';

    return new Promise<FileInfo[]>((resolve, reject) => {
      this.db.all(query, [directory], (err, rows) => {
        if (err) {
          this.logger.error('Failed to get files by directory', err);
          reject(err);
        } else {
          resolve(rows as FileInfo[]);
        }
      });
    });
  }

  async getFilesByLanguage(language: string): Promise<FileInfo[]> {
    const query = 'SELECT * FROM files WHERE language = ? ORDER BY file_path';

    return new Promise<FileInfo[]>((resolve, reject) => {
      this.db.all(query, [language], (err, rows) => {
        if (err) {
          this.logger.error('Failed to get files by language', err);
          reject(err);
        } else {
          resolve(rows as FileInfo[]);
        }
      });
    });
  }

  async deleteFile(filePath: string): Promise<void> {
    const query = 'DELETE FROM files WHERE file_path = ?';

    await new Promise<void>((resolve, reject) => {
      this.db.run(query, [filePath], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async getFileStats(): Promise<{ totalFiles: number; totalSize: number; languages: { [key: string]: number } }> {
    const statsQuery = `
      SELECT
        COUNT(*) as total_files,
        SUM(size_bytes) as total_size
      FROM files
    `;

    const languageQuery = `
      SELECT language, COUNT(*) as count
      FROM files
      WHERE language IS NOT NULL
      GROUP BY language
      ORDER BY count DESC
    `;

    const [statsResult, languageResult] = await Promise.all([
      new Promise<any>((resolve, reject) => {
        this.db.get(statsQuery, (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      }),
      new Promise<any[]>((resolve, reject) => {
        this.db.all(languageQuery, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      })
    ]);

    const languages: { [key: string]: number } = {};
    languageResult.forEach(row => {
      languages[row.language] = row.count;
    });

    return {
      totalFiles: statsResult.total_files || 0,
      totalSize: statsResult.total_size || 0,
      languages
    };
  }
}