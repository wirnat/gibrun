# Project Analyzer Tool - MCP Server Integration Plan

## Overview

This document outlines the integration strategy for incorporating the Project Analyzer tool into the gibRun MCP Server. The integration ensures seamless operation within the MCP protocol while maintaining compatibility with AI assistants and development workflows.

## Integration Architecture

### MCP Tool Registration
```typescript
// src/tools/project-analyzer/index.ts - gibRun MCP Server Integration
import { ProjectAnalysisEngine } from './engine';
import { ArchitectureAnalyzer } from './analyzers/architecture';
import { QualityAnalyzer } from './analyzers/quality';
import { DependencyAnalyzer } from './analyzers/dependencies';
import { MetricsAnalyzer } from './analyzers/metrics';
import { HealthAnalyzer } from './analyzers/health';
import { InsightsAnalyzer } from './analyzers/insights';
import { MCPTool, Tool } from '../../core/server-types'; // gibRun types

export class ProjectAnalyzerTool implements MCPTool {
  private engine: ProjectAnalysisEngine;

  constructor() {
    this.engine = new ProjectAnalysisEngine();
    this.registerAnalyzers();
  }

  private registerAnalyzers(): void {
    this.engine.registerAnalyzer('architecture', new ArchitectureAnalyzer());
    this.engine.registerAnalyzer('quality', new QualityAnalyzer());
    this.engine.registerAnalyzer('dependencies', new DependencyAnalyzer());
    this.engine.registerAnalyzer('metrics', new MetricsAnalyzer());
    this.engine.registerAnalyzer('health', new HealthAnalyzer());
    this.engine.registerAnalyzer('insights', new InsightsAnalyzer());
  }

  getTools(): Tool[] {
    return [
      {
        name: 'project_analyzer/architecture',
        description: 'Analyze project architecture patterns and structural health',
        inputSchema: {
          type: 'object',
          properties: {
            operation: { type: 'string', enum: ['architecture'], default: 'architecture' },
            scope: { type: 'string', enum: ['full', 'incremental', 'module'], default: 'full' },
            target_modules: { type: 'array', items: { type: 'string' } },
            include_historical: { type: 'boolean', default: false },
            output_format: { type: 'string', enum: ['summary', 'detailed', 'json'], default: 'summary' }
          },
          required: []
        }
      },
      {
        name: 'project_analyzer/quality',
        description: 'Comprehensive code quality assessment with multiple metrics',
        inputSchema: {
          type: 'object',
          properties: {
            operation: { type: 'string', enum: ['quality'], default: 'quality' },
            scope: { type: 'string', enum: ['full', 'incremental', 'module'], default: 'full' },
            target_modules: { type: 'array', items: { type: 'string' } },
            quality_checks: {
              type: 'object',
              properties: {
                complexity: { type: 'boolean', default: true },
                duplication: { type: 'boolean', default: true },
                coverage: { type: 'boolean', default: true }
              }
            },
            output_format: { type: 'string', enum: ['summary', 'detailed', 'json'], default: 'summary' }
          },
          required: []
        }
      },
      {
        name: 'project_analyzer/dependencies',
        description: 'Deep dependency analysis including security and compatibility',
        inputSchema: {
          type: 'object',
          properties: {
            operation: { type: 'string', enum: ['dependencies'], default: 'dependencies' },
            scope: { type: 'string', enum: ['full', 'incremental'], default: 'full' },
            analysis_types: {
              type: 'array',
              items: { type: 'string', enum: ['runtime', 'dev', 'peer', 'transitive'] },
              default: ['runtime', 'dev']
            },
            security_scan: { type: 'boolean', default: true },
            license_check: { type: 'boolean', default: true },
            output_format: { type: 'string', enum: ['summary', 'detailed', 'json'], default: 'summary' }
          },
          required: []
        }
      },
      {
        name: 'project_analyzer/metrics',
        description: 'Development productivity and velocity metrics',
        inputSchema: {
          type: 'object',
          properties: {
            operation: { type: 'string', enum: ['metrics'], default: 'metrics' },
            time_range: {
              type: 'object',
              properties: {
                start: { type: 'string', format: 'date' },
                end: { type: 'string', format: 'date' }
              }
            },
            metrics: {
              type: 'array',
              items: { type: 'string', enum: ['velocity', 'quality', 'productivity', 'stability'] },
              default: ['velocity', 'quality']
            },
            granularity: { type: 'string', enum: ['daily', 'weekly', 'monthly'], default: 'weekly' },
            output_format: { type: 'string', enum: ['summary', 'detailed', 'json'], default: 'summary' }
          },
          required: []
        }
      },
      {
        name: 'project_analyzer/health',
        description: 'Overall project health assessment with improvement roadmap',
        inputSchema: {
          type: 'object',
          properties: {
            operation: { type: 'string', enum: ['health'], default: 'health' },
            scope: { type: 'string', enum: ['full', 'incremental'], default: 'full' },
            include_historical: { type: 'boolean', default: true },
            benchmark_against: { type: 'string', enum: ['industry_average', 'similar_projects'], default: 'industry_average' },
            generate_roadmap: { type: 'boolean', default: true },
            output_format: { type: 'string', enum: ['summary', 'detailed', 'json'], default: 'summary' }
          },
          required: []
        }
      },
      {
        name: 'project_analyzer/insights',
        description: 'AI-powered insights and personalized recommendations',
        inputSchema: {
          type: 'object',
          properties: {
            operation: { type: 'string', enum: ['insights'], default: 'insights' },
            insight_types: {
              type: 'array',
              items: { type: 'string', enum: ['patterns', 'anomalies', 'predictions', 'recommendations'] },
              default: ['patterns', 'recommendations']
            },
            context: {
              type: 'object',
              properties: {
                team_size: { type: 'number' },
                project_age_months: { type: 'number' },
                technology_stack: { type: 'array', items: { type: 'string' } },
                development_methodology: { type: 'string', enum: ['agile', 'waterfall', 'kanban'] }
              }
            },
            output_format: { type: 'string', enum: ['summary', 'detailed', 'json'], default: 'summary' }
          },
          required: []
        }
      }
    ];
  }

  async executeTool(name: string, args: any): Promise<ToolResponse> {
    try {
      const operation = name.split('/')[1];
      const result = await this.engine.analyze(operation, args);

      return {
        content: [{
          type: 'text',
          text: this.formatResult(result, args.output_format || 'summary')
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: error.message,
            operation: name,
            timestamp: new Date().toISOString()
          }, null, 2)
        }],
        isError: true
      };
    }
  }

  private formatResult(result: AnalysisResult, format: string): string {
    switch (format) {
      case 'json':
        return JSON.stringify(result, null, 2);
      case 'detailed':
        return this.formatDetailed(result);
      case 'summary':
      default:
        return this.formatSummary(result);
    }
  }

  private formatSummary(result: AnalysisResult): string {
    // Implementation for concise summary format
    return `Analysis completed successfully. Key findings: ${result.summary}`;
  }

  private formatDetailed(result: AnalysisResult): string {
    // Implementation for detailed format with all metrics
    return JSON.stringify(result, null, 2);
  }
}
```

