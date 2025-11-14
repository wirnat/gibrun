import {
  RawProjectData,
  AnalysisConfig,
  IntelligentInsights,
  IdentifiedPattern,
  DetectedAnomaly,
  Prediction,
  PersonalizedRecommendation,
  KnowledgeItem,
  BaseAnalyzer
} from '../types/index.js';

import { ArchitecturePatternDetector } from './pattern-detectors/ArchitecturePatternDetector.js';
import { DevelopmentPatternDetector } from './pattern-detectors/DevelopmentPatternDetector.js';
import { QualityPatternDetector } from './pattern-detectors/QualityPatternDetector.js';

export class ModularInsightsAnalyzer implements BaseAnalyzer {
  async analyze(data: RawProjectData, config: AnalysisConfig): Promise<IntelligentInsights> {
    const patterns = this.identifyPatterns(data);
    const anomalies = this.detectAnomalies(data);
    const predictions = this.generatePredictions(data);
    const recommendations = this.generatePersonalizedRecommendations(data);
    const knowledge = this.discoverKnowledge(data);

    const confidenceScore = this.calculateConfidenceScore(data);

    return {
      patterns_identified: patterns,
      anomalies_detected: anomalies,
      predictions,
      personalized_recommendations: recommendations,
      knowledge_discovered: knowledge,
      confidence_score: confidenceScore
    };
  }

  private identifyPatterns(data: RawProjectData): IdentifiedPattern[] {
    const patterns: IdentifiedPattern[] = [];

    // Analyze architecture patterns using dedicated detector
    const architecturePatterns = ArchitecturePatternDetector.analyzeArchitecturePatterns(data);
    patterns.push(...architecturePatterns);

    // Analyze development patterns using dedicated detector
    const developmentPatterns = DevelopmentPatternDetector.analyzeDevelopmentPatterns(data);
    patterns.push(...developmentPatterns);

    // Analyze quality patterns using dedicated detector
    const qualityPatterns = QualityPatternDetector.analyzeQualityPatterns(data);
    patterns.push(...qualityPatterns);

    // Analyze organizational patterns (could be extracted to separate detector)
    const organizationalPatterns = this.analyzeOrganizationalPatterns(data);
    patterns.push(...organizationalPatterns);

    return patterns;
  }

  private analyzeOrganizationalPatterns(data: RawProjectData): IdentifiedPattern[] {
    const patterns: IdentifiedPattern[] = [];
    const gitHistory = data.gitHistory || [];

    // Cross-functional team pattern
    const crossFunctional = this.detectCrossFunctionalTeam(gitHistory);
    if (crossFunctional.detected) {
      patterns.push({
        pattern: 'Cross-functional Team',
        confidence: crossFunctional.confidence,
        evidence: crossFunctional.evidence,
        implications: 'Collaborative development environment with diverse skill sets',
        category: 'organizational'
      });
    }

    return patterns;
  }

  private detectCrossFunctionalTeam(gitHistory: any[]): { detected: boolean; confidence: number; evidence: string } {
    if (gitHistory.length === 0) {
      return { detected: false, confidence: 0, evidence: 'No git history available' };
    }

    const authors = new Set(gitHistory.map(commit => commit.author));
    const files = gitHistory.flatMap(commit => commit.files_changed || []);
    const fileTypes = new Set(files.map(file => file.split('.').pop()));

    // Cross-functional indicators: multiple authors, diverse file types
    const authorDiversity = authors.size / Math.max(gitHistory.length * 0.1, 1);
    const fileTypeDiversity = fileTypes.size / Math.max(files.length * 0.01, 1);

    const indicators = authorDiversity + fileTypeDiversity;
    const confidence = Math.min(1.0, indicators / 4);

    return {
      detected: indicators >= 1.0,
      confidence,
      evidence: `${authors.size} authors, ${fileTypes.size} file types modified`
    };
  }

  private detectAnomalies(data: RawProjectData): DetectedAnomaly[] {
    const anomalies: DetectedAnomaly[] = [];
    const files = data.files || [];

    // Large files anomaly
    const largeFiles = this.detectLargeFiles(files);
    anomalies.push(...largeFiles);

    // High complexity anomaly
    const highComplexity = this.detectHighComplexity(files);
    anomalies.push(...highComplexity);

    // Commit anomalies
    const commitAnomalies = this.detectCommitAnomalies(data.gitHistory || []);
    anomalies.push(...commitAnomalies);

    return anomalies;
  }

