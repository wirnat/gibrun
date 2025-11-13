// src/tools/project-analyzer/analyzers/InsightsAnalyzer.ts
import {
  RawProjectData,
  AnalysisConfig,
  IntelligentInsights,
  IdentifiedPattern,
  DetectedAnomaly,
  Prediction,
  RecommendationCategory,
  PersonalizedRecommendation,
  KnowledgeItem,
  BaseAnalyzer
} from '../types/index.js';

export class InsightsAnalyzer implements BaseAnalyzer {
  async analyze(data: RawProjectData, config: AnalysisConfig): Promise<IntelligentInsights> {
    const patterns = this.identifyPatterns(data);
    const anomalies = this.detectAnomalies(data);
    const predictions = this.generatePredictions(data);
    const recommendations = this.generatePersonalizedRecommendations(data);
    const knowledge = this.discoverKnowledge(data);

    // Calculate confidence score based on data quality and analysis completeness
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

    // Analyze architecture patterns
    const architecturePatterns = this.analyzeArchitecturePatterns(data);
    patterns.push(...architecturePatterns);

    // Analyze development patterns
    const developmentPatterns = this.analyzeDevelopmentPatterns(data);
    patterns.push(...developmentPatterns);

    // Analyze code quality patterns
    const qualityPatterns = this.analyzeQualityPatterns(data);
    patterns.push(...qualityPatterns);

    // Analyze organizational patterns
    const organizationalPatterns = this.analyzeOrganizationalPatterns(data);
    patterns.push(...organizationalPatterns);

    return patterns;
  }

  private analyzeArchitecturePatterns(data: RawProjectData): IdentifiedPattern[] {
    const patterns: IdentifiedPattern[] = [];
    const files = data.files || [];

    // Layered Architecture Pattern
    const hasLayers = this.detectLayeredArchitecture(files);
    if (hasLayers.detected) {
      patterns.push({
        pattern: 'Layered Architecture',
        confidence: hasLayers.confidence,
        evidence: hasLayers.evidence,
        implications: 'Good separation of concerns, easier maintenance and testing',
        category: 'architectural'
      });
    }

    // Microservices Pattern
    const microservicesPattern = this.detectMicroservicesPattern(files);
    if (microservicesPattern.detected) {
      patterns.push({
        pattern: 'Microservices Architecture',
        confidence: microservicesPattern.confidence,
        evidence: microservicesPattern.evidence,
        implications: 'Scalable architecture but increases complexity',
        category: 'architectural'
      });
    }

    // MVC Pattern
    const mvcPattern = this.detectMVCPattern(files);
    if (mvcPattern.detected) {
      patterns.push({
        pattern: 'MVC Pattern',
        confidence: mvcPattern.confidence,
        evidence: mvcPattern.evidence,
        implications: 'Clear separation between UI, business logic, and data',
        category: 'architectural'
      });
    }

    return patterns;
  }

  private detectLayeredArchitecture(files: any[]): { detected: boolean; confidence: number; evidence: string } {
    const presentationFiles = files.filter(f => this.isPresentationLayer(f.path)).length;
    const businessFiles = files.filter(f => this.isBusinessLayer(f.path)).length;
    const dataFiles = files.filter(f => this.isDataLayer(f.path)).length;

    const totalFiles = files.length;
    const layeredRatio = (presentationFiles + businessFiles + dataFiles) / totalFiles;

    return {
      detected: layeredRatio > 0.6,
      confidence: Math.min(1.0, layeredRatio),
      evidence: `${presentationFiles} presentation, ${businessFiles} business, ${dataFiles} data layer files detected`
    };
  }

  private detectMicroservicesPattern(files: any[]): { detected: boolean; confidence: number; evidence: string } {
    // Look for service directories, Docker files, API definitions
    const serviceDirs = files.filter(f => f.path?.includes('/services/') || f.path?.includes('/microservices/')).length;
    const dockerFiles = files.filter(f => f.path?.includes('Dockerfile') || f.path?.includes('docker-compose')).length;
    const apiFiles = files.filter(f => f.path?.includes('swagger') || f.path?.includes('openapi')).length;

    const indicators = serviceDirs + dockerFiles + apiFiles;
    const confidence = Math.min(1.0, indicators / 5);

    return {
      detected: indicators >= 2,
      confidence,
      evidence: `${serviceDirs} service directories, ${dockerFiles} Docker files, ${apiFiles} API specs found`
    };
  }