### Server Integration
```typescript
// src/core/server.ts - gibRun Server Integration Point
import { ProjectAnalyzerTool } from '../tools/project-analyzer';
import { DatabaseService } from '../services/database-service'; // Leverage existing gibRun services
import { LoggerService } from '../services/logger-service';

export class GibRunServer {
  private tools: Map<string, MCPTool> = new Map();
  private databaseService: DatabaseService;
  private loggerService: LoggerService;

  constructor() {
    this.databaseService = new DatabaseService();
    this.loggerService = new LoggerService();
  }

  async initialize(): Promise<void> {
    // Register existing gibRun tools (database, http, dap, etc.)

    // Register Project Analyzer
    const projectAnalyzer = new ProjectAnalyzerTool();
    this.registerTool('project_analyzer', projectAnalyzer);

    // Initialize analysis cache and background services
    await this.initializeAnalysisServices();
  }

  private async initializeAnalysisServices(): Promise<void> {
    // Start background analysis scheduler
    // Initialize cache persistence using gibRun's database service
    // Setup analysis result storage with existing logger
    await this.databaseService.initialize();
  }

  private registerTool(prefix: string, tool: MCPTool): void {
    const toolDefinitions = tool.getTools();
    toolDefinitions.forEach(toolDef => {
      this.tools.set(toolDef.name, tool);
    });
  }

  async handleToolCall(request: ToolCallRequest): Promise<ToolResponse> {
    const tool = this.tools.get(request.name);
    if (!tool) {
      throw new Error(`Tool ${request.name} not found`);
    }

    return await tool.executeTool(request.name, request.arguments);
  }
}
```

