// src/tools/project-analyzer/analyzers/HealthAnalyzer.ts
import {
  RawProjectData,
  AnalysisConfig,
  HealthAssessment,
  HealthDimensions,
  RiskAssessment,
  RiskFactor,
  BenchmarkComparison,
  ImprovementRoadmap,
  ActionItem,
  TimelineItem,
  TrendAnalysis,
  HealthPrediction,
  BaseAnalyzer
} from '../types/index.js';

export class HealthAnalyzer implements BaseAnalyzer {
  async analyze(data: RawProjectData, config: AnalysisConfig): Promise<HealthAssessment> {
    // Calculate health dimensions
    const dimensions = this.calculateHealthDimensions(data);

    // Assess risks
    const riskAssessment = this.assessRisks(data, dimensions);

    // Compare with benchmarks
    const benchmarkComparison = this.compareWithBenchmarks(dimensions);

    // Create improvement roadmap
    const improvementRoadmap = this.createImprovementRoadmap(dimensions, riskAssessment);

    // Analyze trends
    const trendAnalysis = this.analyzeTrends(data);

    // Calculate overall health score
    const overallHealthScore = this.calculateOverallScore(dimensions);

    return {
      overall_health_score: overallHealthScore,
      dimensions,
      risk_assessment: riskAssessment,
      benchmark_comparison: benchmarkComparison,
      improvement_roadmap: improvementRoadmap,
      trend_analysis: trendAnalysis
    };
  }

  private calculateHealthDimensions(data: RawProjectData): HealthDimensions {
    // Code quality dimension (based on quality analysis)
    const codeQuality = this.calculateCodeQualityScore(data);

    // Architecture dimension (based on architecture analysis)
    const architecture = this.calculateArchitectureScore(data);

    // Security dimension (based on dependencies)
    const security = this.calculateSecurityScore(data);

    // Performance dimension (estimated)
    const performance = this.calculatePerformanceScore(data);

    // Maintainability dimension (based on quality metrics)
    const maintainability = this.calculateMaintainabilityScore(data);

    // Test coverage dimension
    const testCoverage = this.calculateTestCoverageScore(data);

    // Documentation dimension (estimated)
    const documentation = this.calculateDocumentationScore(data);

    // CI/CD dimension (estimated)
    const ciCd = this.calculateCiCdScore(data);

    return {
      code_quality: codeQuality,
      architecture,
      security,
      performance,
      maintainability,
      test_coverage: testCoverage,
      documentation,
      ci_cd: ciCd
    };
  }

  private calculateCodeQualityScore(data: RawProjectData): number {
    // Mock calculation based on file analysis
    const files = data.files || [];
    if (files.length === 0) return 50;

    // Simple scoring based on file count and estimated quality
    let score = 80;

    // Penalize for large number of files (complexity)
    if (files.length > 100) score -= 10;
    else if (files.length > 50) score -= 5;

    // Penalize for files with errors (if available)
    const filesWithErrors = files.filter(f => f.content?.includes('TODO') || f.content?.includes('FIXME')).length;
    score -= (filesWithErrors / files.length) * 20;

    return Math.max(0, Math.min(100, score));
  }

  private calculateArchitectureScore(data: RawProjectData): number {
    // Mock calculation based on dependency analysis
    const dependencies = data.dependencies || [];
    let score = 75;

    // Penalize for too many dependencies
    if (dependencies.length > 50) score -= 15;
    else if (dependencies.length > 20) score -= 5;

    // Bonus for organized dependencies
    const uniqueSources = new Set(dependencies.map(d => d.source));
    if (uniqueSources.size <= 2) score += 10;

    return Math.max(0, Math.min(100, score));
  }

  private calculateSecurityScore(data: RawProjectData): number {
    // Mock calculation based on dependencies
    const dependencies = data.dependencies || [];
    let score = 85;

    // Penalize for outdated dependencies (mock)
    const outdatedDeps = dependencies.filter(() => Math.random() > 0.7).length;
    score -= (outdatedDeps / Math.max(dependencies.length, 1)) * 30;

    // Penalize for dependencies from untrusted sources
    const untrustedDeps = dependencies.filter(d => d.source === 'unknown').length;
    score -= (untrustedDeps / Math.max(dependencies.length, 1)) * 20;

    return Math.max(0, Math.min(100, score));
  }

  private calculatePerformanceScore(data: RawProjectData): number {
    // Mock calculation
    let score = 70;

    // Estimate based on file sizes and complexity
    const files = data.files || [];
    const avgFileSize = files.length > 0
      ? files.reduce((sum, f) => sum + (f.size || 0), 0) / files.length
      : 0;

    // Penalize for large average file size
    if (avgFileSize > 10000) score -= 20; // 10KB
    else if (avgFileSize > 5000) score -= 10; // 5KB

    return Math.max(0, Math.min(100, score));
  }

