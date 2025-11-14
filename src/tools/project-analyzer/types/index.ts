// src/tools/project-analyzer/types/index.ts

export type AnalysisOperation = 'architecture' | 'quality' | 'dependencies' | 'metrics' | 'health' | 'insights';

export type AnalysisScope = 'full' | 'incremental' | 'module' | 'layer';

export type OutputFormat = 'summary' | 'detailed' | 'json' | 'markdown';

export interface AnalysisConfig {
  operation?: AnalysisOperation;
  scope?: AnalysisScope;
  target_modules?: string[];
  include_historical?: boolean;
  output_format?: OutputFormat;
  timeout?: number;
  memory_limit?: number;
  [key: string]: any;
}

export interface AnalysisResult {
  operation: AnalysisOperation;
  timestamp: Date;
  success: boolean;
  data: any;
  metadata: AnalysisMetadata;
  error?: string;
  partialResults?: any;
}

export interface AnalysisMetadata {
  analysisTime: number;
  dataPoints: number;
  cacheUsed: boolean;
  filesAnalyzed: number;
  scope: AnalysisScope;
  version: string;
}

export interface SourceFile {
  path: string;
  content: string;
  language: string;
  size: number;
  modified: Date;
  hash?: string;
}

export interface RawProjectData {
  files: SourceFile[];
  dependencies: DependencyInfo[];
  gitHistory?: GitCommit[];
  testResults?: TestResult[];
  [key: string]: any;
}

export interface DependencyInfo {
  name: string;
  version: string;
  type: 'runtime' | 'dev' | 'peer' | 'optional';
  source: string;
}

export interface GitCommit {
  hash: string;
  author: string;
  email: string;
  date: Date;
  message: string;
  changes: string[];
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export interface TestResult {
  file: string;
  tests: number;
  passed: number;
  failed: number;
  coverage: number;
  duration: number;
}

// Architecture Analysis Types
export interface ArchitectureAnalysis {
  layers: ArchitectureLayers;
  dependencies: DependencyGraph;
  patterns: DetectedPatterns;
  violations: ArchitectureViolations;
  health: ArchitectureHealth;
  recommendations: ArchitectureRecommendation[];
}

export interface ArchitectureLayers {
  presentation: string[];
  business: string[];
  data: string[];
  infrastructure: string[];
  unidentified: string[];
}

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  circularDependencies: CircularDependency[];
  strength: DependencyStrength;
}

export type DependencyStrength = 'loose' | 'moderate' | 'tight' | 'very_tight' | 'unknown';

export interface DependencyNode {
  id: string;
  layer: LayerType;
  dependencies: number;
}

export type LayerType = 'presentation' | 'business' | 'data' | 'infrastructure' | 'unidentified';

export interface DependencyEdge {
  from: string;
  to: string;
  type: 'direct' | 'transitive' | 'dev' | 'peer';
}

export interface CircularDependency {
  nodes: string[];
  description: string;
}

export interface DetectedPatterns {
  architectural: ArchitecturalPattern[];
  design: DesignPattern[];
  confidence: number;
}

export interface ArchitecturalPattern {
  name: string;
  confidence: number;
  evidence: string;
}

export interface DesignPattern {
  name: string;
  confidence: number;
  evidence: string;
}

export interface ArchitectureViolations {
  violations: ArchitectureViolation[];
}

export interface ArchitectureViolation {
  type: 'dependency_direction' | 'circular_dependency' | 'layer_violation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  locations: string[];
  recommendation: string;
}

export interface ArchitectureHealth {
  score: number;
  grade: ArchitectureGrade;
  factors: HealthFactor[];
}

export type ArchitectureGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface HealthFactor {
  factor: string;
  score: number;
  description: string;
}

export interface ArchitectureRecommendation {
  type: 'pattern_adoption' | 'refactoring' | 'violation_fix';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  title: string;
  description: string;
  effort: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
}

// Quality Analysis Types
export interface QualityAnalysis {
  files_analyzed: number;
  overall_score: number;
  dimensions: QualityDimensions;
  hotspots: QualityHotspot[];
  recommendations: QualityRecommendation[];
  detailed_results: FileQualityResult[];
}

export interface QualityDimensions {
  complexity: ComplexityMetrics;
  duplication: DuplicationMetrics;
  coverage: CoverageMetrics | null;
  maintainability: MaintainabilityMetrics;
}