## AI Assistant Compatibility

### Claude Desktop Integration
```json
// claude_desktop_config.json
{
  "mcpServers": {
    "gib-run": {
      "command": "node",
      "args": ["build/index.js"],
      "env": {
        "NODE_ENV": "production",
        "ANALYSIS_CACHE_DIR": "~/.cache/gib-run/analysis",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

### Cursor Integration
```json
// .cursorrules or cursor-config.json
{
  "mcp": {
    "servers": {
      "gib-run": {
        "command": "node",
        "args": ["build/index.js"],
        "env": {
          "ANALYSIS_CACHE_DIR": "./.cursor/cache/analysis",
          "ENABLE_REAL_TIME_ANALYSIS": "true"
        }
      }
    }
  },
  "projectAnalysis": {
    "autoAnalyze": true,
    "analysisTriggers": ["file_save", "git_commit"],
    "showInStatusBar": true,
    "integrateWithLSP": true
  }
}
```

### VS Code Extension Integration
```typescript
// vscode-extension/src/projectAnalyzer.ts
export class VSCodeProjectAnalyzer {
  private mcpClient: MCPClient;
  private statusBarItem: StatusBarItem;
  private analysisResults: Map<string, AnalysisResult> = new Map();

  async activate(context: ExtensionContext): Promise<void> {
    this.mcpClient = new MCPClient();
    await this.mcpClient.connect({
      command: 'node',
      args: [context.extensionPath + '/server/build/index.js']
    });

    this.initializeStatusBar();
    this.registerCommands();
    this.setupFileWatchers();
  }

  private initializeStatusBar(): void {
    this.statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right, 100);
    this.statusBarItem.command = 'gibRun.showHealthOverview';
    this.statusBarItem.text = '$(graph) Analyzing...';
    this.statusBarItem.show();

    // Update status bar with health score
    this.updateHealthStatus();
  }

  private async updateHealthStatus(): Promise<void> {
    try {
      const result = await this.mcpClient.callTool('project_analyzer/health', {
        scope: 'full',
        output_format: 'summary'
      });

      const healthScore = this.extractHealthScore(result);
      this.statusBarItem.text = `$(graph) Health: ${healthScore}/10`;
      this.statusBarItem.tooltip = result.content[0].text;
    } catch (error) {
      this.statusBarItem.text = '$(warning) Analysis Error';
    }
  }

  private registerCommands(): void {
    commands.registerCommand('gibRun.analyzeArchitecture', async () => {
      const result = await this.runAnalysis('architecture');
      this.displayResults('Architecture Analysis', result);
    });

    commands.registerCommand('gibRun.analyzeQuality', async () => {
      const result = await this.runAnalysis('quality');
      this.displayResults('Code Quality Analysis', result);
    });

    commands.registerCommand('gibRun.showHealthOverview', async () => {
      const result = await this.runAnalysis('health');
      this.showHealthDashboard(result);
    });

    commands.registerCommand('gibRun.generateInsights', async () => {
      const result = await this.runAnalysis('insights');
      this.displayInsights(result);
    });
  }

  private async runAnalysis(operation: string): Promise<AnalysisResult> {
    const workspaceFolder = workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error('No workspace folder open');
    }

    const result = await this.mcpClient.callTool(`project_analyzer/${operation}`, {
      scope: 'full',
      target_modules: [workspaceFolder.uri.fsPath],
      output_format: 'detailed'
    });

    return JSON.parse(result.content[0].text);
  }

  private displayResults(title: string, result: AnalysisResult): void {
    const panel = window.createWebviewPanel(
      'gibRun.analysis',
      title,
      ViewColumn.One,
      {}
    );

    panel.webview.html = this.generateResultsHtml(title, result);
  }

  private showHealthDashboard(result: AnalysisResult): void {
    const panel = window.createWebviewPanel(
      'gibRun.health',
      'Project Health Dashboard',
      ViewColumn.One,
      { enableScripts: true }
    );

    panel.webview.html = this.generateHealthDashboardHtml(result);
  }

  private displayInsights(result: AnalysisResult): void {
    // Show insights in a specialized view
    const insights = result.insights || {};
    const recommendations = insights.recommendations || [];

    const quickPick = window.createQuickPick();
    quickPick.items = recommendations.map(rec => ({
      label: rec.title,
      description: rec.priority,
      detail: rec.description
    }));

    quickPick.onDidAccept(() => {
      const selected = quickPick.selectedItems[0];
      if (selected) {
        this.showRecommendationDetails(selected);
      }
    });

    quickPick.show();
  }

  private setupFileWatchers(): void {
    const watcher = workspace.createFileSystemWatcher('**/*.{ts,js,tsx,jsx}');

    watcher.onDidChange(async (uri) => {
      // Trigger incremental analysis
      await this.runIncrementalAnalysis(uri);
    });

    watcher.onDidCreate(async (uri) => {
      // Update analysis cache
      await this.invalidateAnalysisCache(uri);
    });

    watcher.onDidDelete(async (uri) => {
      // Clean up analysis data
      await this.removeFromAnalysisCache(uri);
    });
  }

  private async runIncrementalAnalysis(uri: Uri): Promise<void> {
    try {
      const result = await this.mcpClient.callTool('project_analyzer/quality', {
        scope: 'incremental',
        target_modules: [uri.fsPath],
        output_format: 'summary'
      });

      // Update status bar or show notification
      window.showInformationMessage(`Incremental analysis completed: ${result.content[0].text}`);
    } catch (error) {
      console.error('Incremental analysis failed:', error);
    }
  }
}
```

## CI/CD Integration

### GitHub Actions Integration
```yaml
# .github/workflows/project-analysis.yml
name: Project Analysis
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 9 * * 1'  # Weekly analysis