  private calculateMaintainabilityScore(data: RawProjectData): number {
    // Mock calculation based on code quality metrics
    let score = 65;

    const files = data.files || [];
    const totalLines = files.reduce((sum, f) => sum + (f.content?.split('\n').length || 0), 0);

    // Penalize for very large codebase
    if (totalLines > 50000) score -= 15;
    else if (totalLines > 20000) score -= 5;

    // Bonus for modular structure (estimated)
    if (files.filter(f => f.path?.includes('/')).length > files.length * 0.5) {
      score += 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  private calculateTestCoverageScore(data: RawProjectData): number {
    // Mock calculation
    const testResults = data.testResults || [];
    if (testResults.length === 0) return 30; // No tests

    const totalTests = testResults.reduce((sum, t) => sum + (t.tests || 0), 0);
    const passedTests = testResults.reduce((sum, t) => sum + (t.passed || 0), 0);

    if (totalTests === 0) return 20;

    const passRate = (passedTests / totalTests) * 100;

    // Estimate coverage based on test pass rate
    return Math.min(100, passRate + 20); // Add some buffer for coverage vs pass rate
  }

  private calculateDocumentationScore(data: RawProjectData): number {
    // Mock calculation based on file analysis
    const files = data.files || [];
    let score = 40; // Base score for having some files

    // Check for README files
    const hasReadme = files.some(f => f.path?.toLowerCase().includes('readme'));
    if (hasReadme) score += 20;

    // Check for documentation files
    const docFiles = files.filter(f =>
      f.path?.toLowerCase().includes('doc') ||
      f.path?.toLowerCase().includes('.md') ||
      f.path?.toLowerCase().includes('.txt')
    ).length;

    score += Math.min(30, docFiles * 5);

    // Check for code comments (rough estimate)
    const filesWithComments = files.filter(f =>
      f.content?.includes('//') || f.content?.includes('/*') || f.content?.includes('#')
    ).length;

    score += (filesWithComments / Math.max(files.length, 1)) * 20;

    return Math.max(0, Math.min(100, score));
  }

  private calculateCiCdScore(data: RawProjectData): number {
    // Mock calculation
    let score = 50;

    // Check for CI/CD files
    const files = data.files || [];
    const hasCiCd = files.some(f =>
      f.path?.includes('.github/workflows') ||
      f.path?.includes('.gitlab-ci') ||
      f.path?.includes('Jenkinsfile') ||
      f.path?.includes('Dockerfile') ||
      f.path?.includes('docker-compose')
    );

    if (hasCiCd) score += 30;

    // Check for package.json scripts (for Node.js projects)
    const hasBuildScripts = files.some(f =>
      f.content?.includes('"build"') ||
      f.content?.includes('"test"') ||
      f.content?.includes('"lint"')
    );

    if (hasBuildScripts) score += 20;

    return Math.max(0, Math.min(100, score));
  }

  private assessRisks(data: RawProjectData, dimensions: HealthDimensions): RiskAssessment {
    const riskFactors: RiskFactor[] = [];

    // Code quality risks
    if (dimensions.code_quality < 60) {
      riskFactors.push({
        category: 'code_quality',
        level: dimensions.code_quality < 40 ? 'critical' : 'high',
        description: 'Poor code quality increases maintenance costs and bug rates',
        impact: 'High development overhead and increased defect rates',
        mitigation: 'Implement code reviews, automated testing, and refactoring'
      });
    }

    // Security risks
    if (dimensions.security < 70) {
      riskFactors.push({
        category: 'security',
        level: dimensions.security < 50 ? 'critical' : 'high',
        description: 'Security vulnerabilities pose significant risks',
        impact: 'Potential data breaches and compliance violations',
        mitigation: 'Regular dependency updates, security scanning, and secure coding practices'
      });
    }

    // Architecture risks
    if (dimensions.architecture < 60) {
      riskFactors.push({
        category: 'architecture',
        level: 'medium',
        description: 'Poor architecture affects scalability and maintainability',
        impact: 'Difficulty in adding features and performance issues',
        mitigation: 'Architecture review and refactoring planning'
      });
    }

    // Test coverage risks
    if (dimensions.test_coverage < 50) {
      riskFactors.push({
        category: 'testing',
        level: 'medium',
        description: 'Low test coverage increases regression risk',
        impact: 'Frequent bugs and deployment issues',
        mitigation: 'Increase test coverage and implement automated testing'
      });
    }

    const criticalRisks = riskFactors.filter(r => r.level === 'critical').length;
    const highRisks = riskFactors.filter(r => r.level === 'high').length;
    const mediumRisks = riskFactors.filter(r => r.level === 'medium').length;
    const lowRisks = riskFactors.filter(r => r.level === 'low').length;

    return {
      critical_risks: criticalRisks,
      high_risks: highRisks,
      medium_risks: mediumRisks,
      low_risks: lowRisks,
      risk_factors: riskFactors
    };
  }

  private compareWithBenchmarks(dimensions: HealthDimensions): BenchmarkComparison {
    // Mock benchmark comparison
    const overallScore = Object.values(dimensions).reduce((a, b) => a + b, 0) / Object.values(dimensions).length;

    let vsIndustryAverage: string;
    let vsSimilarProjects: string;
    let percentileRank: number;
    const strengths: string[] = [];
    const weaknesses: string[] = [];

    if (overallScore >= 80) {
      vsIndustryAverage = 'Above average';
      vsSimilarProjects = 'Leading';
      percentileRank = 75;
    } else if (overallScore >= 60) {
      vsIndustryAverage = 'Average';
      vsSimilarProjects = 'Comparable';
      percentileRank = 50;
    } else {
      vsIndustryAverage = 'Below average';
      vsSimilarProjects = 'Lagging';
      percentileRank = 25;
    }

    // Identify strengths and weaknesses
    Object.entries(dimensions).forEach(([key, value]) => {
      if (value >= 80) {
        strengths.push(`${key.replace('_', ' ')} (${value}%)`);
      } else if (value < 60) {
        weaknesses.push(`${key.replace('_', ' ')} (${value}%)`);
      }
    });

    return {
      vs_industry_average: vsIndustryAverage,
      vs_similar_projects: vsSimilarProjects,
      percentile_rank: percentileRank,
      strengths,
      weaknesses
    };
  }

  private createImprovementRoadmap(dimensions: HealthDimensions, riskAssessment: RiskAssessment): ImprovementRoadmap {
    const immediateActions: ActionItem[] = [];
    const shortTermGoals: string[] = [];
    const longTermVision: string[] = [];
    const timeline: TimelineItem[] = [];

    // Immediate actions based on critical risks
    riskAssessment.risk_factors
      .filter(r => r.level === 'critical')
      .forEach(risk => {
        immediateActions.push({
          action: `Address ${risk.category} risks`,
          impact: 'critical',
          effort: 'high',
          timeline: '1-2 weeks'
        });
      });

    // Short-term goals
    if (dimensions.test_coverage < 70) {
      shortTermGoals.push('Achieve 70%+ test coverage');
    }
    if (dimensions.security < 80) {
      shortTermGoals.push('Resolve all high-priority security issues');
    }
    if (dimensions.code_quality < 70) {
      shortTermGoals.push('Implement automated code quality checks');
    }

    // Long-term vision
    longTermVision.push('Achieve 90%+ score across all health dimensions');
    longTermVision.push('Establish continuous monitoring and improvement processes');
    longTermVision.push('Become a model project for best practices');

    // Timeline
    timeline.push({
      phase: 'Immediate (1-4 weeks)',
      duration: '4 weeks',
      objectives: ['Address critical risks', 'Implement basic monitoring'],
      deliverables: ['Risk mitigation plan', 'Initial health dashboard']
    });

    timeline.push({
      phase: 'Short-term (1-3 months)',
      duration: '8 weeks',
      objectives: ['Improve test coverage', 'Enhance security posture', 'Code quality improvements'],
      deliverables: ['70%+ test coverage', 'Security audit completion', 'Quality gate implementation']
    });

    timeline.push({
      phase: 'Long-term (3-6 months)',
      duration: '12 weeks',
      objectives: ['Achieve excellence in all dimensions', 'Establish best practices'],
      deliverables: ['90%+ health scores', 'Process documentation', 'Team training completion']
    });

    return {
      immediate_actions: immediateActions,
      short_term_goals: shortTermGoals,
      long_term_vision: longTermVision,
      timeline
    };
  }

  private analyzeTrends(data: RawProjectData): TrendAnalysis {
    // Mock trend analysis
    const trends: ('improving' | 'stable' | 'declining')[] = ['improving', 'stable', 'declining'];
    const randomTrend = trends[Math.floor(Math.random() * trends.length)];

    const predictions: HealthPrediction[] = [
      {
        timeframe: '1 month',
        predicted_score: 75,
        confidence: 0.8,
        factors: ['Continued improvement efforts', 'New team practices']
      },
      {
        timeframe: '3 months',
        predicted_score: 82,
        confidence: 0.6,
        factors: ['Technology upgrades', 'Process improvements']
      }
    ];

    return {
      health_trend: randomTrend,
      velocity_trend: randomTrend,
      risk_trend: randomTrend === 'improving' ? 'improving' : 'stable',
      predictions
    };
  }

  private calculateOverallScore(dimensions: HealthDimensions): number {
    const weights = {
      code_quality: 0.25,
      architecture: 0.20,
      security: 0.20,
      performance: 0.10,
      maintainability: 0.10,
      test_coverage: 0.05,
      documentation: 0.05,
      ci_cd: 0.05
    };

    let totalScore = 0;
    let totalWeight = 0;

    Object.entries(dimensions).forEach(([key, value]) => {
      const weight = weights[key as keyof HealthDimensions] || 0;
      totalScore += value * weight;
      totalWeight += weight;
    });

    return totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;
  }
}