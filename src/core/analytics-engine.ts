import { DuckDBManager } from '@core/duckdb-manager.js';
import { logInfo, logError } from '@/services/logger-service.js';
import { promisifyRun, promisifyAll, promisifyGet } from '@utils/duckdb-promisify.js';

export interface TimeRange {
  amount: number;
  unit: 'days' | 'weeks' | 'months' | 'hours';
}

export interface MetricTrend {
  period: string;
  avg_value: number;
  min_value: number;
  max_value: number;
  sample_count: number;
  std_dev: number;
  trend_direction?: 'increasing' | 'decreasing' | 'stable';
}

export interface CorrelationResult {
  correlation_coefficient: number;
  sample_size: number;
  avg_metric_a: number;
  avg_metric_b: number;
  strength: 'strong_positive' | 'moderate_positive' | 'weak_positive' | 'no_correlation' | 'weak_negative' | 'moderate_negative' | 'strong_negative';
  significance: 'significant' | 'insufficient_data';
  confidence_interval?: [number, number];
}

export interface TrendAnalysis {
  overall_trend: 'increasing' | 'decreasing' | 'stable' | 'volatile';
  trend_strength: number; // 0-1
  seasonality_detected: boolean;
  change_points: Date[];
  forecast_next_period?: number;
  confidence_level: number;
}

export interface StatisticalSummary {
  count: number;
  mean: number;
  median: number;
  std_dev: number;
  min: number;
  max: number;
  quartiles: [number, number, number]; // Q1, Q2, Q3
  skewness: number;
  kurtosis: number;
}

export interface MetricComparison {
  metric_a: string;
  metric_b: string;
  correlation: CorrelationResult;
  trend_comparison: 'similar' | 'diverging' | 'opposite';
  relative_change: number; // percentage difference in trends
}

/**
 * Advanced Analytics Engine for time-series metrics analysis
 * Provides correlation analysis, trend analysis, and statistical calculations
 */
export class AnalyticsEngine {
  constructor(private duckdbManager: DuckDBManager) {}

  /**
   * Get metrics trends over time with advanced analytics
   */
  async getMetricsTrends(
    metricType: string,
    timeRange: TimeRange,
    groupBy: 'day' | 'week' | 'month' = 'day',
    filePath?: string
  ): Promise<MetricTrend[]> {
    const connection = this.duckdbManager.getConnection();

    try {
      let sql = `
        SELECT
          DATE_TRUNC('${groupBy}', recorded_at) as period,
          AVG(metric_value) as avg_value,
          MIN(metric_value) as min_value,
          MAX(metric_value) as max_value,
          COUNT(*) as sample_count,
          STDDEV(metric_value) as std_dev
        FROM metrics
        WHERE metric_type = ?
          AND recorded_at >= NOW() - INTERVAL '${timeRange.amount} ${timeRange.unit}'
      `;

      const params: any[] = [metricType];

      if (filePath) {
        sql += ' AND file_path = ?';
        params.push(filePath);
      }

      sql += ' GROUP BY DATE_TRUNC(?, recorded_at) ORDER BY period';
      params.push(groupBy);

      const result = await promisifyAll(connection, sql, params);
      const trends = result.map((row: any) => ({
        period: row.period,
        avg_value: row.avg_value,
        min_value: row.min_value,
        max_value: row.max_value,
        sample_count: row.sample_count,
        std_dev: row.std_dev || 0,
        trend_direction: this.calculateTrendDirection(result, row.period)
      }));

      logInfo('Metrics trends analysis completed', {
        metricType,
        timeRange,
        groupBy,
        resultsCount: trends.length
      });

      return trends;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError('Metrics trends analysis failed', { error: errorMessage, metricType, timeRange });
      throw new Error(`Metrics trends analysis failed: ${errorMessage}`);
    } finally {
      connection.close();
    }
  }

