import { logInfo, logError } from '@/services/logger-service.js';
import { DuckDBCacheManager } from '@/core/duckdb-cache-manager.js';
import { MemoryTypeValue, RelatedMemory } from '@/types/cache.js';
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
 * Session Memory Manager - Persistent session memory for opencode integration
 */
export class SessionMemoryManager {
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
   * Store memory value
   */
  async storeMemory(
    sessionId: string,
    key: string,
    value: any,
    type: MemoryTypeValue = 'semantic',
    salience: number = 1.0,
    ttlHours?: number
  ): Promise<void> {
    const connection = this.cacheManager.getConnection();

    try {
      const expiresAt = ttlHours ?
        new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString() : null;

      await  promisifyRun(connection,`
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

      this.logger.debug('Memory stored', {
        sessionId,
        key,
        type,
        salience,
        ttlHours
      });

    } catch (error) {
      this.logger.error('Failed to store memory', error, { sessionId, key });
      throw error;
    } finally {
      connection.close();
    }
  }

  /**
   * Retrieve memory value
   */
  async retrieveMemory(sessionId: string, key: string): Promise<{
    value: any;
    salience: number;
    accessCount: number;
    type: MemoryTypeValue;
    lastAccessed: Date;
  } | null> {
    const connection = this.cacheManager.getConnection();

    try {
      const result = await  promisifyAll(connection,`
        SELECT memory_value, salience_score, access_count, memory_type, last_accessed
        FROM session_memory
        WHERE session_id = ? AND memory_key = ?
          AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
      `, [sessionId, key]);

      if (result.length === 0) return null;

      const row = result[0] as any;

      // Update access statistics
      await this.updateMemoryAccess(sessionId, key);

      return {
        value: JSON.parse(row.memory_value),
        salience: row.salience_score,
        accessCount: row.access_count + 1, // Include current access
        type: row.memory_type,
        lastAccessed: new Date(row.last_accessed)
      };

    } catch (error) {
      this.logger.error('Failed to retrieve memory', error, { sessionId, key });
      return null;
    } finally {
      connection.close();
    }
  }

  /**
   * Find related memories in session
   */
  async findRelatedMemories(sessionId: string, key: string, limit: number = 10): Promise<RelatedMemory[]> {
    const connection = this.cacheManager.getConnection();

    try {
      const result = await  promisifyAll(connection,`
        SELECT memory_key, memory_value, memory_type, salience_score
        FROM session_memory
        WHERE session_id = ?
          AND memory_key != ?
          AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
        ORDER BY salience_score DESC
        LIMIT ?
      `, [sessionId, key, limit]);

      return result.map((row: any) => ({
        key: row.memory_key,
        value: JSON.parse(row.memory_value),
        type: row.memory_type as MemoryTypeValue,
        salience: row.salience_score
      }));

    } catch (error) {
      this.logger.error('Failed to find related memories', error, { sessionId, key });
      return [];
    } finally {
      connection.close();
    }
  }

  /**
   * Update memory access statistics
   */
  private async updateMemoryAccess(sessionId: string, key: string): Promise<void> {
    const connection = this.cacheManager.getConnection();

    try {
      await  promisifyRun(connection,`
        UPDATE session_memory
        SET access_count = access_count + 1, last_accessed = CURRENT_TIMESTAMP
        WHERE session_id = ? AND memory_key = ?
      `, [sessionId, key]);

    } catch (error) {
      this.logger.error('Failed to update memory access', error, { sessionId, key });
    } finally {
      connection.close();
    }
  }

  /**
   * Get memory keys by type
   */
  async getMemoryKeysByType(sessionId: string, type: MemoryTypeValue): Promise<string[]> {
    const connection = this.cacheManager.getConnection();

    try {
      const result = await  promisifyAll(connection,`
        SELECT memory_key
        FROM session_memory
        WHERE session_id = ? AND memory_type = ?
          AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
        ORDER BY salience_score DESC, last_accessed DESC
      `, [sessionId, type]);

      return result.map((row: any) => row.memory_key);

    } catch (error) {
      this.logger.error('Failed to get memory keys by type', error, { sessionId, type });
      return [];
    } finally {
      connection.close();
    }
  }

  /**
   * Get session memory statistics
   */
  async getSessionStats(sessionId: string): Promise<{
    total_memories: number;
    by_type: Record<MemoryTypeValue, number>;
    avg_salience: number;
    total_access_count: number;
    oldest_memory: Date | null;
    newest_memory: Date | null;
  }> {
    const connection = this.cacheManager.getConnection();

    try {
      const stats = await  promisifyAll(connection,`
        SELECT
          COUNT(*) as total_memories,
          COUNT(CASE WHEN memory_type = 'semantic' THEN 1 END) as semantic_count,
          COUNT(CASE WHEN memory_type = 'episodic' THEN 1 END) as episodic_count,
          COUNT(CASE WHEN memory_type = 'procedural' THEN 1 END) as procedural_count,
          COUNT(CASE WHEN memory_type = 'emotional' THEN 1 END) as emotional_count,
          COUNT(CASE WHEN memory_type = 'reflective' THEN 1 END) as reflective_count,
          COALESCE(AVG(salience_score), 0) as avg_salience,
          COALESCE(SUM(access_count), 0) as total_access_count,
          MIN(created_at) as oldest_memory,
          MAX(created_at) as newest_memory
        FROM session_memory
        WHERE session_id = ? AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
      `, [sessionId]);

      const data = stats[0] as any;

      return {
        total_memories: data.total_memories || 0,
        by_type: {
          semantic: data.semantic_count || 0,
          episodic: data.episodic_count || 0,
          procedural: data.procedural_count || 0,
          emotional: data.emotional_count || 0,
          reflective: data.reflective_count || 0
        },
        avg_salience: data.avg_salience || 0,
        total_access_count: data.total_access_count || 0,
        oldest_memory: data.oldest_memory ? new Date(data.oldest_memory) : null,
        newest_memory: data.newest_memory ? new Date(data.newest_memory) : null
      };

    } catch (error) {
      this.logger.error('Failed to get session stats', error, { sessionId });
      return {
        total_memories: 0,
        by_type: {
          semantic: 0,
          episodic: 0,
          procedural: 0,
          emotional: 0,
          reflective: 0
        },
        avg_salience: 0,
        total_access_count: 0,
        oldest_memory: null,
        newest_memory: null
      };
    } finally {
      connection.close();
    }
  }

  /**
   * Delete memory entry
   */
  async deleteMemory(sessionId: string, key: string): Promise<boolean> {
    const connection = this.cacheManager.getConnection();

    try {
      await promisifyRun(connection, `
        DELETE FROM session_memory
        WHERE session_id = ? AND memory_key = ?
      `, [sessionId, key]);

      const deleted = true; // Assume deletion was successful

      if (deleted) {
        this.logger.debug('Memory deleted', { sessionId, key });
      }

      return deleted;

    } catch (error) {
      this.logger.error('Failed to delete memory', error, { sessionId, key });
      return false;
    } finally {
      connection.close();
    }
  }

  /**
   * Clear all memories for a session
   */
  async clearSession(sessionId: string): Promise<number> {
    const connection = this.cacheManager.getConnection();

    try {
      await promisifyRun(connection, `
        DELETE FROM session_memory
        WHERE session_id = ?
      `, [sessionId]);

      const deleted = 0; // Cannot determine affected rows in DuckDB

      if (deleted > 0) {
        this.logger.debug('Session memories cleared', { sessionId, count: deleted });
      }

      return deleted;

    } catch (error) {
      this.logger.error('Failed to clear session memories', error, { sessionId });
      return 0;
    } finally {
      connection.close();
    }
  }

  /**
   * Clear expired memories across all sessions
   */
  async clearExpiredMemories(): Promise<number> {
    const connection = this.cacheManager.getConnection();

    try {
      await promisifyRun(connection, `
        DELETE FROM session_memory
        WHERE expires_at <= CURRENT_TIMESTAMP
      `);

      const deleted = 0; // Cannot determine affected rows in DuckDB

      if (deleted > 0) {
        this.logger.debug('Expired memories cleared', { count: deleted });
      }

      return deleted;

    } catch (error) {
      this.logger.error('Failed to clear expired memories', error);
      return 0;
    } finally {
      connection.close();
    }
  }

  /**
   * Get high salience memories for context building
   */
  async getHighSalienceMemories(sessionId: string, minSalience: number = 0.8, limit: number = 20): Promise<RelatedMemory[]> {
    const connection = this.cacheManager.getConnection();

    try {
      const result = await  promisifyAll(connection,`
        SELECT memory_key, memory_value, memory_type, salience_score
        FROM session_memory
        WHERE session_id = ?
          AND salience_score >= ?
          AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
        ORDER BY salience_score DESC, last_accessed DESC
        LIMIT ?
      `, [sessionId, minSalience, limit]);

      return result.map((row: any) => ({
        key: row.memory_key,
        value: JSON.parse(row.memory_value),
        type: row.memory_type as MemoryTypeValue,
        salience: row.salience_score
      }));

    } catch (error) {
      this.logger.error('Failed to get high salience memories', error, { sessionId, minSalience });
      return [];
    } finally {
      connection.close();
    }
  }
}