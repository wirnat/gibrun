// src/tools/project-analyzer/analyzers/MetricsAnalyzer.ts
import {
  RawProjectData,
  AnalysisConfig,
  DevelopmentMetrics,
  TimeRange,
  VelocityMetrics,
  ProductivityMetrics,
  StabilityMetrics,
  BaseAnalyzer
} from '@analyzer-types/index.js';

export class MetricsAnalyzer implements BaseAnalyzer {
  async analyze(data: RawProjectData, config: AnalysisConfig): Promise<DevelopmentMetrics> {
    const gitHistory = data.gitHistory || [];
    const timeRange = this.calculateTimeRange(gitHistory, config);

    // Calculate velocity metrics
    const velocity = this.calculateVelocityMetrics(gitHistory, timeRange);

    // Calculate quality metrics summary
    const quality = this.calculateQualityMetrics(data);

    // Calculate productivity metrics
    const productivity = this.calculateProductivityMetrics(gitHistory, timeRange);

    // Calculate stability metrics
    const stability = this.calculateStabilityMetrics(gitHistory, timeRange);

    // Generate insights
    const insights = this.generateInsights(velocity, quality, productivity, stability);

    return {
      time_range: timeRange,
      velocity,
      quality,
      productivity,
      stability,
      insights
    };
  }

  private calculateTimeRange(gitHistory: any[], config: AnalysisConfig): TimeRange {
    if (gitHistory.length === 0) {
      const now = new Date();
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { start: monthAgo, end: now };
    }

    const dates = gitHistory.map(commit => commit.date.getTime());
    const start = new Date(Math.min(...dates));
    const end = new Date(Math.max(...dates));

    return { start, end };
  }

  private calculateVelocityMetrics(gitHistory: any[], timeRange: TimeRange): VelocityMetrics {
    const commits = gitHistory.filter(commit =>
      commit.date >= timeRange.start && commit.date <= timeRange.end
    );

    const totalCommits = commits.length;
    const totalAdditions = commits.reduce((sum, commit) => sum + (commit.insertions || 0), 0);
    const totalDeletions = commits.reduce((sum, commit) => sum + (commit.deletions || 0), 0);
    const netChange = totalAdditions - totalDeletions;

    // Calculate time span in days
    const timeSpanMs = timeRange.end.getTime() - timeRange.start.getTime();
    const timeSpanDays = Math.max(timeSpanMs / (1000 * 60 * 60 * 24), 1);

    const commitsPerDay = totalCommits / timeSpanDays;
    const activeDays = new Set(
      commits.map(commit => commit.date.toDateString())
    ).size;

    const commitsPerWeek = commitsPerDay * 7;

    // Calculate average and largest commit
    const commitSizes = commits.map(commit => (commit.insertions || 0) + (commit.deletions || 0));
    const averageCommitSize = commitSizes.length > 0
      ? commitSizes.reduce((a, b) => a + b, 0) / commitSizes.length
      : 0;
    const largestCommit = commitSizes.length > 0 ? Math.max(...commitSizes) : 0;

    return {
      lines_added: totalAdditions,
      lines_removed: totalDeletions,
      net_change: netChange,
      commits_per_day: commitsPerDay,
      active_days: activeDays,
      commits_per_week: commitsPerWeek,
      largest_commit: largestCommit,
      average_commit_size: averageCommitSize
    };
  }

  private calculateQualityMetrics(data: RawProjectData): any {
    // This would integrate with quality analysis results
    // For now, return mock data
    return {
      average_complexity: 8.5,
      test_coverage: 75.2,
      duplication_rate: 12.3,
      maintainability_index: 68.4
    };
  }

  private calculateProductivityMetrics(gitHistory: any[], timeRange: TimeRange): ProductivityMetrics {
    const commits = gitHistory.filter(commit =>
      commit.date >= timeRange.start && commit.date <= timeRange.end
    );

    // Estimate team size based on unique authors
    const uniqueAuthors = new Set(commits.map(commit => commit.author));
    const teamSize = Math.max(uniqueAuthors.size, 1);

    // Estimate features delivered (rough approximation)
    const featuresDelivered = Math.floor(commits.length / 5); // Assume 5 commits per feature

    // Estimate story points (rough estimation)
    const storyPointsCompleted = featuresDelivered * 8; // Assume 8 points per feature

    // Calculate average velocity (commits per day per person)
    const timeSpanMs = timeRange.end.getTime() - timeRange.start.getTime();
    const timeSpanDays = Math.max(timeSpanMs / (1000 * 60 * 60 * 24), 1);
    const averageVelocity = commits.length / timeSpanDays / teamSize;

    // Calculate throughput (features per week)
    const throughput = (featuresDelivered / timeSpanDays) * 7;

    // Estimate cycle time (days per feature)
    const cycleTime = timeSpanDays / Math.max(featuresDelivered, 1);

    return {
      team_size: teamSize,
      features_delivered: featuresDelivered,
      story_points_completed: storyPointsCompleted,
      average_velocity: averageVelocity,
      throughput,
      cycle_time: cycleTime
    };
  }

