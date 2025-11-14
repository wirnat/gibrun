import * as vscode from 'vscode';
import { MCPClient } from '../mcp/MCPClient';

export class StatusBarManager {
  private statusBarItem: vscode.StatusBarItem;
  private mcpClient: MCPClient;
  private analysisStatus: 'idle' | 'analyzing' | 'completed' | 'error' = 'idle';
  private healthScore: number = 0;

  constructor(mcpClient: MCPClient) {
    this.mcpClient = mcpClient;
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.updateStatus('Initializing...');
  }

  register(): void {
    this.statusBarItem.show();
    this.statusBarItem.command = 'gibrun.showHealthDashboard';

    // Initial health check
    this.refresh();
  }

  async refresh(): Promise<void> {
    try {
      this.updateStatus('Analyzing...');

      const result = await this.mcpClient.executeTool('project_analyzer/health', {
        operation: 'health',
        scope: 'full'
      });

      if (result?.success && result.data?.overall_health_score !== undefined) {
        this.healthScore = result.data.overall_health_score;
        this.updateStatus('completed');
      } else {
        this.updateStatus('error');
      }
    } catch (error) {
      console.error('Status bar refresh failed:', error);
      this.updateStatus('error');
    }
  }

  updateStatus(status: 'idle' | 'analyzing' | 'completed' | 'error', message?: string): void {
    this.analysisStatus = status;

    switch (status) {
      case 'idle':
        this.statusBarItem.text = '$(search) GibRun';
        this.statusBarItem.tooltip = 'GibRun Project Analyzer - Click to analyze project';
        this.statusBarItem.color = undefined;
        break;

      case 'analyzing':
        this.statusBarItem.text = '$(sync~spin) Analyzing...';
        this.statusBarItem.tooltip = 'GibRun is analyzing your project...';
        this.statusBarItem.color = new vscode.ThemeColor('progressBar.background');
        break;

      case 'completed':
        const grade = this.getHealthGrade(this.healthScore);
        const icon = this.getHealthIcon(this.healthScore);
        this.statusBarItem.text = `${icon} ${this.healthScore}`;
        this.statusBarItem.tooltip = `Project Health: ${this.healthScore}/100 (${grade}) - Click for details`;
        this.statusBarItem.color = this.getHealthColor(this.healthScore);
        break;

      case 'error':
        this.statusBarItem.text = '$(error) GibRun Error';
        this.statusBarItem.tooltip = `GibRun analysis failed: ${message || 'Unknown error'} - Click to retry`;
        this.statusBarItem.color = new vscode.ThemeColor('errorForeground');
        break;
    }
  }

  private getHealthGrade(score: number): string {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  private getHealthIcon(score: number): string {
    if (score >= 90) return '$(heart)';
    if (score >= 80) return '$(heart-filled)';
    if (score >= 70) return '$(warning)';
    if (score >= 60) return '$(alert)';
    return '$(error)';
  }

  private getHealthColor(score: number): vscode.ThemeColor | undefined {
    if (score >= 90) return new vscode.ThemeColor('charts.green');
    if (score >= 80) return new vscode.ThemeColor('charts.blue');
    if (score >= 70) return new vscode.ThemeColor('charts.yellow');
    if (score >= 60) return new vscode.ThemeColor('charts.orange');
    return new vscode.ThemeColor('charts.red');
  }

  getStatus(): { status: string; healthScore: number } {
    return {
      status: this.analysisStatus,
      healthScore: this.healthScore
    };
  }

  dispose(): void {
    this.statusBarItem.dispose();
  }
}