// src/tools/project-analyzer/analyzers/DependenciesAnalyzer.ts
import {
  RawProjectData,
  AnalysisConfig,
  DependenciesAnalysis,
  DependenciesSummary,
  DependencyGraphData,
  DependencyNodeData,
  DependencyEdgeData,
  SecurityIssue,
  LicenseCompatibility,
  DependencyRecommendation,
  BaseAnalyzer
} from '@analyzer-types/index.js';

export class DependenciesAnalyzer implements BaseAnalyzer {
  async analyze(data: RawProjectData, config: AnalysisConfig): Promise<DependenciesAnalysis> {
    const dependencies = data.dependencies || [];

    // Calculate summary
    const summary = this.calculateSummary(dependencies);

    // Build dependency graph
    const dependencyGraph = this.buildDependencyGraph(dependencies);

    // Analyze security issues (simplified - in real implementation would check vulnerability databases)
    const securityIssues = this.analyzeSecurityIssues(dependencies);

    // Check license compatibility
    const licenseCompatibility = this.checkLicenseCompatibility(dependencies);

    // Generate recommendations
    const recommendations = this.generateRecommendations(dependencies, securityIssues, licenseCompatibility);

    return {
      summary,
      dependency_graph: dependencyGraph,
      security_issues: securityIssues,
      license_compatibility: licenseCompatibility,
      unused_dependencies: this.findUnusedDependencies(dependencies, data.files || []),
      recommendations
    };
  }

  private calculateSummary(dependencies: any[]): DependenciesSummary {
    const totalDependencies = dependencies.length;
    const directDependencies = dependencies.filter(dep => dep.type === 'runtime').length;
    const transitiveDependencies = totalDependencies - directDependencies;

    // Mock vulnerability data (in real implementation, this would query vulnerability databases)
    const vulnerabilities = {
      critical: Math.floor(Math.random() * 3),
      high: Math.floor(Math.random() * 5),
      medium: Math.floor(Math.random() * 8),
      low: Math.floor(Math.random() * 10)
    };

    return {
      total_dependencies: totalDependencies,
      direct_dependencies: directDependencies,
      transitive_dependencies: transitiveDependencies,
      vulnerabilities
    };
  }

  private buildDependencyGraph(dependencies: any[]): DependencyGraphData {
    const nodes: DependencyNodeData[] = [];
    const edges: DependencyEdgeData[] = [];

    // Create nodes from dependencies
    const nodeMap = new Map<string, DependencyNodeData>();

    dependencies.forEach(dep => {
      const nodeId = `${dep.name}@${dep.version}`;
      if (!nodeMap.has(nodeId)) {
        const vulnerabilities = this.getMockVulnerabilities(dep.name);
        nodeMap.set(nodeId, {
          id: nodeId,
          version: dep.version,
          type: dep.type,
          vulnerabilities
        });
      }
    });

    // Create edges (simplified - in real implementation would analyze actual dependency relationships)
    const nodeIds = Array.from(nodeMap.keys());
    for (let i = 0; i < Math.min(nodeIds.length, 10); i++) {
      for (let j = i + 1; j < Math.min(nodeIds.length, i + 3); j++) {
        edges.push({
          from: nodeIds[i],
          to: nodeIds[j],
          type: Math.random() > 0.5 ? 'direct' : 'transitive'
        });
      }
    }

    return {
      nodes: Array.from(nodeMap.values()),
      edges
    };
  }