  private detectMVCPattern(files: any[]): { detected: boolean; confidence: number; evidence: string } {
    const controllerFiles = files.filter(f => f.path?.toLowerCase().includes('controller')).length;
    const modelFiles = files.filter(f => f.path?.toLowerCase().includes('model')).length;
    const viewFiles = files.filter(f => f.path?.toLowerCase().includes('view') || f.path?.toLowerCase().includes('template')).length;

    const mvcScore = (controllerFiles + modelFiles + viewFiles) / Math.max(files.length, 1);

    return {
      detected: controllerFiles > 0 && modelFiles > 0 && viewFiles > 0,
      confidence: Math.min(1.0, mvcScore * 3),
      evidence: `${controllerFiles} controllers, ${modelFiles} models, ${viewFiles} views detected`
    };
  }

  private isPresentationLayer(path: string): boolean {
    return path.includes('/ui/') || path.includes('/components/') || path.includes('/views/') ||
           path.includes('/public/') || path.includes('/templates/');
  }

  private isBusinessLayer(path: string): boolean {
    return path.includes('/services/') || path.includes('/usecases/') || path.includes('/business/') ||
           path.includes('/logic/') || path.includes('/handlers/');
  }

  private isDataLayer(path: string): boolean {
    return path.includes('/models/') || path.includes('/entities/') || path.includes('/repositories/') ||
           path.includes('/dao/') || path.includes('/database/');
  }

  private analyzeDevelopmentPatterns(data: RawProjectData): IdentifiedPattern[] {
    const patterns: IdentifiedPattern[] = [];
    const gitHistory = data.gitHistory || [];

    // Trunk-based Development
    const trunkBased = this.detectTrunkBasedDevelopment(gitHistory);
    if (trunkBased.detected) {
      patterns.push({
        pattern: 'Trunk-based Development',
        confidence: trunkBased.confidence,
        evidence: trunkBased.evidence,
        implications: 'Faster feedback, simpler merges, continuous integration',
        category: 'development'
      });
    }

    // Test-Driven Development
    const tdd = this.detectTDDPattern(data);
    if (tdd.detected) {
      patterns.push({
        pattern: 'Test-Driven Development',
        confidence: tdd.confidence,
        evidence: tdd.evidence,
        implications: 'Higher code quality, fewer bugs, better design',
        category: 'development'
      });
    }

    return patterns;
  }

  private detectTrunkBasedDevelopment(gitHistory: any[]): { detected: boolean; confidence: number; evidence: string } {
    if (gitHistory.length === 0) return { detected: false, confidence: 0, evidence: 'No git history available' };

    // Look for frequent commits to main branch
    const recentCommits = gitHistory.slice(0, 50); // Last 50 commits
    const avgCommitsPerDay = recentCommits.length / 30; // Rough estimate

    const confidence = Math.min(1.0, avgCommitsPerDay / 5); // 5 commits/day as threshold

    return {
      detected: avgCommitsPerDay >= 2,
      confidence,
      evidence: `${avgCommitsPerDay.toFixed(1)} average commits per day`
    };
  }

  private detectTDDPattern(data: RawProjectData): { detected: boolean; confidence: number; evidence: string } {
    const files = data.files || [];
    const testFiles = files.filter(f => f.path?.includes('.test.') || f.path?.includes('.spec.') ||
                                       f.path?.includes('/test') || f.path?.includes('/spec')).length;
    const sourceFiles = files.length;

    const testRatio = testFiles / Math.max(sourceFiles, 1);
    const confidence = Math.min(1.0, testRatio * 2); // 50% test files = high confidence

    return {
      detected: testRatio >= 0.3,
      confidence,
      evidence: `${testFiles} test files out of ${sourceFiles} total files (${(testRatio * 100).toFixed(1)}%)`
    };
  }

