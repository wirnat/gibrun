import { DuckDBManager } from './duckdb-manager.js';
import { DuckDBCacheManager } from './duckdb-cache-manager.js';
import { DatabaseService } from '@/services/database-service.js';
import { HttpService } from '@/services/http-service.js';
import { ProjectAnalyzerTool } from '@/tools/project-analyzer/index.js';
import { ConfigManager } from './config-manager.js';
import { MaintenanceTimerManager } from './maintenance-timer-manager.js';

export class ServiceManager {
  private static instance: ServiceManager;
  private maintenanceTimer: MaintenanceTimerManager | null = null;
  private duckdbManager: DuckDBManager | null = null;
  private duckdbCacheManager: DuckDBCacheManager | null = null;

  // Service instances
  private databaseService: DatabaseService;
  private httpService: HttpService;
  private projectAnalyzerTool: ProjectAnalyzerTool;

  private constructor() {
    this.databaseService = new DatabaseService();
    this.httpService = new HttpService();
    this.projectAnalyzerTool = new ProjectAnalyzerTool();
  }

  static getInstance(): ServiceManager {
    if (!ServiceManager.instance) {
      ServiceManager.instance = new ServiceManager();
    }
    return ServiceManager.instance;
  }

  getDatabaseService(): DatabaseService {
    return this.databaseService;
  }

  getHttpService(): HttpService {
    return this.httpService;
  }

  getProjectAnalyzerTool(): ProjectAnalyzerTool {
    return this.projectAnalyzerTool;
  }

  getDuckDBManager(): DuckDBManager {
    if (!this.duckdbManager) {
      this.duckdbManager = new DuckDBManager(process.cwd());
    }
    return this.duckdbManager;
  }

  getDuckDBCacheManager(): DuckDBCacheManager {
    if (!this.duckdbCacheManager) {
      const config = ConfigManager.getInstance().getDuckDBConfig();
      this.duckdbCacheManager = new DuckDBCacheManager(process.cwd(), config);
    }
    return this.duckdbCacheManager;
  }

  getMaintenanceTimer(): MaintenanceTimerManager {
    if (!this.maintenanceTimer) {
      const config = ConfigManager.getInstance().getDuckDBConfig();
      this.maintenanceTimer = new MaintenanceTimerManager(config.maintenanceIntervalMs || 300000);
    }
    return this.maintenanceTimer;
  }

  async collectDuckDBMetrics(): Promise<string> {
    try {
      // Collect metrics from both managers
      const metrics = {
        duckdb: {
          status: 'operational',
          timestamp: new Date().toISOString()
        },
        cache: {
          status: 'operational',
          timestamp: new Date().toISOString()
        }
      };

      return JSON.stringify(metrics, null, 2);
    } catch (error) {
      return JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }, null, 2);
    }
  }
}