jobs:
  analyze:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      checks: write

    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full git history for metrics

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'yarn'

      - name: Install dependencies
        run: yarn install

      - name: Run Project Analysis
        id: analysis
        run: |
          # Run analysis and capture results
          node scripts/run-analysis.js --operation=health --output=json > analysis-results.json
          node scripts/run-analysis.js --operation=quality --output=json > quality-results.json

      - name: Upload Analysis Results
        uses: actions/upload-artifact@v3
        with:
          name: project-analysis-${{ github.run_id }}
          path: |
            analysis-results.json
            quality-results.json

      - name: Comment PR with Analysis Results
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const analysisResults = JSON.parse(fs.readFileSync('analysis-results.json', 'utf8'));
            const qualityResults = JSON.parse(fs.readFileSync('quality-results.json', 'utf8'));

            const comment = generateAnalysisComment(analysisResults, qualityResults);

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: comment
            });

      - name: Update Project Health Badge
        run: |
          # Generate health score and update badge
          node scripts/generate-health-badge.js

      - name: Fail on Critical Issues
        run: |
          # Check for critical analysis results
          node scripts/check-analysis-thresholds.js --fail-on-critical

  security-scan:
    runs-on: ubuntu-latest
    needs: analyze

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Run Security Analysis
        run: |
          node scripts/run-analysis.js --operation=dependencies --security-scan=true --output=json > security-results.json

      - name: Upload Security Results
        uses: actions/upload-artifact@v3
        with:
          name: security-analysis-${{ github.run_id }}
          path: security-results.json

      - name: Create Security Issue
        if: failure()
        uses: actions/github-script@v7
        with:
          script: |
            const securityResults = JSON.parse(fs.readFileSync('security-results.json', 'utf8'));

            if (securityResults.vulnerabilities?.critical?.length > 0) {
              github.rest.issues.create({
                title: '🚨 Critical Security Vulnerabilities Detected',
                body: generateSecurityIssueBody(securityResults),
                labels: ['security', 'critical']
              });
            }
```

### Analysis Result Storage
```typescript
// scripts/store-analysis-results.js
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');

