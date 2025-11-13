import { MCPClient } from '../mcp/MCPClient';

export class LSPBridge {
  private mcpClient: MCPClient;

  constructor(mcpClient: MCPClient) {
    this.mcpClient = mcpClient;
  }

  /**
   * Convert MCP analysis results to LSP diagnostics
   */
  async convertToDiagnostics(fileUri: string, analysisType: string): Promise<any[]> {
    try {
      const result = await this.mcpClient.executeTool(`project_analyzer/${analysisType}`, {
        operation: analysisType,
        scope: 'file'
      });

      if (!result?.success || !result.data) {
        return [];
      }

      const diagnostics: any[] = [];

      // Convert based on analysis type
      switch (analysisType) {
        case 'architecture':
          diagnostics.push(...this.convertArchitectureToDiagnostics(result.data, fileUri));
          break;
        case 'quality':
          diagnostics.push(...this.convertQualityToDiagnostics(result.data, fileUri));
          break;
        case 'dependencies':
          diagnostics.push(...this.convertDependenciesToDiagnostics(result.data, fileUri));
          break;
      }

      return diagnostics;
    } catch (error) {
      console.error(`Failed to convert ${analysisType} to diagnostics:`, error);
      return [];
    }
  }

  private convertArchitectureToDiagnostics(data: any, fileUri: string): any[] {
    const diagnostics: any[] = [];

    // Convert violations to diagnostics
    if (data.violations?.violations) {
      for (const violation of data.violations.violations) {
        diagnostics.push({
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 }
          },
          severity: this.mapSeverityToLSP(violation.severity),
          message: violation.description,
          source: 'GibRun Architecture',
          code: violation.type,
          relatedInformation: violation.locations?.map((loc: string) => ({
            location: {
              uri: fileUri,
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 1 }
              }
            },
            message: `Related to: ${loc}`
          }))
        });
      }
    }

    return diagnostics;
  }

  private convertQualityToDiagnostics(data: any, fileUri: string): any[] {
    const diagnostics: any[] = [];

    // Convert hotspots to diagnostics
    if (data.hotspots) {
      for (const hotspot of data.hotspots) {
        diagnostics.push({
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 }
          },
          severity: this.mapSeverityToLSP(hotspot.severity),
          message: `Quality hotspot: ${hotspot.issues.join(', ')}`,
          source: 'GibRun Quality',
          code: 'quality_hotspot',
          relatedInformation: [{
            location: {
              uri: fileUri,
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 1 }
              }
            },
            message: `File: ${hotspot.file}`
          }]
        });
      }
    }

    return diagnostics;
  }

  private convertDependenciesToDiagnostics(data: any, fileUri: string): any[] {
    const diagnostics: any[] = [];

    // Convert security issues to diagnostics
    if (data.security_issues) {
      for (const issue of data.security_issues) {
        diagnostics.push({
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 }
          },
          severity: this.mapSeverityToLSP(issue.severity),
          message: `Security vulnerability: ${issue.description}`,
          source: 'GibRun Security',
          code: 'security_vulnerability',
          relatedInformation: [{
            location: {
              uri: fileUri,
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 1 }
              }
            },
            message: `Package: ${issue.package}@${issue.version}`
          }]
        });
      }
    }

    return diagnostics;
  }

  private mapSeverityToLSP(severity: string): number {
    switch (severity) {
      case 'critical': return 1; // Error
      case 'high': return 1; // Error
      case 'medium': return 2; // Warning
      case 'low': return 3; // Information
      default: return 2; // Warning
    }
  }

  /**
   * Convert MCP results to code actions
   */
  async convertToCodeActions(fileUri: string, analysisType: string): Promise<any[]> {
    try {
      const result = await this.mcpClient.executeTool(`project_analyzer/${analysisType}`, {
        operation: analysisType,
        scope: 'file'
      });

      if (!result?.success || !result.data) {
        return [];
      }

      const actions: any[] = [];

      // Convert based on analysis type
      switch (analysisType) {
        case 'quality':
          actions.push(...this.convertQualityToCodeActions(result.data, fileUri));
          break;
        case 'dependencies':
          actions.push(...this.convertDependenciesToCodeActions(result.data, fileUri));
          break;
      }

      return actions;
    } catch (error) {
      console.error(`Failed to convert ${analysisType} to code actions:`, error);
      return [];
    }
  }

  private convertQualityToCodeActions(data: any, fileUri: string): any[] {
    const actions: any[] = [];

    // Generate refactoring suggestions
    if (data.recommendations) {
      for (const rec of data.recommendations) {
        if (rec.category === 'complexity') {
          actions.push({
            title: `Refactor: ${rec.title}`,
            kind: 'refactor.extract',
            command: {
              title: 'Apply Refactoring',
              command: 'gibrun.applyRefactoring',
              arguments: [fileUri, rec]
            }
          });
        }
      }
    }

    return actions;
  }

  private convertDependenciesToCodeActions(data: any, fileUri: string): any[] {
    const actions: any[] = [];

    // Generate dependency update suggestions
    if (data.recommendations) {
      for (const rec of data.recommendations) {
        if (rec.type === 'security_update' && rec.fix_available) {
          actions.push({
            title: `Update ${rec.package} to ${rec.fix_version}`,
            kind: 'source.fixAll',
            command: {
              title: 'Update Dependency',
              command: 'gibrun.updateDependency',
              arguments: [rec.package, rec.fix_version]
            }
          });
        }
      }
    }

    return actions;
  }

  /**
   * Get hover information from analysis results
   */
  async getHoverInfo(fileUri: string, position: any): Promise<any | null> {
    try {
      // Get insights for the file
      const result = await this.mcpClient.executeTool('project_analyzer/insights', {
        operation: 'insights',
        scope: 'file'
      });

      if (!result?.success || !result.data) {
        return null;
      }

      // Find relevant insights for this position
      const insights = result.data.knowledge_discovered || [];
      const relevantInsight = insights.find((insight: any) =>
        insight.category === 'technology' || insight.category === 'process'
      );

      if (relevantInsight) {
        return {
          contents: {
            kind: 'markdown',
            value: `**GibRun Insight:** ${relevantInsight.insight}`
          },
          range: {
            start: position,
            end: position
          }
        };
      }

      return null;
    } catch (error) {
      console.error('Failed to get hover info:', error);
      return null;
    }
  }
}