  private detectLargeFiles(files: any[]): DetectedAnomaly[] {
    const anomalies: DetectedAnomaly[] = [];
    const largeFiles = files.filter(f => f.size > 1000000); // 1MB threshold

    largeFiles.forEach(file => {
      anomalies.push({
        anomaly: 'Large File',
        location: file.path,
        severity: 'medium',
        description: `File exceeds recommended size limit (${(file.size / 1024 / 1024).toFixed(2)}MB)`,
        potential_cause: 'Accumulated code, embedded assets, or monolithic structure',
        recommendation: 'Consider splitting into smaller modules or extracting embedded resources',
        confidence: 0.8
      });
    });

    return anomalies;
  }

  private detectHighComplexity(files: any[]): DetectedAnomaly[] {
    const anomalies: DetectedAnomaly[] = [];

    files.forEach(file => {
      if (file.content && file.language === 'typescript') {
        const complexity = this.calculateFileComplexity(file.content);
        if (complexity > 50) { // High complexity threshold
          anomalies.push({
            anomaly: 'High Complexity',
            location: file.path,
            severity: 'high',
            description: `File has high complexity score (${complexity})`,
            potential_cause: 'Large functions, deep nesting, or complex logic',
            recommendation: 'Break down into smaller functions or extract utility modules',
            confidence: 0.9
          });
        }
      }
    });

    return anomalies;
  }