  private analyzeQualityPatterns(data: RawProjectData): IdentifiedPattern[] {
    const patterns: IdentifiedPattern[] = [];

    // Clean Code Pattern
    const cleanCode = this.detectCleanCodePattern(data);
    if (cleanCode.detected) {
      patterns.push({
        pattern: 'Clean Code Practices',
        confidence: cleanCode.confidence,
        evidence: cleanCode.evidence,
        implications: 'Maintainable, readable, and extensible codebase',
        category: 'quality'
      });
    }

    return patterns;
  }

  private detectCleanCodePattern(data: RawProjectData): { detected: boolean; confidence: number; evidence: string } {
    const files = data.files || [];
    let score = 0;
    let evidence: string[] = [];

    // Check for small functions/methods
    const smallFunctions = files.filter(f => {
      const lines = f.content?.split('\n').length || 0;
      return lines < 50; // Functions shorter than 50 lines
    }).length;
    if (smallFunctions > files.length * 0.5) {
      score += 0.3;
      evidence.push('Many small functions/methods');
    }

    // Check for meaningful names (rough estimate)
    const meaningfulNames = files.filter(f =>
      f.content?.includes('function ') || f.content?.includes('class ')
    ).length;
    if (meaningfulNames > files.length * 0.3) {
      score += 0.3;
      evidence.push('Good use of functions and classes');
    }

    // Check for comments (but not too many)
    const commentedFiles = files.filter(f =>
      f.content?.includes('//') || f.content?.includes('/*')
    ).length;
    if (commentedFiles > files.length * 0.2 && commentedFiles < files.length * 0.8) {
      score += 0.4;
      evidence.push('Balanced commenting');
    }

    return {
      detected: score >= 0.6,
      confidence: score,
      evidence: evidence.join(', ')
    };
  }

  private analyzeOrganizationalPatterns(data: RawProjectData): IdentifiedPattern[] {
    const patterns: IdentifiedPattern[] = [];
    const gitHistory = data.gitHistory || [];

    // Cross-functional Team
    const crossFunctional = this.detectCrossFunctionalTeam(gitHistory);
    if (crossFunctional.detected) {
      patterns.push({
        pattern: 'Cross-functional Team',
        confidence: crossFunctional.confidence,
        evidence: crossFunctional.evidence,
        implications: 'Better collaboration, faster delivery, shared ownership',
        category: 'organizational'
      });
    }

    return patterns;
  }

  private detectCrossFunctionalTeam(gitHistory: any[]): { detected: boolean; confidence: number; evidence: string } {
    const uniqueAuthors = new Set(gitHistory.map(commit => commit.author));
    const totalCommits = gitHistory.length;

    if (uniqueAuthors.size < 2) return { detected: false, confidence: 0, evidence: 'Single author detected' };

    // Calculate author distribution
    const authorCommits: { [key: string]: number } = {};
    gitHistory.forEach(commit => {
      authorCommits[commit.author] = (authorCommits[commit.author] || 0) + 1;
    });

    const avgCommitsPerAuthor = totalCommits / uniqueAuthors.size;
    const variance = Object.values(authorCommits).reduce((sum, commits) =>
      sum + Math.pow(commits - avgCommitsPerAuthor, 2), 0
    ) / uniqueAuthors.size;

    // Low variance indicates balanced contribution
    const balanceScore = Math.max(0, 1 - variance / (avgCommitsPerAuthor * avgCommitsPerAuthor));

    return {
      detected: balanceScore > 0.6,
      confidence: balanceScore,
      evidence: `${uniqueAuthors.size} contributors with balanced commit distribution`
    };
  }

  private detectAnomalies(data: RawProjectData): DetectedAnomaly[] {
    const anomalies: DetectedAnomaly[] = [];

    // Large files anomaly
    const largeFiles = this.detectLargeFiles(data.files || []);
    anomalies.push(...largeFiles);

    // High complexity anomaly
    const highComplexity = this.detectHighComplexity(data.files || []);
    anomalies.push(...highComplexity);

    // Commit anomalies
    const commitAnomalies = this.detectCommitAnomalies(data.gitHistory || []);
    anomalies.push(...commitAnomalies);

    return anomalies;
  }