async function storeAnalysisResults() {
  const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1'
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const results = {
    health: JSON.parse(fs.readFileSync('analysis-results.json', 'utf8')),
    quality: JSON.parse(fs.readFileSync('quality-results.json', 'analysis-results.json', 'utf8')),
    dependencies: JSON.parse(fs.readFileSync('security-results.json', 'utf8')),
    metadata: {
      repository: process.env.GITHUB_REPOSITORY,
      branch: process.env.GITHUB_REF_NAME,
      commit: process.env.GITHUB_SHA,
      timestamp: new Date().toISOString(),
      ci_run: process.env.GITHUB_RUN_ID
    }
  };

  const key = `analysis-results/${process.env.GITHUB_REPOSITORY}/${timestamp}.json`;

  await s3Client.send(new PutObjectCommand({
    Bucket: process.env.ANALYSIS_RESULTS_BUCKET,
    Key: key,
    Body: JSON.stringify(results, null, 2),
    ContentType: 'application/json'
  }));

  console.log(`Analysis results stored: s3://${process.env.ANALYSIS_RESULTS_BUCKET}/${key}`);
}

storeAnalysisResults().catch(console.error);
```

## Development Workflow Integration

### Pre-commit Hooks
```bash
#!/bin/bash
# .git/hooks/pre-commit

# Run quick analysis before commit
echo "Running pre-commit analysis..."

# Run quality analysis on staged files
node scripts/run-analysis.js --operation=quality --scope=incremental --staged-only --output=summary

if [ $? -ne 0 ]; then
  echo "❌ Code quality issues found. Please fix before committing."
  exit 1
fi

echo "✅ Pre-commit analysis passed"
```

### IDE Integration Scripts
```typescript
// scripts/ide-integration.js
const { exec } = require('child_process');
const fs = require('fs');

class IDEIntegrationManager {
  async setupVSCodeIntegration(): Promise<void> {
    const vscodeConfig = {
      "recommendations": ["gib-run.project-analyzer"],
      "settings": {
        "projectAnalyzer.autoAnalyze": true,
        "projectAnalyzer.showInStatusBar": true,
        "projectAnalyzer.analysisTriggers": ["file_save", "git_commit"]
      }
    };

    fs.writeFileSync('.vscode/extensions.json', JSON.stringify({
      recommendations: ["gib-run.project-analyzer"]
    }, null, 2));

    fs.writeFileSync('.vscode/settings.json', JSON.stringify(vscodeConfig.settings, null, 2));
  }

  async setupCursorIntegration(): Promise<void> {
    const cursorConfig = {
      mcp: {
        servers: {
          "gib-run": {
            command: "node",
            args: ["./node_modules/.bin/gib-run"],
            env: {
              ANALYSIS_CACHE_DIR: "./.cursor/cache/analysis"
            }
          }
        }
      },
      projectAnalysis: {
        autoAnalyze: true,
        realTimeUpdates: true,
        showHealthInStatusBar: true
      }
    };

    fs.writeFileSync('.cursorrules', JSON.stringify(cursorConfig, null, 2));
  }

  async setupClaudeIntegration(): Promise<void> {
    const claudeConfig = {
      mcpServers: {
        "gib-run": {
          command: "node",
          args: ["./node_modules/.bin/gib-run"],
          env: {
            NODE_ENV: "production"
          }
        }
      }
    };

    fs.writeFileSync('claude_desktop_config.json', JSON.stringify(claudeConfig, null, 2));
  }
}
```

## Performance & Scalability

### Caching Strategy
```typescript
// src/tools/project-analyzer/cache/analysis-cache.ts
export class AnalysisCache {
  private cache: Map<string, CachedAnalysis> = new Map();
  private persistentStorage: PersistentCache;
  private maxMemoryCacheSize = 100; // MB
  private maxDiskCacheSize = 1024; // MB

  constructor() {
    this.persistentStorage = new FileBasedCache('./.cache/analysis');
    this.loadPersistentCache();
  }

  async get(key: string): Promise<AnalysisResult | null> {
    // Check memory cache first
    const memoryCached = this.cache.get(key);
    if (memoryCached && this.isValid(memoryCached)) {
      return memoryCached.result;
    }

    // Check persistent cache
    const persistentCached = await this.persistentStorage.get(key);
    if (persistentCached && this.isValid(persistentCached)) {
      // Promote to memory cache
      this.cache.set(key, persistentCached);
      return persistentCached.result;
    }

    return null;
  }

  async set(key: string, result: AnalysisResult): Promise<void> {
    const cached: CachedAnalysis = {
      key,
      result,
      timestamp: Date.now(),
      ttl: this.calculateTTL(result),
      metadata: this.extractMetadata(result)
    };

    // Store in memory
    this.cache.set(key, cached);

    // Store persistently
    await this.persistentStorage.set(key, cached);

    // Cleanup if needed
    this.cleanup();
  }

