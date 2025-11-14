// src/tools/project-analyzer/index.ts
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { ProjectAnalysisEngine } from './engine.js';
import { AnalysisOperation, AnalysisConfig } from './types/index.js';

export class ProjectAnalyzerTool {
  private engine: ProjectAnalysisEngine;

  constructor() {
    this.engine = new ProjectAnalysisEngine();
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

  async executeTool(name: string, args: any) {
    try {
      const operation = name.split('/')[1] as AnalysisOperation;
      const config: AnalysisConfig = {
        operation,
        ...args
      };

      const result = await this.engine.analyze(operation, config);

      let output: string;
      switch (args.output_format || 'summary') {
        case 'json':
          output = JSON.stringify(result, null, 2);
          break;
        case 'detailed':
          output = this.formatDetailed(result);
          break;
        case 'summary':
        default:
          output = this.formatSummary(result);
          break;
      }

      return {
        content: [{
          type: 'text',
          text: output
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: `Project analysis failed: ${error.message}`
        }],
        isError: true
      };
    }
  }

  private formatSummary(result: any): string {
    if (!result.success) {
      return `❌ Analysis failed: ${result.error || 'Unknown error'}`;
    }

    const operation = result.operation;
    const time = result.metadata?.analysisTime || 0;
    const files = result.metadata?.filesAnalyzed || 0;

    let summary = `✅ ${operation.charAt(0).toUpperCase() + operation.slice(1)} analysis completed\n`;
    summary += `⏱️  ${time}ms, 📁 ${files} files analyzed\n\n`;

    if (result.data?.message) {
      summary += result.data.message;
    } else {
      summary += `Analysis data available. Use 'detailed' or 'json' format for full results.`;
    }

    return summary;
  }

  private formatDetailed(result: any): string {
    if (!result.success) {
      return `❌ Analysis failed: ${result.error || 'Unknown error'}`;
    }

    let output = `📊 ${result.operation.toUpperCase()} ANALYSIS REPORT\n`;
    output += `═══════════════════════════════════════════════\n\n`;

    output += `📅 Timestamp: ${result.timestamp.toISOString()}\n`;
    output += `⏱️  Duration: ${result.metadata?.analysisTime || 0}ms\n`;
    output += `📁 Files Analyzed: ${result.metadata?.filesAnalyzed || 0}\n`;
    output += `🎯 Scope: ${result.metadata?.scope || 'unknown'}\n\n`;

    if (result.data) {
      output += `📈 RESULTS:\n`;
      output += JSON.stringify(result.data, null, 2);
    }

    return output;
  }
}