  private calculateStabilityMetrics(gitHistory: any[], timeRange: TimeRange): StabilityMetrics {
    const commits = gitHistory.filter(commit =>
      commit.date >= timeRange.start && commit.date <= timeRange.end
    );

    // Calculate code churn (lines changed / total lines)
    const totalLinesChanged = commits.reduce((sum, commit) =>
      sum + (commit.insertions || 0) + (commit.deletions || 0), 0
    );

    // Estimate total lines of code (rough approximation)
    const estimatedTotalLines = 10000; // This would be calculated from actual codebase
    const codeChurn = (totalLinesChanged / estimatedTotalLines) * 100;

    // Calculate refactoring frequency (percentage of commits that are refactoring)
    const refactoringCommits = commits.filter(commit =>
      commit.message.toLowerCase().includes('refactor') ||
      commit.message.toLowerCase().includes('cleanup') ||
      commit.deletions > commit.insertions * 2 // More deletions than additions
    ).length;

    const refactoringFrequency = commits.length > 0 ? (refactoringCommits / commits.length) * 100 : 0;

    // Estimate bug introduction rate (rough approximation)
    const bugFixCommits = commits.filter(commit =>
      commit.message.toLowerCase().includes('fix') ||
      commit.message.toLowerCase().includes('bug')
    ).length;

    const bugIntroductionRate = commits.length > 0 ? (bugFixCommits / commits.length) * 100 : 0;

    // Calculate hotfix percentage
    const hotfixCommits = commits.filter(commit =>
      commit.message.toLowerCase().includes('hotfix') ||
      commit.message.toLowerCase().includes('emergency')
    ).length;

    const hotfixPercentage = commits.length > 0 ? (hotfixCommits / commits.length) * 100 : 0;

    // Calculate revert rate
    const revertCommits = commits.filter(commit =>
      commit.message.toLowerCase().includes('revert')
    ).length;

    const revertRate = commits.length > 0 ? (revertCommits / commits.length) * 100 : 0;

    return {
      code_churn: codeChurn,
      refactoring_frequency: refactoringFrequency,
      bug_introduction_rate: bugIntroductionRate,
      hotfix_percentage: hotfixPercentage,
      revert_rate: revertRate
    };
  }

  private generateInsights(
    velocity: VelocityMetrics,
    quality: any,
    productivity: ProductivityMetrics,
    stability: StabilityMetrics
  ): string[] {
    const insights: string[] = [];

    // Velocity insights
    if (velocity.commits_per_day > 10) {
      insights.push('High commit frequency indicates active development but may suggest need for better commit practices');
    } else if (velocity.commits_per_day < 1) {
      insights.push('Low commit frequency may indicate slow development pace or large batch commits');
    }

    // Quality insights
    if (quality.test_coverage < 70) {
      insights.push('Test coverage below 70% increases risk of undetected bugs');
    }

    if (quality.maintainability_index < 50) {
      insights.push('Low maintainability index suggests code may be difficult to maintain and extend');
    }

    // Productivity insights
    if (productivity.average_velocity > 5) {
      insights.push('High development velocity indicates productive team but monitor for quality trade-offs');
    }

    // Stability insights
    if (stability.hotfix_percentage > 20) {
      insights.push('High percentage of hotfixes suggests stability issues or rushed deployments');
    }

    if (stability.revert_rate > 10) {
      insights.push('High revert rate indicates potential issues with code review or testing processes');
    }

    // Overall insights
    if (velocity.net_change > 10000) {
      insights.push('Large net change indicates significant development activity - ensure proper testing');
    }

    if (insights.length === 0) {
      insights.push('Development metrics are within normal ranges - continue monitoring for trends');
    }

    return insights;
  }
}