export interface ComplexityMetrics {
  average: number;
  max: number;
  files_above_threshold: number;
}

export interface DuplicationMetrics {
  duplicated_lines: number;
  duplication_percentage: number;
  blocks: number;
}

export interface CoverageMetrics {
  average: number;
  min: number;
  files_below_threshold: number;
}

export interface MaintainabilityMetrics {
  index: number;
  grade: string;
  factors: MaintainabilityFactors;
}

export interface MaintainabilityFactors {
  complexity_impact: number;
  duplication_impact: number;
}

export interface QualityHotspot {
  file: string;
  issues: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

export interface QualityRecommendation {
  category: 'complexity' | 'coverage' | 'duplication' | 'hotspot';
  title: string;
  description: string;
  actions: string[];
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

export interface FileQualityResult {
  file_path: string;
  lines?: number;
  complexity?: number;
  duplicated_lines?: number;
  coverage?: number;
  errors?: string[];
}

// Dependencies Analysis Types
export interface DependenciesAnalysis {
  summary: DependenciesSummary;
  dependency_graph: DependencyGraphData;
  security_issues: SecurityIssue[];
  license_compatibility: LicenseCompatibility;
  unused_dependencies: string[];
  recommendations: DependencyRecommendation[];
}

export interface DependenciesSummary {
  total_dependencies: number;
  direct_dependencies: number;
  transitive_dependencies: number;
  vulnerabilities: VulnerabilityCount;
}

export interface VulnerabilityCount {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface DependencyGraphData {
  nodes: DependencyNodeData[];
  edges: DependencyEdgeData[];
}

export interface DependencyNodeData {
  id: string;
  version: string;
  type: string;
  vulnerabilities: number;
}

export interface DependencyEdgeData {
  from: string;
  to: string;
  type: string;
}

export interface SecurityIssue {
  package: string;
  version: string;
  vulnerability: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  fix_available: boolean;
  fix_version?: string;
  published_date: Date;
}

export interface LicenseCompatibility {
  compatible: boolean;
  incompatible_licenses: string[];
  recommendations: string[];
}

export interface DependencyRecommendation {
  type: 'security_update' | 'license_change' | 'removal' | 'version_update';
  package: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  effort: 'low' | 'medium' | 'high';
}

// Development Metrics Types
export interface DevelopmentMetrics {
  time_range: TimeRange;
  velocity: VelocityMetrics;
  quality: QualityMetricsSummary;
  productivity: ProductivityMetrics;
  stability: StabilityMetrics;
  insights: string[];
}

export interface TimeRange {
  start: Date;
  end: Date;
}

export interface VelocityMetrics {
  lines_added: number;
  lines_removed: number;
  net_change: number;
  commits_per_day: number;
  active_days: number;
  commits_per_week: number;
  largest_commit: number;
  average_commit_size: number;
}

export interface ProductivityMetrics {
  team_size: number;
  features_delivered: number;
  story_points_completed: number;
  average_velocity: number;
  throughput: number;
  cycle_time: number;
}

export interface StabilityMetrics {
  code_churn: number;
  refactoring_frequency: number;
  bug_introduction_rate: number;
  hotfix_percentage: number;
  revert_rate: number;
}

// Health Assessment Types
export interface HealthAssessment {
  overall_health_score: number;
  dimensions: HealthDimensions;
  risk_assessment: RiskAssessment;
  benchmark_comparison: BenchmarkComparison;
  improvement_roadmap: ImprovementRoadmap;
  trend_analysis: TrendAnalysis;
}

export interface HealthDimensions {
  code_quality: number;
  architecture: number;
  security: number;
  performance: number;
  maintainability: number;
  test_coverage: number;
  documentation: number;
  ci_cd: number;
}

export interface RiskAssessment {
  critical_risks: number;
  high_risks: number;
  medium_risks: number;
  low_risks: number;
  risk_factors: RiskFactor[];
}

export interface RiskFactor {
  category: string;
  level: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  impact: string;
  mitigation: string;
}

export interface BenchmarkComparison {
  vs_industry_average: string;
  vs_similar_projects: string;
  percentile_rank: number;
  strengths: string[];
  weaknesses: string[];
}

export interface ImprovementRoadmap {
  immediate_actions: ActionItem[];
  short_term_goals: string[];
  long_term_vision: string[];
  timeline: TimelineItem[];
}

export interface ActionItem {
  action: string;
  impact: 'low' | 'medium' | 'high' | 'critical';
  effort: 'low' | 'medium' | 'high';
  timeline: string;
  owner?: string;
}

export interface TimelineItem {
  phase: string;
  duration: string;
  objectives: string[];
  deliverables: string[];
}

export interface TrendAnalysis {
  health_trend: 'improving' | 'stable' | 'declining';
  velocity_trend: 'improving' | 'stable' | 'declining';
  risk_trend: 'improving' | 'stable' | 'declining';
  predictions: HealthPrediction[];
}

export interface HealthPrediction {
  timeframe: string;
  predicted_score: number;
  confidence: number;
  factors: string[];
}

// Intelligent Insights Types
export interface IntelligentInsights {
  patterns_identified: IdentifiedPattern[];
  anomalies_detected: DetectedAnomaly[];
  predictions: Prediction[];
  personalized_recommendations: RecommendationCategory[];
  knowledge_discovered: KnowledgeItem[];
  confidence_score: number;
}

export interface IdentifiedPattern {
  pattern: string;
  confidence: number;
  evidence: string;
  implications: string;
  category: 'architectural' | 'development' | 'quality' | 'organizational';
}

export interface DetectedAnomaly {
  anomaly: string;
  location?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  potential_cause: string;
  recommendation: string;
  confidence: number;
}

export interface Prediction {
  prediction: string;
  confidence: number;
  timeline: string;
  description: string;
  recommendation: string;
  impact: 'low' | 'medium' | 'high';
}

export interface RecommendationCategory {
  category: string;
  recommendations: PersonalizedRecommendation[];
}

export interface PersonalizedRecommendation {
  title: string;
  description: string;
  actions: string[];
  priority: 'low' | 'medium' | 'high' | 'urgent';
  effort: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  rationale: string;
}

export interface KnowledgeItem {
  insight: string;
  data: any;
  application: string;
  confidence: number;
  category: string;
}

// Base Analyzer Interface
export interface BaseAnalyzer {
  analyze(data: RawProjectData, config: AnalysisConfig): Promise<any>;
}

// Data Collector Interface
export interface DataCollector {
  collect(scope: AnalysisScope): Promise<CollectedData>;
}

export interface CollectedData {
  [key: string]: any;
}

// Cache Types
export interface CachedAnalysis {
  key: string;
  result: AnalysisResult;
  timestamp: number;
  ttl: number;
  metadata: CacheMetadata;
}

export interface CacheMetadata {
  files: string[];
  operation: AnalysisOperation;
  dataSize: number;
  complexity: number;
}

// Error Types
export class AnalysisError extends Error {
  constructor(
    message: string,
    public operation: AnalysisOperation,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'AnalysisError';
  }
}

// MCP Integration Types
export interface MCPToolResponse {
  content: MCPContent[];
  isError?: boolean;
}

export interface MCPContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
  resource?: MCPResource;
}

export interface MCPResource {
  uri: string;
  mimeType: string;
  text?: string;
  blob?: string;
}

// Configuration Types
export interface ProjectAnalyzerConfig {
  cache: CacheConfig;
  analysis: AnalysisConfig;
  collectors: CollectorConfig[];
  analyzers: AnalyzerConfig[];
  performance: PerformanceConfig;
  output: OutputConfig;
}

export interface CacheConfig {
  enabled: boolean;
  maxSize: number;
  ttl: number;
  persistent: boolean;
  cacheDir: string;
}

export interface CollectorConfig {
  name: string;
  enabled: boolean;
  priority: number;
  timeout: number;
  retryAttempts: number;
}

export interface AnalyzerConfig {
  name: string;
  enabled: boolean;
  priority: number;
  timeout: number;
  dependencies: string[];
}

export interface PerformanceConfig {
  maxConcurrentAnalyses: number;
  memoryLimit: number;
  timeout: number;
  enableProfiling: boolean;
}

export interface OutputConfig {
  defaultFormat: OutputFormat;
  includeMetadata: boolean;
  compression: boolean;
  maxOutputSize: number;
}

// Additional quality metrics interface
export interface QualityMetricsSummary {
  average_complexity: number;
  test_coverage: number;
  duplication_rate: number;
  maintainability_index: number;
}