  private detectLargeFiles(files: any[]): DetectedAnomaly[] {
    const anomalies: DetectedAnomaly[] = [];

    files.forEach(file => {
      const sizeKB = (file.size || 0) / 1024;
      if (sizeKB > 500) { // 500KB threshold
        anomalies.push({
          anomaly: 'Large File',
          location: file.path,
          severity: 'medium',
          description: `File is ${sizeKB.toFixed(1)}KB, consider splitting into smaller modules`,
          potential_cause: 'Accumulated functionality, lack of modularization',
          recommendation: 'Refactor into smaller, focused modules',
          confidence: 0.9
        });
      }
    });

    return anomalies;
  }

  private detectHighComplexity(files: any[]): DetectedAnomaly[] {
    const anomalies: DetectedAnomaly[] = [];

    files.forEach(file => {
      // Rough complexity estimate based on file size and content
      const lines = file.content?.split('\n').length || 0;
      const complexity = Math.log(lines + 1) * 10; // Rough estimate

      if (complexity > 50) {
        anomalies.push({
          anomaly: 'High Complexity',
          location: file.path,
          severity: 'high',
          description: `File has high complexity score (${complexity.toFixed(1)})`,
          potential_cause: 'Large functions, deep nesting, or accumulated responsibilities',
          recommendation: 'Break down into smaller functions or classes',
          confidence: 0.8
        });
      }
    });

    return anomalies;
  }

  private detectCommitAnomalies(gitHistory: any[]): DetectedAnomaly[] {
    const anomalies: DetectedAnomaly[] = [];

    if (gitHistory.length === 0) return anomalies;

    // Large commits
    const largeCommits = gitHistory.filter(commit =>
      (commit.insertions || 0) + (commit.deletions || 0) > 1000
    );

    largeCommits.forEach(commit => {
      anomalies.push({
        anomaly: 'Large Commit',
        severity: 'low',
        description: `Commit ${commit.hash.substring(0, 8)} has ${commit.insertions + commit.deletions} changes`,
        potential_cause: 'Batch changes, lack of frequent commits',
        recommendation: 'Break large changes into smaller, focused commits',
        confidence: 0.7
      });
    });

    return anomalies;
  }

  private generatePredictions(data: RawProjectData): Prediction[] {
    const predictions: Prediction[] = [];

    // Predict future complexity
    const complexityPrediction = this.predictComplexityTrend(data);
    if (complexityPrediction) predictions.push(complexityPrediction);

    // Predict development velocity
    const velocityPrediction = this.predictVelocityTrend(data);
    if (velocityPrediction) predictions.push(velocityPrediction);

    return predictions;
  }

  private predictComplexityTrend(data: RawProjectData): Prediction | null {
    const files = data.files || [];
    const avgComplexity = files.reduce((sum, file) => {
      const lines = file.content?.split('\n').length || 0;
      return sum + Math.log(lines + 1) * 10;
    }, 0) / Math.max(files.length, 1);

    const trend = avgComplexity > 30 ? 'increasing' : 'stable';

    return {
      prediction: `Code complexity will ${trend} over next 3 months`,
      confidence: 0.7,
      timeline: '3 months',
      description: `Current average complexity: ${avgComplexity.toFixed(1)}`,
      recommendation: trend === 'increasing' ? 'Implement complexity monitoring and refactoring' : 'Continue current practices',
      impact: trend === 'increasing' ? 'medium' : 'low'
    };
  }

  private predictVelocityTrend(data: RawProjectData): Prediction | null {
    const gitHistory = data.gitHistory || [];
    if (gitHistory.length < 10) return null;

    const recentCommits = gitHistory.slice(0, 30); // Last 30 commits
    const avgCommitsPerDay = recentCommits.length / 30;

    const trend = avgCommitsPerDay > 2 ? 'stable' : 'declining';

    return {
      prediction: `Development velocity will remain ${trend}`,
      confidence: 0.6,
      timeline: '2 months',
      description: `Current velocity: ${avgCommitsPerDay.toFixed(1)} commits/day`,
      recommendation: trend === 'declining' ? 'Investigate velocity blockers' : 'Maintain current momentum',
      impact: trend === 'declining' ? 'high' : 'low'
    };
  }

