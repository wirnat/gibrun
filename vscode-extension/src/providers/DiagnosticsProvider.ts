import * as vscode from 'vscode';
import { MCPClient } from '../mcp/MCPClient';
import { LSPBridge } from '../lsp/LSPBridge';

export class DiagnosticsProvider {
  private diagnosticCollection: vscode.DiagnosticCollection;
  private mcpClient: MCPClient;
  private lspBridge: LSPBridge;
  private analysisTimer: NodeJS.Timeout | null = null;

  constructor(mcpClient: MCPClient, context: vscode.ExtensionContext) {
    this.mcpClient = mcpClient;
    this.lspBridge = new LSPBridge(mcpClient);
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('gibrun');
    context.subscriptions.push(this.diagnosticCollection);
  }

  register(): void {
    // Register diagnostic provider for supported languages
    const supportedLanguages = [
      'typescript', 'javascript', 'typescriptreact', 'javascriptreact',
      'go', 'python', 'java', 'csharp', 'cpp', 'c'
    ];

    for (const language of supportedLanguages) {
      vscode.languages.registerCodeActionsProvider(language, this);
      vscode.languages.registerHoverProvider(language, this);
    }

    // Initial analysis
    this.scheduleAnalysis();
  }

  async refresh(): Promise<void> {
    await this.performAnalysis();
  }

  private scheduleAnalysis(): void {
    const config = vscode.workspace.getConfiguration('gibrun.analysis');
    const debounceMs = config.get('debounceMs', 1000);

    if (this.analysisTimer) {
      clearTimeout(this.analysisTimer);
    }

    this.analysisTimer = setTimeout(async () => {
      await this.performAnalysis();
    }, debounceMs);
  }