  /**
   * Calculate correlation between two metrics
   */
  async getCorrelationAnalysis(
    metricA: string,
    metricB: string,
    timeRange: TimeRange,
    filePath?: string
  ): Promise<CorrelationResult> {
    const connection = this.duckdbManager.getConnection();

    try {
      let sql = `
        SELECT
          CORR(m1.metric_value, m2.metric_value) as correlation_coefficient,
          COUNT(*) as sample_size,
          AVG(m1.metric_value) as avg_metric_a,
          AVG(m2.metric_value) as avg_metric_b,
          STDDEV(m1.metric_value) as std_a,
          STDDEV(m2.metric_value) as std_b
        FROM metrics m1
        JOIN metrics m2 ON m1.file_path = m2.file_path
          AND DATE_TRUNC('day', m1.recorded_at) = DATE_TRUNC('day', m2.recorded_at)
        WHERE m1.metric_type = ?
          AND m2.metric_type = ?
          AND m1.recorded_at >= NOW() - INTERVAL '${timeRange.amount} ${timeRange.unit}'
      `;

      const params: any[] = [metricA, metricB];

      if (filePath) {
        sql += ' AND m1.file_path = ?';
        params.push(filePath);
      }

      const result = await promisifyAll(connection, sql, params);

      if (result.length === 0) {
        throw new Error('No data available for correlation analysis');
      }

      const data = result[0];
      const correlation = data.correlation_coefficient || 0;
      const sampleSize = data.sample_size || 0;

      const strength = this.interpretCorrelation(correlation);
      const significance = sampleSize > 30 ? 'significant' : 'insufficient_data';

      // Calculate confidence interval for correlation
      const confidenceInterval = sampleSize > 10 ?
        this.calculateCorrelationConfidenceInterval(correlation, sampleSize) : undefined;

      const correlationResult: CorrelationResult = {
        correlation_coefficient: correlation,
        sample_size: sampleSize,
        avg_metric_a: data.avg_metric_a || 0,
        avg_metric_b: data.avg_metric_b || 0,
        strength,
        significance,
        confidence_interval: confidenceInterval
      };

      logInfo('Correlation analysis completed', {
        metricA,
        metricB,
        correlation: correlation.toFixed(3),
        strength,
        significance
      });

      return correlationResult;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError('Correlation analysis failed', { error: errorMessage, metricA, metricB });
      throw new Error(`Correlation analysis failed: ${errorMessage}`);
    } finally {
      connection.close();
    }
  }

  /**
   * Perform trend analysis with forecasting
   */
  async analyzeTrends(
    metricType: string,
    timeRange: TimeRange,
    filePath?: string
  ): Promise<TrendAnalysis> {
    const trends = await this.getMetricsTrends(metricType, timeRange, 'day', filePath);

    if (trends.length < 3) {
      return {
        overall_trend: 'stable',
        trend_strength: 0,
        seasonality_detected: false,
        change_points: [],
        confidence_level: 0
      };
    }

    // Calculate linear trend
    const { slope, rSquared } = this.calculateLinearTrend(trends);

    // Detect seasonality (simple pattern recognition)
    const seasonalityDetected = this.detectSeasonality(trends);

    // Find change points using simple threshold
    const changePoints = this.detectChangePoints(trends);

    // Simple forecasting using linear regression
    const forecast = this.linearForecast(trends, slope);

    // Determine overall trend
    const overallTrend = this.determineOverallTrend(slope, rSquared, trends);

    return {
      overall_trend: overallTrend,
      trend_strength: Math.abs(rSquared),
      seasonality_detected: seasonalityDetected,
      change_points: changePoints,
      forecast_next_period: forecast,
      confidence_level: rSquared
    };
  }