  private calculateFileComplexity(content: string): number {
    let complexity = 1;
    const patterns = [
      /\bif\s*\(/g, /\bfor\s*\(/g, /\bwhile\s*\(/g, /\bswitch\s*\(/g,
      /\bcatch\s*\(/g, /\b&&/g, /\b\|\|/g, /\?/g
    ];

    patterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) complexity += matches.length;
    });

    return complexity;
  }

  private detectCommitAnomalies(gitHistory: any[]): DetectedAnomaly[] {
    const anomalies: DetectedAnomaly[] = [];

    if (gitHistory.length === 0) return anomalies;

    // Check for commits with too many files changed
    const largeCommits = gitHistory.filter(commit => (commit.filesChanged || []).length > 50);

    largeCommits.forEach(commit => {
      anomalies.push({
        anomaly: 'Large Commit',
        location: commit.hash,
        severity: 'medium',
        description: `Commit modifies ${commit.filesChanged?.length || 0} files`,
        potential_cause: 'Bulk changes, refactoring, or poor commit practices',
        recommendation: 'Break down into smaller, focused commits',
        confidence: 0.7
      });
    });

    return anomalies;
  }

  private generatePredictions(data: RawProjectData): Prediction[] {
    const predictions: Prediction[] = [];

    // Complexity trend prediction
    const complexityPrediction = this.predictComplexityTrend(data);
    if (complexityPrediction) {
      predictions.push(complexityPrediction);
    }

    // Velocity trend prediction
    const velocityPrediction = this.predictVelocityTrend(data);
    if (velocityPrediction) {
      predictions.push(velocityPrediction);
    }

    return predictions;
  }

  private predictComplexityTrend(data: RawProjectData): Prediction | null {
    const files = data.files || [];
    const avgComplexity = files.reduce((sum, file) => {
      return sum + (file.content ? this.calculateFileComplexity(file.content) : 0);
    }, 0) / Math.max(files.length, 1);

    if (avgComplexity > 30) {
      return {
        prediction: 'Increasing complexity may impact maintainability',
        confidence: Math.min(1.0, avgComplexity / 100),
        timeline: '3-6 months',
        description: 'Complexity is trending upward and may impact future maintainability',
        recommendation: 'Implement code reviews, add complexity monitoring, and plan refactoring sprints',
        impact: 'medium' as const
      };
    }

    return null;
  }

  private predictVelocityTrend(data: RawProjectData): Prediction | null {
    const gitHistory = data.gitHistory || [];

    if (gitHistory.length < 10) return null;

    const recentCommits = gitHistory.slice(0, 10);
    const avgCommitsPerWeek = recentCommits.length / 2; // Assuming 2 weeks of data

    if (avgCommitsPerWeek < 5) {
      return {
        prediction: 'Development velocity may be declining',
        confidence: 0.7,
        timeline: '1-2 months',
        description: 'Commit frequency has decreased, indicating potential development slowdown',
        recommendation: 'Identify bottlenecks, improve processes, and consider team expansion',
        impact: 'medium' as const
      };
    }

    return null;
  }

  private generatePersonalizedRecommendations(data: RawProjectData): any[] {
    const recommendations: any[] = [];

    // Architecture recommendations
    const architectureRecs = this.generateArchitectureRecommendations(data);
    recommendations.push(...architectureRecs);

    // Quality recommendations
    const qualityRecs = this.generateQualityRecommendations(data);
    recommendations.push(...qualityRecs);

    // Process recommendations
    const processRecs = this.generateProcessRecommendations(data);
    recommendations.push(...processRecs);

    return recommendations;
  }

  private generateArchitectureRecommendations(data: RawProjectData): PersonalizedRecommendation[] {
    const recommendations: PersonalizedRecommendation[] = [];
    const files = data.files || [];

    const largeFiles = files.filter(f => f.size > 500000);
    if (largeFiles.length > 0) {
      recommendations.push({
        title: 'Break down large files',
        description: `${largeFiles.length} files exceed 500KB. Consider modularization.`,
        actions: ['Split large files into smaller modules', 'Extract utility functions', 'Consider lazy loading'],
        priority: 'high' as const,
        effort: 'medium' as const,
        impact: 'high' as const,
        rationale: 'Large files reduce maintainability and increase complexity'
      });
    }

    return recommendations;
  }

  private generateQualityRecommendations(data: RawProjectData): PersonalizedRecommendation[] {
    const recommendations: PersonalizedRecommendation[] = [];
    const files = data.files || [];

    const highComplexityFiles = files.filter(f =>
      f.content && this.calculateFileComplexity(f.content) > 40
    );

    if (highComplexityFiles.length > 0) {
      recommendations.push({
        title: 'Reduce code complexity',
        description: `${highComplexityFiles.length} files have high complexity scores.`,
        actions: ['Break down complex functions', 'Extract utility functions', 'Add code comments'],
        priority: 'high' as const,
        effort: 'medium' as const,
        impact: 'high' as const,
        rationale: 'High complexity reduces maintainability and increases bug likelihood'
      });
    }

    return recommendations;
  }

  private generateProcessRecommendations(data: RawProjectData): PersonalizedRecommendation[] {
    const recommendations: PersonalizedRecommendation[] = [];
    const gitHistory = data.gitHistory || [];

    const largeCommits = gitHistory.filter(commit => (commit.filesChanged || 0) > 20);
    if (largeCommits.length > gitHistory.length * 0.1) { // More than 10% large commits
      recommendations.push({
        title: 'Improve commit practices',
        description: 'Many commits modify many files. Consider smaller, focused commits.',
        actions: ['Break down large commits', 'Use feature branches', 'Implement pre-commit hooks'],
        priority: 'medium' as const,
        effort: 'low' as const,
        impact: 'medium' as const,
        rationale: 'Smaller commits improve code review quality and debugging'
      });
    }

    return recommendations;
  }

  private discoverKnowledge(data: RawProjectData): KnowledgeItem[] {
    const knowledge: KnowledgeItem[] = [];

    // Technology stack knowledge
    const techStack = this.discoverTechnologyStack(data);
    knowledge.push(...techStack);

    // Development practices knowledge
    const practices = this.discoverDevelopmentPractices(data);
    knowledge.push(...practices);

    return knowledge;
  }

  private discoverTechnologyStack(data: RawProjectData): KnowledgeItem[] {
    const knowledge: KnowledgeItem[] = [];
    const files = data.files || [];

    const languages = new Set(files.map(f => f.language).filter(Boolean));
    const frameworks = this.detectFrameworks(files, []);

    knowledge.push({
      insight: `Project uses: ${Array.from(languages).join(', ')}`,
      data: { languages: Array.from(languages) },
      application: 'Technology stack identification for development planning',
      confidence: 1.0,
      category: 'Technology Stack'
    });

    if (frameworks.length > 0) {
      knowledge.push({
        insight: `Detected frameworks: ${frameworks.map(f => f.name).join(', ')}`,
        data: { frameworks: frameworks.map(f => f.name) },
        application: 'Framework identification for dependency management',
        confidence: 0.8,
        category: 'Technology Stack'
      });
    }

    return knowledge;
  }

  private detectFrameworks(files: any[], dependencies: any[]): Array<{ name: string; confidence: number; version?: string }> {
    const frameworks: Array<{ name: string; confidence: number; version?: string }> = [];

    // Simple framework detection based on file patterns
    const frameworkPatterns = {
      'React': { patterns: ['import React', 'from "react"', 'from \'react\''], confidence: 0.9 },
      'Vue': { patterns: ['import Vue', 'from "vue"', 'from \'vue\''], confidence: 0.9 },
      'Angular': { patterns: ['import { Component', '@Component'], confidence: 0.8 },
      'Express': { patterns: ['express()', 'require("express")'], confidence: 0.8 },
      'NestJS': { patterns: ['@Module', '@Controller'], confidence: 0.9 }
    };

    files.forEach(file => {
      if (file.content) {
        Object.entries(frameworkPatterns).forEach(([name, config]) => {
          const hasPattern = config.patterns.some(pattern => file.content.includes(pattern));
          if (hasPattern) {
            frameworks.push({ name, confidence: config.confidence });
          }
        });
      }
    });

    // Remove duplicates and sort by confidence
    const uniqueFrameworks = frameworks.filter((framework, index, self) =>
      index === self.findIndex(f => f.name === framework.name)
    ).sort((a, b) => b.confidence - a.confidence);

    return uniqueFrameworks;
  }

  private discoverDevelopmentPractices(data: RawProjectData): KnowledgeItem[] {
    const knowledge: KnowledgeItem[] = [];
    const gitHistory = data.gitHistory || [];

    if (gitHistory.length > 0) {
      const commitAnalysis = this.analyzeCommitPatterns(gitHistory);

      knowledge.push({
        insight: `Commits follow ${commitAnalysis.style} style with ${commitAnalysis.conventional ? 'conventional' : 'free-form'} format`,
        data: { commitStyle: commitAnalysis.style, conventional: commitAnalysis.conventional },
        application: 'Understanding team commit conventions for consistency',
        confidence: 0.7,
        category: 'Development Practices'
      });

      knowledge.push({
        insight: `${commitAnalysis.detailed ? 'Detailed' : 'Basic'} commit messages suggest ${commitAnalysis.detailed ? 'good' : 'variable'} documentation practices`,
        data: { detailedMessages: commitAnalysis.detailed },
        application: 'Assessing code review and documentation quality',
        confidence: 0.6,
        category: 'Development Practices'
      });
    }

    return knowledge;
  }

  private analyzeCommitPatterns(gitHistory: any[]): { style: string; conventional: boolean; detailed: boolean } {
    if (gitHistory.length === 0) {
      return { style: 'unknown', conventional: false, detailed: false };
    }

    const messages = gitHistory.map(commit => commit.message || '').filter(msg => msg.length > 0);

    // Check for conventional commits
    const conventionalPattern = /^[a-z]+(\([a-z-]+\))?: /;
    const conventionalCommits = messages.filter(msg => conventionalPattern.test(msg.toLowerCase()));

    // Check for detailed messages
    const detailedMessages = messages.filter(msg => msg.length > 50);

    const conventionalRatio = conventionalCommits.length / messages.length;
    const detailedRatio = detailedMessages.length / messages.length;

    return {
      style: conventionalRatio > 0.5 ? 'conventional' : 'free-form',
      conventional: conventionalRatio > 0.5,
      detailed: detailedRatio > 0.3
    };
  }

  private calculateConfidenceScore(data: RawProjectData): number {
    let score = 0.5; // Base score

    // Data completeness factors
    if (data.files && data.files.length > 0) score += 0.2;
    if (data.gitHistory && data.gitHistory.length > 0) score += 0.2;
    if (data.dependencies && data.dependencies.length > 0) score += 0.1;

    // Analysis quality factors
    const files = data.files || [];
    if (files.some(f => f.content && f.content.length > 1000)) score += 0.1;

    return Math.min(1.0, score);
  }
}