  private generatePersonalizedRecommendations(data: RawProjectData): RecommendationCategory[] {
    const categories: RecommendationCategory[] = [];

    // Architecture recommendations
    const architectureRecs = this.generateArchitectureRecommendations(data);
    if (architectureRecs.length > 0) {
      categories.push({
        category: 'Architecture',
        recommendations: architectureRecs
      });
    }

    // Quality recommendations
    const qualityRecs = this.generateQualityRecommendations(data);
    if (qualityRecs.length > 0) {
      categories.push({
        category: 'Code Quality',
        recommendations: qualityRecs
      });
    }

    // Process recommendations
    const processRecs = this.generateProcessRecommendations(data);
    if (processRecs.length > 0) {
      categories.push({
        category: 'Development Process',
        recommendations: processRecs
      });
    }

    return categories;
  }

  private generateArchitectureRecommendations(data: RawProjectData): PersonalizedRecommendation[] {
    const recommendations: PersonalizedRecommendation[] = [];
    const files = data.files || [];

    // Check for layered architecture
    const layerCheck = this.detectLayeredArchitecture(files);
    if (!layerCheck.detected) {
      recommendations.push({
        title: 'Consider Layered Architecture',
        description: 'Implement clear separation between presentation, business, and data layers',
        actions: [
          'Create separate directories for each layer',
          'Define clear interfaces between layers',
          'Implement dependency injection'
        ],
        priority: 'medium',
        effort: 'high',
        impact: 'high',
        rationale: 'Improves maintainability and testability'
      });
    }

    return recommendations;
  }

  private generateQualityRecommendations(data: RawProjectData): PersonalizedRecommendation[] {
    const recommendations: PersonalizedRecommendation[] = [];
    const files = data.files || [];

    // Check test coverage
    const testFiles = files.filter(f => f.path?.includes('.test.') || f.path?.includes('.spec.')).length;
    const testRatio = testFiles / Math.max(files.length, 1);

    if (testRatio < 0.3) {
      recommendations.push({
        title: 'Increase Test Coverage',
        description: 'Current test coverage is below recommended levels',
        actions: [
          'Write unit tests for critical functions',
          'Implement integration tests',
          'Set up automated testing pipeline'
        ],
        priority: 'high',
        effort: 'medium',
        impact: 'high',
        rationale: 'Reduces bugs and improves code reliability'
      });
    }

    return recommendations;
  }

  private generateProcessRecommendations(data: RawProjectData): PersonalizedRecommendation[] {
    const recommendations: PersonalizedRecommendation[] = [];
    const gitHistory = data.gitHistory || [];

    // Check commit frequency
    if (gitHistory.length > 0) {
      const recentCommits = gitHistory.slice(0, 30);
      const avgCommitsPerDay = recentCommits.length / 30;

      if (avgCommitsPerDay < 1) {
        recommendations.push({
          title: 'Increase Commit Frequency',
          description: 'Low commit frequency may indicate issues with development workflow',
          actions: [
            'Commit small, focused changes',
            'Use feature branches for larger changes',
            'Implement continuous integration'
          ],
          priority: 'medium',
          effort: 'low',
          impact: 'medium',
          rationale: 'Improves code review and reduces integration conflicts'
        });
      }
    }

    return recommendations;
  }

  private discoverKnowledge(data: RawProjectData): KnowledgeItem[] {
    const knowledge: KnowledgeItem[] = [];

    // Discover technology stack
    const techStack = this.discoverTechnologyStack(data);
    knowledge.push(...techStack);

    // Discover development practices
    const practices = this.discoverDevelopmentPractices(data);
    knowledge.push(...practices);

    return knowledge;
  }