  /**
   * Get statistical summary of metrics
   */
  async getStatisticalSummary(
    metricType: string,
    timeRange: TimeRange,
    filePath?: string
  ): Promise<StatisticalSummary> {
    const connection = this.duckdbManager.getConnection();

    try {
      let sql = `
        SELECT
          COUNT(*) as count,
          AVG(metric_value) as mean,
          MEDIAN(metric_value) as median,
          STDDEV(metric_value) as std_dev,
          MIN(metric_value) as min,
          MAX(metric_value) as max,
          QUANTILE_CONT(0.25)(metric_value) as q1,
          QUANTILE_CONT(0.75)(metric_value) as q3
        FROM metrics
        WHERE metric_type = ?
          AND recorded_at >= NOW() - INTERVAL '${timeRange.amount} ${timeRange.unit}'
      `;

      const params: any[] = [metricType];

      if (filePath) {
        sql += ' AND file_path = ?';
        params.push(filePath);
      }

      const result = await promisifyAll(connection, sql, params);

      if (result.length === 0) {
        throw new Error('No data available for statistical summary');
      }

      const data = result[0];

      // Calculate skewness and kurtosis
      const values = await this.getMetricValues(metricType, timeRange, filePath);
      const skewness = this.calculateSkewness(values);
      const kurtosis = this.calculateKurtosis(values);

      return {
        count: data.count,
        mean: data.mean,
        median: data.median,
        std_dev: data.std_dev || 0,
        min: data.min,
        max: data.max,
        quartiles: [data.q1, data.median, data.q3],
        skewness,
        kurtosis
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError('Statistical summary failed', { error: errorMessage, metricType });
      throw new Error(`Statistical summary failed: ${errorMessage}`);
    } finally {
      connection.close();
    }
  }

  /**
   * Compare trends between two metrics
   */
  async compareMetrics(
    metricA: string,
    metricB: string,
    timeRange: TimeRange,
    filePath?: string
  ): Promise<MetricComparison> {
    const correlation = await this.getCorrelationAnalysis(metricA, metricB, timeRange, filePath);

    const trendA = await this.analyzeTrends(metricA, timeRange, filePath);
    const trendB = await this.analyzeTrends(metricB, timeRange, filePath);

    // Determine trend comparison
    const trendComparison = this.compareTrends(trendA, trendB);

    // Calculate relative change
    const relativeChange = this.calculateRelativeChange(trendA, trendB);

    return {
      metric_a: metricA,
      metric_b: metricB,
      correlation,
      trend_comparison: trendComparison,
      relative_change: relativeChange
    };
  }

  /**
   * Get metrics overview dashboard data
   */
  async getMetricsOverview(timeRange: TimeRange): Promise<{
    total_metrics: number;
    metric_types: string[];
    top_trending: Array<{ type: string; trend: TrendAnalysis }>;
    correlations: CorrelationResult[];
    summary_stats: Record<string, StatisticalSummary>;
  }> {
    const connection = this.duckdbManager.getConnection();

    try {
      // Get basic stats
      const basicStats = await promisifyAll(connection, `
        SELECT
          COUNT(*) as total_metrics,
          COUNT(DISTINCT metric_type) as unique_types
        FROM metrics
        WHERE recorded_at >= NOW() - INTERVAL '${timeRange.amount} ${timeRange.unit}'
      `);

      // Get metric types
      const typesResult = await promisifyAll(connection, `
        SELECT DISTINCT metric_type
        FROM metrics
        WHERE recorded_at >= NOW() - INTERVAL '${timeRange.amount} ${timeRange.unit}'
        ORDER BY metric_type
      `);

      const metricTypes = typesResult.map((row: any) => row.metric_type);

      // Analyze top trending metrics
      const topTrending: Array<{ type: string; trend: TrendAnalysis }> = [];
      for (const type of metricTypes.slice(0, 5)) { // Top 5
        try {
          const trend = await this.analyzeTrends(type, timeRange);
          topTrending.push({ type, trend });
        } catch (error) {
          // Skip failed trend analysis
        }
      }

      // Calculate correlations between key metrics
      const correlations: CorrelationResult[] = [];
      if (metricTypes.length >= 2) {
        for (let i = 0; i < Math.min(metricTypes.length, 3); i++) {
          for (let j = i + 1; j < Math.min(metricTypes.length, 4); j++) {
            try {
              const correlation = await this.getCorrelationAnalysis(
                metricTypes[i],
                metricTypes[j],
                timeRange
              );
              correlations.push(correlation);
            } catch (error) {
              // Skip failed correlation analysis
            }
          }
        }
      }

      // Get summary stats for each metric type
      const summaryStats: Record<string, StatisticalSummary> = {};
      for (const type of metricTypes) {
        try {
          summaryStats[type] = await this.getStatisticalSummary(type, timeRange);
        } catch (error) {
          // Skip failed summary
        }
      }

      return {
        total_metrics: basicStats[0].total_metrics,
        metric_types: metricTypes,
        top_trending: topTrending,
        correlations,
        summary_stats: summaryStats
      };

    } finally {
      connection.close();
    }
  }

  // ===== Private Helper Methods =====

  private calculateTrendDirection(trends: MetricTrend[], currentPeriod: string): 'increasing' | 'decreasing' | 'stable' {
    const currentIndex = trends.findIndex(t => t.period === currentPeriod);
    if (currentIndex < 1) return 'stable';

    const current = trends[currentIndex].avg_value;
    const previous = trends[currentIndex - 1].avg_value;
    const change = (current - previous) / previous;

    if (Math.abs(change) < 0.05) return 'stable'; // 5% threshold
    return change > 0 ? 'increasing' : 'decreasing';
  }

  private interpretCorrelation(coeff: number): CorrelationResult['strength'] {
    const absCoeff = Math.abs(coeff);
    if (absCoeff >= 0.8) return coeff > 0 ? 'strong_positive' : 'strong_negative';
    if (absCoeff >= 0.6) return coeff > 0 ? 'moderate_positive' : 'moderate_negative';
    if (absCoeff >= 0.3) return coeff > 0 ? 'weak_positive' : 'weak_negative';
    return 'no_correlation';
  }

  private calculateCorrelationConfidenceInterval(correlation: number, sampleSize: number): [number, number] {
    // Fisher transformation for confidence interval
    const z = 0.5 * Math.log((1 + correlation) / (1 - correlation));
    const se = 1 / Math.sqrt(sampleSize - 3);
    const zCritical = 1.96; // 95% confidence

    const lowerZ = z - zCritical * se;
    const upperZ = z + zCritical * se;

    const lowerR = (Math.exp(2 * lowerZ) - 1) / (Math.exp(2 * lowerZ) + 1);
    const upperR = (Math.exp(2 * upperZ) - 1) / (Math.exp(2 * upperZ) + 1);

    return [lowerR, upperR];
  }

  private calculateLinearTrend(trends: MetricTrend[]): { slope: number; rSquared: number } {
    const n = trends.length;
    const x = trends.map((_, i) => i);
    const y = trends.map(t => t.avg_value);

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumYY = y.reduce((sum, yi) => sum + yi * yi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    const yMean = sumY / n;
    const ssRes = y.reduce((sum, yi, i) => {
      const predicted = slope * x[i] + intercept;
      return sum + (yi - predicted) ** 2;
    }, 0);
    const ssTot = y.reduce((sum, yi) => sum + (yi - yMean) ** 2, 0);
    const rSquared = 1 - (ssRes / ssTot);

    return { slope, rSquared: isNaN(rSquared) ? 0 : rSquared };
  }

  private detectSeasonality(trends: MetricTrend[]): boolean {
    if (trends.length < 7) return false;

    // Simple seasonality detection based on pattern repetition
    const values = trends.map(t => t.avg_value);
    const diffs = [];

    for (let i = 7; i < values.length; i++) {
      diffs.push(Math.abs(values[i] - values[i - 7]));
    }

    const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    const avgValue = values.reduce((a, b) => a + b, 0) / values.length;

    return avgDiff < avgValue * 0.1; // 10% threshold
  }

  private detectChangePoints(trends: MetricTrend[]): Date[] {
    if (trends.length < 5) return [];

    const changePoints: Date[] = [];
    const threshold = 0.2; // 20% change threshold

    for (let i = 1; i < trends.length - 1; i++) {
      const prev = trends[i - 1].avg_value;
      const curr = trends[i].avg_value;
      const next = trends[i + 1].avg_value;

      const change1 = Math.abs(curr - prev) / prev;
      const change2 = Math.abs(next - curr) / curr;

      if (change1 > threshold && change2 > threshold) {
        changePoints.push(new Date(trends[i].period));
      }
    }

    return changePoints;
  }

  private linearForecast(trends: MetricTrend[], slope: number): number {
    const lastValue = trends[trends.length - 1].avg_value;
    return lastValue + slope;
  }

  private determineOverallTrend(slope: number, rSquared: number, trends: MetricTrend[]): TrendAnalysis['overall_trend'] {
    if (Math.abs(slope) < 0.01 || rSquared < 0.1) return 'stable';
    if (Math.abs(slope) > Math.abs(trends[0].avg_value) * 0.05) return 'volatile';
    return slope > 0 ? 'increasing' : 'decreasing';
  }

  private async getMetricValues(metricType: string, timeRange: TimeRange, filePath?: string): Promise<number[]> {
    const connection = this.duckdbManager.getConnection();

    try {
      let sql = `
        SELECT metric_value
        FROM metrics
        WHERE metric_type = ?
          AND recorded_at >= NOW() - INTERVAL '${timeRange.amount} ${timeRange.unit}'
        ORDER BY recorded_at
      `;

      const params: any[] = [metricType];

      if (filePath) {
        sql += ' AND file_path = ?';
        params.push(filePath);
      }

      const result = await promisifyAll(connection, sql, params);
      return result.map((row: any) => row.metric_value);

    } finally {
      connection.close();
    }
  }

  private calculateSkewness(values: number[]): number {
    const n = values.length;
    if (n < 3) return 0;

    const mean = values.reduce((a, b) => a + b, 0) / n;
    const stdDev = Math.sqrt(values.reduce((sum, val) => sum + (val - mean) ** 2, 0) / n);

    const skewness = values.reduce((sum, val) => sum + ((val - mean) / stdDev) ** 3, 0) / n;
    return skewness;
  }

  private calculateKurtosis(values: number[]): number {
    const n = values.length;
    if (n < 4) return 0;

    const mean = values.reduce((a, b) => a + b, 0) / n;
    const stdDev = Math.sqrt(values.reduce((sum, val) => sum + (val - mean) ** 2, 0) / n);

    const kurtosis = values.reduce((sum, val) => sum + ((val - mean) / stdDev) ** 4, 0) / n - 3;
    return kurtosis;
  }

  private compareTrends(trendA: TrendAnalysis, trendB: TrendAnalysis): MetricComparison['trend_comparison'] {
    const directionA = trendA.overall_trend;
    const directionB = trendB.overall_trend;

    if (directionA === directionB) return 'similar';
    if ((directionA === 'increasing' && directionB === 'decreasing') ||
        (directionA === 'decreasing' && directionB === 'increasing')) {
      return 'opposite';
    }
    return 'diverging';
  }

  private calculateRelativeChange(trendA: TrendAnalysis, trendB: TrendAnalysis): number {
    // Simplified relative change calculation
    const strengthA = trendA.trend_strength;
    const strengthB = trendB.trend_strength;

    if (strengthB === 0) return strengthA > 0 ? 100 : 0;

    return ((strengthA - strengthB) / strengthB) * 100;
  }
}