  private analyzeSecurityIssues(dependencies: any[]): SecurityIssue[] {
    const issues: SecurityIssue[] = [];

    dependencies.forEach(dep => {
      // Mock security analysis (in real implementation would check CVE databases)
      const mockVulnerabilities = this.getMockVulnerabilities(dep.name);

      if (mockVulnerabilities > 0) {
        const severity = mockVulnerabilities > 2 ? 'high' : mockVulnerabilities > 1 ? 'medium' : 'low';

        issues.push({
          package: dep.name,
          version: dep.version,
          vulnerability: `CVE-2024-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
          severity,
          description: `Security vulnerability in ${dep.name} version ${dep.version}`,
          fix_available: Math.random() > 0.3,
          fix_version: Math.random() > 0.3 ? `${this.incrementVersion(dep.version)}` : undefined,
          published_date: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000)
        });
      }
    });

    return issues.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });
  }

  private checkLicenseCompatibility(dependencies: any[]): LicenseCompatibility {
    // Mock license analysis (in real implementation would analyze actual licenses)
    const incompatibleLicenses = ['GPL-3.0', 'AGPL-3.0', 'MS-PL'];
    const foundIncompatible = dependencies.some(dep =>
      incompatibleLicenses.includes(dep.license || '')
    );

    const recommendations = foundIncompatible ? [
      'Consider replacing GPL-licensed dependencies with MIT/Apache alternatives',
      'Review license compatibility with your project\'s license',
      'Consult legal team for license compliance'
    ] : [];

    return {
      compatible: !foundIncompatible,
      incompatible_licenses: foundIncompatible ? ['GPL-3.0'] : [],
      recommendations
    };
  }

  private generateRecommendations(
    dependencies: any[],
    securityIssues: SecurityIssue[],
    licenseCompatibility: LicenseCompatibility
  ): DependencyRecommendation[] {
    const recommendations: DependencyRecommendation[] = [];

    // Security update recommendations
    securityIssues.forEach(issue => {
      if (issue.fix_available && issue.fix_version) {
        recommendations.push({
          type: 'security_update',
          package: issue.package,
          title: `Update ${issue.package} to fix security vulnerability`,
          description: `Security vulnerability ${issue.vulnerability} affects version ${issue.version}`,
          priority: issue.severity === 'critical' ? 'critical' :
                   issue.severity === 'high' ? 'high' : 'medium',
          effort: 'low',
        });
      }
    });

    // License compatibility recommendations
    if (!licenseCompatibility.compatible) {
      recommendations.push({
        type: 'license_change',
        package: '',
        title: 'Address license compatibility issues',
        description: 'Some dependencies have incompatible licenses',
        priority: 'high',
        effort: 'medium',
      });
    }

    // Outdated dependency recommendations
    const outdatedDeps = dependencies.filter(dep => this.isOutdated(dep.version));
    if (outdatedDeps.length > 0) {
      recommendations.push({
        type: 'version_update',
        package: '',
        title: `Update ${outdatedDeps.length} outdated dependencies`,
        description: 'Several dependencies have newer versions available',
        priority: 'medium',
        effort: 'medium',
      });
    }

    // Unused dependency recommendations
    const unusedDeps = this.findUnusedDependencies(dependencies, []); // Simplified
    if (unusedDeps.length > 0) {
      recommendations.push({
        type: 'removal',
        package: '',
        title: `Remove ${unusedDeps.length} unused dependencies`,
        description: 'Unused dependencies increase bundle size and security surface',
        priority: 'low',
        effort: 'low',
      });
    }

    return recommendations;
  }

  private findUnusedDependencies(dependencies: any[], files: any[]): string[] {
    // Simplified unused dependency detection
    // In real implementation, this would analyze import statements
    const unused: string[] = [];

    dependencies.forEach(dep => {
      // Mock analysis - randomly mark some as unused
      if (Math.random() > 0.7) {
        unused.push(dep.name);
      }
    });

    return unused;
  }

  private getMockVulnerabilities(packageName: string): number {
    // Mock vulnerability count based on package name
    const hash = packageName.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);

    return Math.abs(hash) % 4; // 0-3 vulnerabilities
  }

  private incrementVersion(version: string): string {
    // Simple version incrementing
    const parts = version.split('.');
    if (parts.length >= 2) {
      const minor = parseInt(parts[1]) + 1;
      return `${parts[0]}.${minor}.0`;
    }
    return `${version}.1`;
  }

  private isOutdated(version: string): boolean {
    // Mock outdated check
    return Math.random() > 0.6;
  }
}