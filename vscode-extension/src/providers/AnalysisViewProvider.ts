import * as vscode from 'vscode';
import { MCPClient, MCPToolResult } from '../mcp/MCPClient';

export class AnalysisViewProvider implements vscode.TreeDataProvider<AnalysisItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<AnalysisItem | undefined | null | void> = new vscode.EventEmitter<AnalysisItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<AnalysisItem | undefined | null | void> = this._onDidChangeTreeData.fire;

  private mcpClient: MCPClient;
  private analysisData: Map<string, MCPToolResult> = new Map();

  constructor(mcpClient: MCPClient, context: vscode.ExtensionContext) {
    this.mcpClient = mcpClient;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: AnalysisItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: AnalysisItem): Promise<AnalysisItem[]> {
    if (!element) {
      // Root level - show analysis categories
      return this.getRootItems();
    }

    // Child level - show details for specific analysis
    return this.getAnalysisDetails(element);
  }

  private async getRootItems(): Promise<AnalysisItem[]> {
    const items: AnalysisItem[] = [];

    // Architecture Analysis
    const archItem = new AnalysisItem(
      'Architecture',
      vscode.TreeItemCollapsibleState.Collapsed,
      'architecture'
    );
    archItem.iconPath = new vscode.ThemeIcon('repo');
    archItem.tooltip = 'Project architecture analysis and layer organization';
    items.push(archItem);

    // Quality Analysis
    const qualityItem = new AnalysisItem(
      'Code Quality',
      vscode.TreeItemCollapsibleState.Collapsed,
      'quality'
    );
    qualityItem.iconPath = new vscode.ThemeIcon('checklist');
    qualityItem.tooltip = 'Code quality metrics and hotspots';
    items.push(qualityItem);

    // Dependencies Analysis
    const depsItem = new AnalysisItem(
      'Dependencies',
      vscode.TreeItemCollapsibleState.Collapsed,
      'dependencies'
    );
    depsItem.iconPath = new vscode.ThemeIcon('package');
    depsItem.tooltip = 'Dependency analysis and security issues';
    items.push(depsItem);

    // Metrics Analysis
    const metricsItem = new AnalysisItem(
      'Development Metrics',
      vscode.TreeItemCollapsibleState.Collapsed,
      'metrics'
    );
    metricsItem.iconPath = new vscode.ThemeIcon('graph');
    metricsItem.tooltip = 'Development velocity and productivity metrics';
    items.push(metricsItem);

    // Health Assessment
    const healthItem = new AnalysisItem(
      'Project Health',
      vscode.TreeItemCollapsibleState.Collapsed,
      'health'
    );
    healthItem.iconPath = new vscode.ThemeIcon('heart');
    healthItem.tooltip = 'Overall project health assessment';
    items.push(healthItem);

    // Insights
    const insightsItem = new AnalysisItem(
      'AI Insights',
      vscode.TreeItemCollapsibleState.Collapsed,
      'insights'
    );
    insightsItem.iconPath = new vscode.ThemeIcon('lightbulb');
    insightsItem.tooltip = 'AI-powered insights and recommendations';
    items.push(insightsItem);

    return items;
  }

  private async getAnalysisDetails(element: AnalysisItem): Promise<AnalysisItem[]> {
    const analysisType = element.analysisType;
    const items: AnalysisItem[] = [];

    try {
      // Get cached data or fetch new data
      let result = this.analysisData.get(analysisType);
      if (!result) {
        result = await this.mcpClient.executeTool(`project_analyzer/${analysisType}`, {
          operation: analysisType,
          scope: 'full'
        });

        if (result) {
          this.analysisData.set(analysisType, result);
        }
      }

      if (!result || !result.success) {
        const errorItem = new AnalysisItem(
          'Analysis failed or not available',
          vscode.TreeItemCollapsibleState.None,
          analysisType
        );
        errorItem.iconPath = new vscode.ThemeIcon('error');
        return [errorItem];
      }

      // Create items based on analysis type
      switch (analysisType) {
        case 'architecture':
          items.push(...this.createArchitectureItems(result.data));
          break;
        case 'quality':
          items.push(...this.createQualityItems(result.data));
          break;
        case 'dependencies':
          items.push(...this.createDependenciesItems(result.data));
          break;
        case 'metrics':
          items.push(...this.createMetricsItems(result.data));
          break;
        case 'health':
          items.push(...this.createHealthItems(result.data));
          break;
        case 'insights':
          items.push(...this.createInsightsItems(result.data));
          break;
      }

    } catch (error) {
      console.error(`Failed to get ${analysisType} details:`, error);
      const errorItem = new AnalysisItem(
        `Error: ${error}`,
        vscode.TreeItemCollapsibleState.None,
        analysisType
      );
      errorItem.iconPath = new vscode.ThemeIcon('error');
      items.push(errorItem);
    }

    return items;
  }

  private createArchitectureItems(data: any): AnalysisItem[] {
    const items: AnalysisItem[] = [];

    // Layers summary
    if (data.layers) {
      const layersItem = new AnalysisItem(
        `Layers: ${Object.keys(data.layers).length} categories`,
        vscode.TreeItemCollapsibleState.Collapsed,
        'architecture'
      );
      layersItem.iconPath = new vscode.ThemeIcon('layers');
      items.push(layersItem);
    }

    // Dependencies summary
    if (data.dependencies) {
      const depsItem = new AnalysisItem(
        `Dependencies: ${data.dependencies.nodes?.length || 0} nodes, ${data.dependencies.edges?.length || 0} edges`,
        vscode.TreeItemCollapsibleState.None,
        'architecture'
      );
      depsItem.iconPath = new vscode.ThemeIcon('link');
      items.push(depsItem);
    }

    // Violations
    if (data.violations?.violations) {
      const violationsItem = new AnalysisItem(
        `Violations: ${data.violations.violations.length}`,
        vscode.TreeItemCollapsibleState.Collapsed,
        'architecture'
      );
      violationsItem.iconPath = new vscode.ThemeIcon('warning');
      items.push(violationsItem);
    }

    // Health score
    if (data.health) {
      const healthItem = new AnalysisItem(
        `Health: ${data.health.score}/100 (${data.health.grade})`,
        vscode.TreeItemCollapsibleState.None,
        'architecture'
      );
      healthItem.iconPath = this.getHealthIcon(data.health.score);
      items.push(healthItem);
    }

    return items;
  }

  private createQualityItems(data: any): AnalysisItem[] {
    const items: AnalysisItem[] = [];

    // Overall score
    if (data.overall_score !== undefined) {
      const scoreItem = new AnalysisItem(
        `Overall Score: ${data.overall_score}/100`,
        vscode.TreeItemCollapsibleState.None,
        'quality'
      );
      scoreItem.iconPath = this.getScoreIcon(data.overall_score);
      items.push(scoreItem);
    }

    // Dimensions
    if (data.dimensions) {
      const dimensionsItem = new AnalysisItem(
        'Quality Dimensions',
        vscode.TreeItemCollapsibleState.Collapsed,
        'quality'
      );
      dimensionsItem.iconPath = new vscode.ThemeIcon('dashboard');
      items.push(dimensionsItem);
    }

    // Hotspots
    if (data.hotspots) {
      const hotspotsItem = new AnalysisItem(
        `Quality Hotspots: ${data.hotspots.length}`,
        vscode.TreeItemCollapsibleState.Collapsed,
        'quality'
      );
      hotspotsItem.iconPath = new vscode.ThemeIcon('flame');
      items.push(hotspotsItem);
    }

    return items;
  }

  private createDependenciesItems(data: any): AnalysisItem[] {
    const items: AnalysisItem[] = [];

    // Summary
    if (data.summary) {
      const summaryItem = new AnalysisItem(
        `Dependencies: ${data.summary.total_dependencies} total`,
        vscode.TreeItemCollapsibleState.None,
        'dependencies'
      );
      summaryItem.iconPath = new vscode.ThemeIcon('package');
      items.push(summaryItem);
    }

    // Security issues
    if (data.security_issues) {
      const securityItem = new AnalysisItem(
        `Security Issues: ${data.security_issues.length}`,
        vscode.TreeItemCollapsibleState.Collapsed,
        'dependencies'
      );
      securityItem.iconPath = new vscode.ThemeIcon('shield');
      items.push(securityItem);
    }

    // License compatibility
    if (data.license_compatibility) {
      const licenseItem = new AnalysisItem(
        `License: ${data.license_compatibility.compatible ? 'Compatible' : 'Issues Found'}`,
        vscode.TreeItemCollapsibleState.None,
        'dependencies'
      );
      licenseItem.iconPath = data.license_compatibility.compatible
        ? new vscode.ThemeIcon('check')
        : new vscode.ThemeIcon('warning');
      items.push(licenseItem);
    }

    return items;
  }

  private createMetricsItems(data: any): AnalysisItem[] {
    const items: AnalysisItem[] = [];

    // Velocity
    if (data.velocity) {
      const velocityItem = new AnalysisItem(
        `Velocity: ${data.velocity.commits_per_day?.toFixed(1)} commits/day`,
        vscode.TreeItemCollapsibleState.None,
        'metrics'
      );
      velocityItem.iconPath = new vscode.ThemeIcon('rocket');
      items.push(velocityItem);
    }

    // Productivity
    if (data.productivity) {
      const productivityItem = new AnalysisItem(
        `Team: ${data.productivity.team_size} developers`,
        vscode.TreeItemCollapsibleState.None,
        'metrics'
      );
      productivityItem.iconPath = new vscode.ThemeIcon('organization');
      items.push(productivityItem);
    }

    // Stability
    if (data.stability) {
      const stabilityItem = new AnalysisItem(
        `Code Churn: ${data.stability.code_churn?.toFixed(1)}%`,
        vscode.TreeItemCollapsibleState.None,
        'metrics'
      );
      stabilityItem.iconPath = new vscode.ThemeIcon('pulse');
      items.push(stabilityItem);
    }

    return items;
  }

  private createHealthItems(data: any): AnalysisItem[] {
    const items: AnalysisItem[] = [];

    // Overall health
    if (data.overall_health_score !== undefined) {
      const healthItem = new AnalysisItem(
        `Overall Health: ${data.overall_health_score}/100`,
        vscode.TreeItemCollapsibleState.None,
        'health'
      );
      healthItem.iconPath = this.getHealthIcon(data.overall_health_score);
      items.push(healthItem);
    }

    // Risk assessment
    if (data.risk_assessment) {
      const riskItem = new AnalysisItem(
        `Risks: ${data.risk_assessment.critical_risks} critical, ${data.risk_assessment.high_risks} high`,
        vscode.TreeItemCollapsibleState.Collapsed,
        'health'
      );
      riskItem.iconPath = new vscode.ThemeIcon('alert');
      items.push(riskItem);
    }

    // Dimensions
    if (data.dimensions) {
      const dimensionsItem = new AnalysisItem(
        'Health Dimensions',
        vscode.TreeItemCollapsibleState.Collapsed,
        'health'
      );
      dimensionsItem.iconPath = new vscode.ThemeIcon('dashboard');
      items.push(dimensionsItem);
    }

    return items;
  }

  private createInsightsItems(data: any): AnalysisItem[] {
    const items: AnalysisItem[] = [];

    // Patterns identified
    if (data.patterns_identified) {
      const patternsItem = new AnalysisItem(
        `Patterns: ${data.patterns_identified.length} identified`,
        vscode.TreeItemCollapsibleState.Collapsed,
        'insights'
      );
      patternsItem.iconPath = new vscode.ThemeIcon('search-view-icon');
      items.push(patternsItem);
    }

    // Anomalies detected
    if (data.anomalies_detected) {
      const anomaliesItem = new AnalysisItem(
        `Anomalies: ${data.anomalies_detected.length} detected`,
        vscode.TreeItemCollapsibleState.Collapsed,
        'insights'
      );
      anomaliesItem.iconPath = new vscode.ThemeIcon('warning');
      items.push(anomaliesItem);
    }

    // Predictions
    if (data.predictions) {
      const predictionsItem = new AnalysisItem(
        `Predictions: ${data.predictions.length} available`,
        vscode.TreeItemCollapsibleState.Collapsed,
        'insights'
      );
      predictionsItem.iconPath = new vscode.ThemeIcon('lightbulb');
      items.push(predictionsItem);
    }

    return items;
  }

  private getHealthIcon(score: number): vscode.ThemeIcon {
    if (score >= 90) return new vscode.ThemeIcon('heart');
    if (score >= 70) return new vscode.ThemeIcon('heart-filled');
    if (score >= 50) return new vscode.ThemeIcon('warning');
    return new vscode.ThemeIcon('error');
  }

  private getScoreIcon(score: number): vscode.ThemeIcon {
    if (score >= 80) return new vscode.ThemeIcon('check');
    if (score >= 60) return new vscode.ThemeIcon('warning');
    return new vscode.ThemeIcon('error');
  }
}

class AnalysisItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly analysisType: string
  ) {
    super(label, collapsibleState);
  }
}