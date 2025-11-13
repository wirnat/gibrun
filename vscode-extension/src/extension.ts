import * as vscode from 'vscode';
import { MCPClient } from './mcp/MCPClient';
import { LSPBridge } from './lsp/LSPBridge';
import { DiagnosticsProvider } from './providers/DiagnosticsProvider';
import { AnalysisViewProvider } from './providers/AnalysisViewProvider';
import { StatusBarManager } from './ui/StatusBarManager';

let mcpClient: MCPClient;
let lspBridge: LSPBridge;
let diagnosticsProvider: DiagnosticsProvider;
let analysisViewProvider: AnalysisViewProvider;
let statusBarManager: StatusBarManager;

export async function activate(context: vscode.ExtensionContext) {
  console.log('GibRun Project Analyzer extension is now active!');

  try {
    // Initialize MCP client
    mcpClient = new MCPClient();
    await mcpClient.connect();

    // Initialize LSP bridge
    lspBridge = new LSPBridge(mcpClient);

    // Initialize diagnostics provider
    diagnosticsProvider = new DiagnosticsProvider(mcpClient, context);
    diagnosticsProvider.register();

    // Initialize analysis view provider
    analysisViewProvider = new AnalysisViewProvider(mcpClient, context);
    context.subscriptions.push(
      vscode.window.registerTreeDataProvider('gibrunAnalysisView', analysisViewProvider)
    );

    // Initialize status bar manager
    statusBarManager = new StatusBarManager(mcpClient);
    statusBarManager.register();

    // Register commands
    context.subscriptions.push(
      vscode.commands.registerCommand('gibrun.analyzeProject', async () => {
        await analyzeProject();
      }),

      vscode.commands.registerCommand('gibrun.showHealthDashboard', async () => {
        await showHealthDashboard();
      }),

      vscode.commands.registerCommand('gibrun.refreshAnalysis', async () => {
        await refreshAnalysis();
      })
    );

    // Set context for when analysis is available
    vscode.commands.executeCommand('setContext', 'gibrun.analysisAvailable', true);

    // Setup file watchers for incremental analysis
    setupFileWatchers(context);

    console.log('GibRun Project Analyzer extension activated successfully');

  } catch (error) {
    console.error('Failed to activate GibRun extension:', error);
    vscode.window.showErrorMessage(`Failed to activate GibRun extension: ${error}`);
  }
}

export function deactivate() {
  console.log('GibRun Project Analyzer extension is deactivating...');

  if (mcpClient) {
    mcpClient.disconnect();
  }

  if (statusBarManager) {
    statusBarManager.dispose();
  }

  console.log('GibRun Project Analyzer extension deactivated');
}

async function analyzeProject(): Promise<void> {
  try {
    vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Analyzing Project...',
      cancellable: false
    }, async (progress) => {
      progress.report({ increment: 0, message: 'Initializing analysis...' });

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder found');
        return;
      }

      progress.report({ increment: 20, message: 'Running architecture analysis...' });
      await mcpClient.executeTool('project_analyzer/architecture', {
        operation: 'architecture',
        scope: 'full'
      });

      progress.report({ increment: 40, message: 'Running quality analysis...' });
      await mcpClient.executeTool('project_analyzer/quality', {
        operation: 'quality',
        scope: 'full'
      });

      progress.report({ increment: 60, message: 'Running dependency analysis...' });
      await mcpClient.executeTool('project_analyzer/dependencies', {
        operation: 'dependencies',
        scope: 'full'
      });

      progress.report({ increment: 80, message: 'Running metrics analysis...' });
      await mcpClient.executeTool('project_analyzer/metrics', {
        operation: 'metrics',
        scope: 'full'
      });

      progress.report({ increment: 90, message: 'Running health assessment...' });
      await mcpClient.executeTool('project_analyzer/health', {
        operation: 'health',
        scope: 'full'
      });

      progress.report({ increment: 95, message: 'Generating insights...' });
      await mcpClient.executeTool('project_analyzer/insights', {
        operation: 'insights',
        scope: 'full'
      });

      progress.report({ increment: 100, message: 'Analysis complete!' });

      // Refresh all views
      await Promise.all([
        diagnosticsProvider.refresh(),
        analysisViewProvider.refresh(),
        statusBarManager.refresh()
      ]);

      vscode.window.showInformationMessage('Project analysis completed successfully!');
    });
  } catch (error) {
    console.error('Analysis failed:', error);
    vscode.window.showErrorMessage(`Analysis failed: ${error}`);
  }
}

async function showHealthDashboard(): Promise<void> {
  // Open analysis view
  await vscode.commands.executeCommand('gibrunAnalysisView.focus');

  // Show health summary in information message
  const healthData = await mcpClient.executeTool('project_analyzer/health', {
    operation: 'health',
    scope: 'full'
  });

  if (healthData?.data?.overall_health_score !== undefined) {
    const score = healthData.data.overall_health_score;
    const grade = healthData.data.dimensions?.code_quality ? 'Good' : 'Needs Attention';

    vscode.window.showInformationMessage(
      `Project Health: ${score}/100 (${grade})`,
      'View Details'
    ).then(selection => {
      if (selection === 'View Details') {
        vscode.commands.executeCommand('gibrunAnalysisView.focus');
      }
    });
  }
}

async function refreshAnalysis(): Promise<void> {
  try {
    await Promise.all([
      diagnosticsProvider.refresh(),
      analysisViewProvider.refresh(),
      statusBarManager.refresh()
    ]);

    vscode.window.showInformationMessage('Analysis refreshed');
  } catch (error) {
    console.error('Refresh failed:', error);
    vscode.window.showErrorMessage(`Refresh failed: ${error}`);
  }
}

function setupFileWatchers(context: vscode.ExtensionContext): void {
  const config = vscode.workspace.getConfiguration('gibrun.analysis');
  const autoRefresh = config.get('autoRefresh', true);
  const debounceMs = config.get('debounceMs', 1000);

  if (!autoRefresh) return;

  // Watch for file changes in source code
  const watcher = vscode.workspace.createFileSystemWatcher(
    '**/*.{js,ts,jsx,tsx,go,py,java,cpp,h}',
    false, // ignoreCreateEvents
    false, // ignoreChangeEvents
    false  // ignoreDeleteEvents
  );

  let debounceTimer: NodeJS.Timeout | undefined;

  const triggerIncrementalAnalysis = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(async () => {
      try {
        // Trigger incremental analysis for changed files
        await diagnosticsProvider.refresh();
        statusBarManager.updateStatus('Analyzing...');
      } catch (error) {
        console.error('Incremental analysis failed:', error);
      }
    }, debounceMs);
  };

  watcher.onDidChange(triggerIncrementalAnalysis);
  watcher.onDidCreate(triggerIncrementalAnalysis);
  watcher.onDidDelete(triggerIncrementalAnalysis);

  context.subscriptions.push(watcher);
}