  private discoverTechnologyStack(data: RawProjectData): KnowledgeItem[] {
    const knowledge: KnowledgeItem[] = [];
    const files = data.files || [];
    const dependencies = data.dependencies || [];

    // Detect primary language
    const languageCounts: { [key: string]: number } = {};
    files.forEach(file => {
      const lang = file.language || 'unknown';
      languageCounts[lang] = (languageCounts[lang] || 0) + 1;
    });

    const primaryLanguage = Object.entries(languageCounts)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'unknown';

    knowledge.push({
      insight: `Primary programming language: ${primaryLanguage}`,
      data: { language: primaryLanguage, fileCount: languageCounts[primaryLanguage] },
      application: 'Technology stack identification',
      confidence: 0.9,
      category: 'technology'
    });

    // Detect frameworks
    const frameworks = this.detectFrameworks(files, dependencies);
    frameworks.forEach(framework => {
      knowledge.push({
        insight: `Framework detected: ${framework.name}`,
        data: framework,
        application: 'Framework identification and best practices',
        confidence: framework.confidence,
        category: 'technology'
      });
    });

    return knowledge;
  }

  private detectFrameworks(files: any[], dependencies: any[]): Array<{ name: string; confidence: number; version?: string }> {
    const frameworks: Array<{ name: string; confidence: number; version?: string }> = [];

    // Check package.json for Node.js frameworks
    const packageJson = files.find(f => f.path === 'package.json');
    if (packageJson && packageJson.content) {
      try {
        const pkg = JSON.parse(packageJson.content);

        // React
        if (pkg.dependencies?.['react'] || pkg.devDependencies?.['react']) {
          frameworks.push({
            name: 'React',
            confidence: 0.95,
            version: pkg.dependencies?.['react'] || pkg.devDependencies?.['react']
          });
        }

        // Express
        if (pkg.dependencies?.['express']) {
          frameworks.push({
            name: 'Express.js',
            confidence: 0.95,
            version: pkg.dependencies?.['express']
          });
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }

    // Check for Go frameworks
    const goFiles = files.filter(f => f.language === 'go');
    if (goFiles.length > 0) {
      const hasGin = goFiles.some(f => f.content?.includes('"github.com/gin-gonic/gin"'));
      if (hasGin) {
        frameworks.push({ name: 'Gin (Go)', confidence: 0.9 });
      }
    }

    return frameworks;
  }

  private discoverDevelopmentPractices(data: RawProjectData): KnowledgeItem[] {
    const knowledge: KnowledgeItem[] = [];
    const gitHistory = data.gitHistory || [];

    // Analyze commit message patterns
    const commitPatterns = this.analyzeCommitPatterns(gitHistory);
    knowledge.push({
      insight: `Commit message patterns: ${commitPatterns.style}`,
      data: commitPatterns,
      application: 'Development workflow optimization',
      confidence: 0.8,
      category: 'process'
    });

    return knowledge;
  }

  private analyzeCommitPatterns(gitHistory: any[]): { style: string; conventional: boolean; detailed: boolean } {
    if (gitHistory.length === 0) {
      return { style: 'unknown', conventional: false, detailed: false };
    }

    const messages = gitHistory.slice(0, 50).map(commit => commit.message);

    // Check for conventional commits
    const conventionalCommits = messages.filter(msg =>
      msg.match(/^(feat|fix|docs|style|refactor|test|chore)(\(.+\))?:/)
    ).length;

    const conventional = conventionalCommits > messages.length * 0.5;

    // Check for detailed messages
    const detailedMessages = messages.filter(msg => msg.length > 50).length;
    const detailed = detailedMessages > messages.length * 0.3;

    let style = 'informal';
    if (conventional && detailed) style = 'conventional and detailed';
    else if (conventional) style = 'conventional';
    else if (detailed) style = 'detailed';

    return { style, conventional, detailed };
  }

  private calculateConfidenceScore(data: RawProjectData): number {
    let score = 0.5; // Base confidence

    // Increase confidence based on data completeness
    if (data.files && data.files.length > 0) score += 0.2;
    if (data.dependencies && data.dependencies.length > 0) score += 0.1;
    if (data.gitHistory && data.gitHistory.length > 0) score += 0.2;

    // Increase confidence based on data quality
    if (data.files && data.files.every(f => f.language && f.content)) score += 0.1;

    return Math.min(1.0, score);
  }
}