  private calculateTTL(result: AnalysisResult): number {
    // Different TTL based on analysis type and result stability
    const baseTTL = 30 * 60 * 1000; // 30 minutes

    switch (result.operation) {
      case 'architecture': return baseTTL * 2; // 1 hour
      case 'quality': return baseTTL; // 30 minutes
      case 'dependencies': return baseTTL * 0.5; // 15 minutes
      case 'metrics': return baseTTL * 0.33; // 10 minutes
      default: return baseTTL;
    }
  }

  private cleanup(): void {
    // Remove expired entries
    const now = Date.now();
    for (const [key, cached] of this.cache.entries()) {
      if (now - cached.timestamp > cached.ttl) {
        this.cache.delete(key);
      }
    }

    // Limit memory cache size
    if (this.getMemoryUsage() > this.maxMemoryCacheSize) {
      this.evictLeastRecentlyUsed();
    }
  }

  private evictLeastRecentlyUsed(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, cached] of this.cache.entries()) {
      if (cached.timestamp < oldestTime) {
        oldestTime = cached.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  private getMemoryUsage(): number {
    // Estimate memory usage of cache
    let totalSize = 0;
    for (const cached of this.cache.values()) {
      totalSize += JSON.stringify(cached).length;
    }
    return totalSize / 1024 / 1024; // MB
  }
}
```

### Background Processing
```typescript
// src/tools/project-analyzer/scheduler/analysis-scheduler.ts
export class AnalysisScheduler {
  private queue: AnalysisJob[] = [];
  private workers: Worker[] = [];
  private maxConcurrentJobs = 3;

  constructor() {
    this.initializeWorkers();
    this.startProcessing();
  }

  async scheduleAnalysis(job: AnalysisJob): Promise<AnalysisJobId> {
    const jobId = this.generateJobId();
    const scheduledJob: ScheduledAnalysisJob = {
      ...job,
      id: jobId,
      status: 'queued',
      createdAt: new Date(),
      priority: job.priority || 'normal'
    };

    this.queue.push(scheduledJob);
    this.sortQueueByPriority();

    return jobId;
  }

  async getJobStatus(jobId: AnalysisJobId): Promise<JobStatus> {
    const job = this.queue.find(j => j.id === jobId) ||
                this.completedJobs.find(j => j.id === jobId);

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    return {
      id: job.id,
      status: job.status,
      progress: job.progress,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      result: job.result
    };
  }

  private initializeWorkers(): void {
    for (let i = 0; i < this.maxConcurrentJobs; i++) {
      const worker = new Worker('./analysis-worker.js');
      worker.on('message', (result) => this.handleWorkerResult(result));
      worker.on('error', (error) => this.handleWorkerError(error));
      this.workers.push(worker);
    }
  }

  private startProcessing(): void {
    setInterval(() => {
      this.processQueue();
    }, 1000); // Check queue every second
  }

  private processQueue(): void {
    const availableWorkers = this.workers.filter(w => !w.isBusy);

    for (const worker of availableWorkers) {
      const job = this.queue.shift();
      if (job) {
        this.assignJobToWorker(job, worker);
      }
    }
  }

  private assignJobToWorker(job: ScheduledAnalysisJob, worker: Worker): void {
    job.status = 'running';
    job.startedAt = new Date();
    worker.isBusy = true;

    worker.postMessage({
      jobId: job.id,
      operation: job.operation,
      config: job.config
    });
  }

  private handleWorkerResult(result: WorkerResult): void {
    const job = this.queue.find(j => j.id === result.jobId);
    if (job) {
      job.status = 'completed';
      job.completedAt = new Date();
      job.result = result.data;

      // Mark worker as available
      const worker = this.workers.find(w => w.currentJobId === result.jobId);
      if (worker) {
        worker.isBusy = false;
        worker.currentJobId = null;
      }

      // Notify subscribers
      this.notifyJobCompletion(job);
    }
  }

  private sortQueueByPriority(): void {
    this.queue.sort((a, b) => {
      const priorityOrder = { urgent: 3, high: 2, normal: 1, low: 0 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }
}
```

## Monitoring & Observability

### Analysis Metrics Collection
```typescript
// src/tools/project-analyzer/monitoring/metrics-collector.ts
export class AnalysisMetricsCollector {
  private metrics: Map<string, AnalysisMetric[]> = new Map();

  recordAnalysisStart(operation: string, config: AnalysisConfig): AnalysisId {
    const analysisId = this.generateAnalysisId();
    const metric: AnalysisMetric = {
      id: analysisId,
      operation,
      startTime: new Date(),
      config: this.sanitizeConfig(config),
      status: 'running'
    };

    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, []);
    }
    this.metrics.get(operation)!.push(metric);

    return analysisId;
  }

  recordAnalysisComplete(analysisId: AnalysisId, result: AnalysisResult): void {
    const metric = this.findMetricById(analysisId);
    if (metric) {
      metric.endTime = new Date();
      metric.duration = metric.endTime.getTime() - metric.startTime.getTime();
      metric.status = 'completed';
      metric.result = {
        success: result.success,
        filesAnalyzed: result.files_analyzed,
        dataSize: JSON.stringify(result).length
      };
    }
  }

  recordAnalysisError(analysisId: AnalysisId, error: Error): void {
    const metric = this.findMetricById(analysisId);
    if (metric) {
      metric.endTime = new Date();
      metric.duration = metric.endTime.getTime() - metric.startTime.getTime();
      metric.status = 'error';
      metric.error = {
        message: error.message,
        type: error.constructor.name
      };
    }
  }

  getMetrics(operation?: string, timeRange?: TimeRange): AnalysisMetric[] {
    let allMetrics: AnalysisMetric[] = [];

    if (operation) {
      allMetrics = this.metrics.get(operation) || [];
    } else {
      for (const metrics of this.metrics.values()) {
        allMetrics.push(...metrics);
      }
    }

    if (timeRange) {
      allMetrics = allMetrics.filter(metric =>
        metric.startTime >= timeRange.start && metric.startTime <= timeRange.end
      );
    }

    return allMetrics;
  }

  getPerformanceStats(operation: string): PerformanceStats {
    const metrics = this.getMetrics(operation);
    const completedMetrics = metrics.filter(m => m.status === 'completed');

    if (completedMetrics.length === 0) {
      return { operation, sampleSize: 0 };
    }

    const durations = completedMetrics.map(m => m.duration!);
    const filesAnalyzed = completedMetrics.map(m => m.result!.filesAnalyzed);

    return {
      operation,
      sampleSize: completedMetrics.length,
      averageDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      medianDuration: this.calculateMedian(durations),
      p95Duration: this.calculatePercentile(durations, 95),
      averageFilesAnalyzed: filesAnalyzed.reduce((a, b) => a + b, 0) / filesAnalyzed.length,
      successRate: completedMetrics.length / metrics.length,
      lastUpdated: new Date()
    };
  }

  private findMetricById(analysisId: AnalysisId): AnalysisMetric | null {
    for (const metrics of this.metrics.values()) {
      const metric = metrics.find(m => m.id === analysisId);
      if (metric) return metric;
    }
    return null;
  }

  private sanitizeConfig(config: AnalysisConfig): any {
    // Remove sensitive information from config before storing
    const sanitized = { ...config };
    // Remove or mask sensitive fields
    return sanitized;
  }

  private calculateMedian(values: number[]): number {
    const sorted = values.sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  private calculatePercentile(values: number[], percentile: number): number {
    const sorted = values.sort((a, b) => a - b);
    const index = (percentile / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index % 1;

    if (upper >= sorted.length) return sorted[sorted.length - 1];
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }
}
```

## Conclusion

This integration plan provides a comprehensive strategy for incorporating the Project Analyzer tool into the gibRun MCP Server ecosystem. The plan covers:

- **MCP Protocol Integration**: Proper tool registration and response formatting
- **AI Assistant Compatibility**: Support for Claude Desktop, Cursor, and VS Code
- **CI/CD Integration**: Automated analysis in development pipelines
- **Performance & Scalability**: Caching, background processing, and resource management
- **Monitoring & Observability**: Metrics collection and performance tracking

The integration ensures the Project Analyzer tool provides maximum value to development teams while maintaining compatibility with existing workflows and tools. The modular architecture allows for incremental deployment and easy maintenance of the analysis capabilities.</content>
<parameter name="filePath">./doc/project_analyzer_integration_plan.md