  private async performAnalysis(): Promise<void> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) return;

      // Clear existing diagnostics
      this.diagnosticCollection.clear();

      // Get configuration
      const config = vscode.workspace.getConfiguration('gibrun.diagnostics');
      const enableDiagnostics = config.get('enable', true);

      if (!enableDiagnostics) return;

      // Perform analysis for all open files
      const openTabs = vscode.window.tabGroups.all.flatMap(tg =>
        tg.tabs.map(tab => tab.input).filter((input): input is vscode.TabInputText =>
          input instanceof vscode.TabInputText
        )
      );

      for (const tab of openTabs) {
        await this.analyzeFile(tab.uri);
      }

      // Also analyze workspace files
      await this.analyzeWorkspace(workspaceFolder.uri);

    } catch (error) {
      console.error('Analysis failed:', error);
    }
  }

  private async analyzeFile(fileUri: vscode.Uri): Promise<void> {
    try {
      const diagnostics: vscode.Diagnostic[] = [];

      // Get architecture diagnostics
      const archDiagnostics = await this.lspBridge.convertToDiagnostics(
        fileUri.toString(),
        'architecture'
      );
      diagnostics.push(...this.convertToVscodeDiagnostics(archDiagnostics, fileUri));

      // Get quality diagnostics
      const qualityDiagnostics = await this.lspBridge.convertToDiagnostics(
        fileUri.toString(),
        'quality'
      );
      diagnostics.push(...this.convertToVscodeDiagnostics(qualityDiagnostics, fileUri));

      // Get dependency diagnostics
      const depDiagnostics = await this.lspBridge.convertToDiagnostics(
        fileUri.toString(),
        'dependencies'
      );
      diagnostics.push(...this.convertToVscodeDiagnostics(depDiagnostics, fileUri));

      // Set diagnostics for this file
      this.diagnosticCollection.set(fileUri, diagnostics);

    } catch (error) {
      console.error(`Failed to analyze file ${fileUri}:`, error);
    }
  }

  private async analyzeWorkspace(workspaceUri: vscode.Uri): Promise<void> {
    try {
      // Analyze workspace-level issues
      const workspaceDiagnostics: vscode.Diagnostic[] = [];

      // Get health assessment for workspace-level issues
      const healthResult = await this.mcpClient.executeTool('project_analyzer/health', {
        operation: 'health',
        scope: 'full'
      });

      if (healthResult?.success && healthResult.data) {
        const healthData = healthResult.data;

        // Convert risk factors to diagnostics
        if (healthData.risk_assessment?.risk_factors) {
          for (const risk of healthData.risk_assessment.risk_factors) {
            if (risk.level === 'critical' || risk.level === 'high') {
              workspaceDiagnostics.push({
                range: new vscode.Range(0, 0, 0, 1),
                severity: this.mapRiskLevelToSeverity(risk.level),
                message: `${risk.category.toUpperCase()} Risk: ${risk.description}`,
                source: 'GibRun Health',
                code: risk.category
              });
            }
          }
        }
      }

      // Set workspace diagnostics
      this.diagnosticCollection.set(workspaceUri, workspaceDiagnostics);

    } catch (error) {
      console.error(`Failed to analyze workspace ${workspaceUri}:`, error);
    }
  }

  private convertToVscodeDiagnostics(diagnostics: any[], fileUri: vscode.Uri): vscode.Diagnostic[] {
    return diagnostics.map(diag => {
      const range = diag.range ? new vscode.Range(
        diag.range.start.line,
        diag.range.start.character,
        diag.range.end.line,
        diag.range.end.character
      ) : new vscode.Range(0, 0, 0, 1);

      return new vscode.Diagnostic(
        range,
        diag.message,
        this.mapSeverityToVscode(diag.severity),
        diag.code,
        diag.source
      );
    });
  }

  private mapSeverityToVscode(severity: number): vscode.DiagnosticSeverity {
    switch (severity) {
      case 1: return vscode.DiagnosticSeverity.Error;
      case 2: return vscode.DiagnosticSeverity.Warning;
      case 3: return vscode.DiagnosticSeverity.Information;
      case 4: return vscode.DiagnosticSeverity.Hint;
      default: return vscode.DiagnosticSeverity.Warning;
    }
  }

  private mapRiskLevelToSeverity(level: string): vscode.DiagnosticSeverity {
    switch (level) {
      case 'critical': return vscode.DiagnosticSeverity.Error;
      case 'high': return vscode.DiagnosticSeverity.Error;
      case 'medium': return vscode.DiagnosticSeverity.Warning;
      case 'low': return vscode.DiagnosticSeverity.Information;
      default: return vscode.DiagnosticSeverity.Warning;
    }
  }

  // Code Actions Provider implementation
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.CodeAction[]> {
    const actions: vscode.CodeAction[] = [];

    // Add quick fix actions based on diagnostics
    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source === 'GibRun Architecture') {
        actions.push(...this.createArchitectureActions(diagnostic, document));
      } else if (diagnostic.source === 'GibRun Quality') {
        actions.push(...this.createQualityActions(diagnostic, document));
      } else if (diagnostic.source === 'GibRun Security') {
        actions.push(...this.createSecurityActions(diagnostic, document));
      }
    }

    return actions;
  }

  private createArchitectureActions(diagnostic: vscode.Diagnostic, document: vscode.TextDocument): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    if (diagnostic.code === 'dependency_direction') {
      const action = new vscode.CodeAction(
        'Refactor dependency injection',
        vscode.CodeActionKind.QuickFix
      );
      action.command = {
        title: 'Refactor Dependency',
        command: 'gibrun.refactorDependency',
        arguments: [document.uri, diagnostic.range]
      };
      actions.push(action);
    }

    return actions;
  }

  private createQualityActions(diagnostic: vscode.Diagnostic, document: vscode.TextDocument): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    if (diagnostic.message.includes('complexity')) {
      const action = new vscode.CodeAction(
        'Extract method',
        vscode.CodeActionKind.RefactorExtract
      );
      action.command = {
        title: 'Extract Method',
        command: 'gibrun.extractMethod',
        arguments: [document.uri, diagnostic.range]
      };
      actions.push(action);
    }

    return actions;
  }

  private createSecurityActions(diagnostic: vscode.Diagnostic, document: vscode.TextDocument): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    if (diagnostic.message.includes('vulnerability')) {
      const action = new vscode.CodeAction(
        'Update dependency',
        vscode.CodeActionKind.QuickFix
      );
      action.command = {
        title: 'Update Dependency',
        command: 'gibrun.updateDependency',
        arguments: [document.uri, diagnostic.message]
      };
      actions.push(action);
    }

    return actions;
  }

  // Hover Provider implementation
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Hover> {
    return this.lspBridge.getHoverInfo(document.uri.toString(), position);
  }

  dispose(): void {
    if (this.analysisTimer) {
      clearTimeout(this.analysisTimer);
    }
    this.diagnosticCollection.dispose();
  }
}