# DuckDB Project Indexing Feature

## Overview

DuckDB Project Indexing adalah fitur untuk menggantikan sistem indexing berbasis JSON dengan analytical database DuckDB untuk performa 10x lebih cepat dan kemampuan analytics yang advanced.

## 🎯 Problem Statement

### Current Challenges
- JSON-based indexing lambat untuk query kompleks
- Tidak ada analytics time-series yang efisien
- Sulit melakukan aggregasi dan correlation analysis
- Memory usage tinggi untuk large codebases
- Tidak ada full-text search capabilities
- Incremental updates tidak reliable

### Solution
DuckDB Project Indexing menggunakan analytical database untuk:
- SQL-based querying dengan performa tinggi
- Time-series analytics untuk metrics trends
- Full-text search untuk symbols dan documentation
- ACID transactions untuk reliable updates
- Columnar storage untuk efficient analytics
- Complex queries untuk deep insights

## 🔧 Technical Architecture

### Database Schema

#### Core Tables
```sql
-- Files table: File structure and metadata
CREATE TABLE files (
    file_path VARCHAR PRIMARY KEY,
    file_name VARCHAR,
    directory VARCHAR,
    extension VARCHAR,
    language VARCHAR,
    size_bytes INTEGER,
    lines_count INTEGER,
    last_modified TIMESTAMP,
    checksum VARCHAR,
    is_binary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Symbols table: Functions, classes, variables
CREATE TABLE symbols (
    id VARCHAR PRIMARY KEY,
    name VARCHAR NOT NULL,
    type VARCHAR NOT NULL,
    file_path VARCHAR NOT NULL REFERENCES files(file_path),
    line_number INTEGER,
    signature VARCHAR,
    visibility VARCHAR,
    complexity INTEGER,
    language VARCHAR,
    metadata JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Metrics table: Time-series code metrics
CREATE TABLE metrics (
    id VARCHAR PRIMARY KEY,
    file_path VARCHAR REFERENCES files(file_path),
    symbol_id VARCHAR REFERENCES symbols(id),
    metric_type VARCHAR,
    metric_name VARCHAR,
    metric_value DOUBLE,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    analysis_version VARCHAR
);

-- Analysis cache table
CREATE TABLE analysis_cache (
    cache_key VARCHAR PRIMARY KEY,
    analysis_type VARCHAR,
    parameters JSON,
    result JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    is_valid BOOLEAN DEFAULT TRUE
);
```

#### Advanced Tables
```sql
-- Dependencies table
CREATE TABLE dependencies (
    id VARCHAR PRIMARY KEY,
    from_file VARCHAR REFERENCES files(file_path),
    to_file VARCHAR,
    dependency_type VARCHAR,
    symbol_name VARCHAR,
    is_external BOOLEAN DEFAULT FALSE,
    package_name VARCHAR,
    version VARCHAR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Git history table
CREATE TABLE git_history (
    commit_hash VARCHAR PRIMARY KEY,
    author VARCHAR,
    email VARCHAR,
    date TIMESTAMP,
    message VARCHAR,
    files_changed INTEGER,
    insertions INTEGER,
    deletions INTEGER,
    commit_type VARCHAR,
    branch VARCHAR,
    tags VARCHAR[]
);

-- TODOs table
CREATE TABLE todos (
    id VARCHAR PRIMARY KEY,
    text VARCHAR NOT NULL,
    type VARCHAR,
    category VARCHAR,
    file_path VARCHAR REFERENCES files(file_path),
    line_number INTEGER,
    priority VARCHAR,
    status VARCHAR DEFAULT 'open',
    assignee VARCHAR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);
```

### DuckDB Manager Class

```typescript
export class DuckDBProjectIndexManager {
  private db: Database.Database;
  private dbPath: string;

  constructor(projectRoot: string) {
    this.dbPath = path.join(projectRoot, '.gibrun', 'project_index.db');
    this.db = new Database(this.dbPath);
    this.initializeSchema();
  }

  async querySymbols(searchTerm: string, type?: string): Promise<SymbolInfo[]> {
    const connection = this.db.connect();

    try {
      let query = `
        SELECT s.*, f.language, f.last_modified
        FROM symbols s
        JOIN files f ON s.file_path = f.file_path
        WHERE s.name ILIKE ?
      `;

      const params = [`%${searchTerm}%`];

      if (type) {
        query += ' AND s.type = ?';
        params.push(type);
      }

      query += ' ORDER BY s.name LIMIT 50';

      const result = await connection.all(query, ...params);
      return result.map(row => ({
        id: row.id,
        name: row.name,
        type: row.type,
        file_path: row.file_path,
        line_number: row.line_number,
        signature: row.signature,
        language: row.language,
        last_modified: row.last_modified
      }));
    } finally {
      connection.close();
    }
  }

  async getMetricsOverTime(
    filePath?: string,
    metricType?: string,
    days: number = 30
  ): Promise<MetricData[]> {
    const connection = this.db.connect();

    try {
      let query = `
        SELECT
          DATE_TRUNC('day', recorded_at) as date,
          AVG(metric_value) as avg_value,
          MIN(metric_value) as min_value,
          MAX(metric_value) as max_value,
          COUNT(*) as sample_count
        FROM metrics
        WHERE recorded_at >= NOW() - INTERVAL '${days} days'
      `;

      const params: any[] = [];

      if (filePath) {
        query += ' AND file_path = ?';
        params.push(filePath);
      }

      if (metricType) {
        query += ' AND metric_type = ?';
        params.push(metricType);
      }

      query += ' GROUP BY DATE_TRUNC(\'day\', recorded_at) ORDER BY date';

      const result = await connection.all(query, ...params);
      return result.map(row => ({
        date: row.date,
        avg_value: row.avg_value,
        min_value: row.min_value,
        max_value: row.max_value,
        sample_count: row.sample_count
      }));
    } finally {
      connection.close();
    }
  }
}
```

## 📋 MCP Tools

### Core Indexing Tools

#### `index_initialize`
Initialize DuckDB index for project.

**Parameters:**
```typescript
{
  "project_path": "/path/to/project",
  "force_rebuild": false,
  "include_patterns": ["**/*.go", "**/*.js", "**/*.ts"],
  "exclude_patterns": ["node_modules/**", ".git/**"]
}
```

#### `index_update`
Update index with changed files.

**Parameters:**
```typescript
{
  "project_path": "/path/to/project",
  "changed_files": ["/path/to/changed/file.go"],
  "force_full_update": false
}
```

#### `index_query`
Execute SQL queries against the index.

**Parameters:**
```typescript
{
  "project_path": "/path/to/project",
  "query": "SELECT * FROM symbols WHERE type = 'function' AND complexity > 10",
  "limit": 100
}
```

### Symbol Search Tools

#### `index_search_symbols`
Search for symbols with advanced filtering.

**Parameters:**
```typescript
{
  "project_path": "/path/to/project",
  "search_term": "authenticate",
  "type": "function",
  "language": "go",
  "min_complexity": 5,
  "limit": 50
}
```

#### `index_find_references`
Find all references to a symbol.

**Parameters:**
```typescript
{
  "project_path": "/path/to/project",
  "symbol_name": "UserService",
  "include_external": false
}
```

### Analytics Tools

#### `index_analytics_trends`
Analyze metrics trends over time.

**Parameters:**
```typescript
{
  "project_path": "/path/to/project",
  "metric_type": "complexity",
  "time_range": "30d",
  "group_by": "week",
  "include_forecast": true
}
```

#### `index_analytics_correlation`
Find correlations between different metrics.

**Parameters:**
```typescript
{
  "project_path": "/path/to/project",
  "metric_a": "complexity",
  "metric_b": "test_coverage",
  "time_range": "90d"
}
```

### Maintenance Tools

#### `index_validate`
Validate index integrity and freshness.

**Parameters:**
```typescript
{
  "project_path": "/path/to/project",
  "check_checksums": true,
  "max_age_hours": 24
}
```

#### `index_cleanup`
Clean up old or invalid index data.

**Parameters:**
```typescript
{
  "project_path": "/path/to/project",
  "older_than_days": 30,
  "remove_invalid": true
}
```

## 🎯 Detection & Indexing Logic

### File Processing Pipeline
```typescript
async function processFile(filePath: string): Promise<void> {
  // 1. Read file content
  const content = await fs.readFile(filePath, 'utf8');

  // 2. Calculate checksum
  const checksum = crypto.createHash('sha256').update(content).digest('hex');

  // 3. Check if file changed
  const existingChecksum = await getFileChecksum(filePath);
  if (existingChecksum === checksum && !forceUpdate) {
    return; // Skip if unchanged
  }

  // 4. Update file metadata
  await updateFileMetadata(filePath, content, checksum);

  // 5. Extract and index symbols
  const symbols = await extractSymbols(filePath, content);
  await indexSymbols(symbols);

  // 6. Extract dependencies
  const dependencies = await extractDependencies(filePath, content);
  await indexDependencies(dependencies);

  // 7. Calculate and store metrics
  const metrics = await calculateMetrics(filePath, content);
  await storeMetrics(metrics);
}
```

### Symbol Extraction
```typescript
async function extractSymbols(filePath: string, content: string): Promise<SymbolInfo[]> {
  const language = detectLanguage(filePath);
  const symbols: SymbolInfo[] = [];

  switch (language) {
    case 'go':
      symbols.push(...extractGoSymbols(content));
      break;
    case 'typescript':
    case 'javascript':
      symbols.push(...extractTypeScriptSymbols(content));
      break;
    case 'python':
      symbols.push(...extractPythonSymbols(content));
      break;
  }

  return symbols.map(symbol => ({
    ...symbol,
    file_path: filePath,
    id: generateSymbolId(filePath, symbol.name, symbol.line_number)
  }));
}
```

## 📊 Performance Benefits

### Query Performance Comparison
```
Operation              | JSON Files | DuckDB      | Improvement
-----------------------|------------|-------------|------------
Symbol search          | 500ms      | 50ms        | 10x faster
File dependency lookup | 200ms      | 20ms        | 10x faster
Metrics aggregation    | 1000ms     | 100ms       | 10x faster
Time-series queries    | 2000ms     | 200ms       | 10x faster
Complex analytics      | N/A        | 500ms       | New capability
Full-text search       | N/A        | 100ms       | New capability
```

### Storage Efficiency
- **Columnar Storage**: Better compression untuk metrics data
- **Indexing**: Fast lookups tanpa full scans
- **ACID Transactions**: Reliable updates
- **Concurrent Access**: Multiple readers tanpa conflicts

## 🔗 Integration Points

### Project Analyzer Integration
- Metrics data stored in DuckDB untuk historical analysis
- Analysis results cached in DuckDB untuk faster retrieval
- Incremental analysis menggunakan index untuk change detection

### IDE Integration
- VS Code extension queries DuckDB untuk instant symbol search
- Real-time updates ke index saat file changes
- Dashboard data served dari DuckDB queries

### CI/CD Integration
- Automated index updates dalam build pipelines
- Historical metrics tracking untuk trend analysis
- Performance regression detection

## 🧪 Testing Strategy

### Unit Tests
- Database schema creation dan validation
- Query execution correctness
- Symbol extraction accuracy
- Metrics calculation validation

### Integration Tests
- Full indexing pipeline
- Incremental updates
- Concurrent access handling
- Error recovery scenarios

### Performance Tests
- Query performance benchmarks
- Memory usage monitoring
- Large codebase handling
- Concurrent user simulation

## 📈 Success Metrics

### Performance Metrics
- **Query Speed**: All queries <100ms untuk medium projects
- **Indexing Speed**: Initial index <30 seconds untuk 1000 files
- **Incremental Updates**: Change detection <5 seconds
- **Memory Usage**: <256MB untuk large codebases

### Accuracy Metrics
- **Symbol Detection**: >95% symbols detected correctly
- **Dependency Analysis**: >90% dependencies mapped accurately
- **Metrics Calculation**: >98% metrics calculated correctly

### Reliability Metrics
- **Data Integrity**: 100% ACID compliance
- **Concurrent Access**: Support 10+ concurrent readers
- **Error Recovery**: Automatic recovery dari corruption
- **Backup/Restore**: <5 minutes untuk large indexes

## 🚀 Implementation Roadmap

### Phase 1: Core Database (2 weeks)
- [ ] DuckDB integration dan basic connection
- [ ] Schema creation untuk core tables
- [ ] Basic CRUD operations
- [ ] Migration dari JSON ke DuckDB

### Phase 2: Query Engine (3 weeks)
- [ ] Symbol search implementation
- [ ] Metrics analytics queries
- [ ] Full-text search setup
- [ ] Query optimization

### Phase 3: Advanced Features (3 weeks)
- [ ] Time-series analytics
- [ ] Complex correlation queries
- [ ] Incremental updates
- [ ] Performance optimization

### Phase 4: Production Ready (2 weeks)
- [ ] Comprehensive testing
- [ ] Error handling dan recovery
- [ ] Documentation completion
- [ ] Performance benchmarking

## 💡 Usage Examples

### Advanced Symbol Search
```bash
# Find authentication functions with high complexity
gibrun index query "
  SELECT s.name, s.file_path, s.complexity, m.metric_value as coverage
  FROM symbols s
  LEFT JOIN metrics m ON s.id = m.symbol_id
    AND m.metric_type = 'coverage'
  WHERE s.name ILIKE '%auth%'
    AND s.type = 'function'
    AND s.complexity > 5
  ORDER BY s.complexity DESC
"
```

### Project Health Trends
```bash
# Show complexity trends over time
gibrun index analytics trends \
  --metric complexity \
  --time-range 90d \
  --group-by week
```

### Code Quality Correlation
```bash
# Analyze correlation between complexity and test coverage
gibrun index analytics correlation \
  --metric-a complexity \
  --metric-b test_coverage \
  --time-range 30d
```

## 📚 API Reference

### Error Codes
- `INDEX_DB_ERROR`: Database connection atau query failed
- `INDEX_SCHEMA_ERROR`: Schema creation atau migration failed
- `INDEX_INTEGRITY_ERROR`: Data integrity violation detected
- `INDEX_PERFORMANCE_ERROR`: Query timeout atau performance issue

### Configuration Options
```typescript
interface DuckDBIndexConfig {
  database_path: string;
  query_cache_enabled: boolean;
  cache_ttl_hours: number;
  full_text_search: boolean;
  analytics_enabled: boolean;
  maintenance: {
    auto_vacuum: boolean;
    optimize_interval_hours: number;
    backup_enabled: boolean;
    backup_interval_days: number;
  };
  performance: {
    max_connections: number;
    query_timeout_seconds: number;
    memory_limit_mb: number;
  };
}
```

---

**DuckDB Project Indexing akan mentransformasi GibRun menjadi analytical powerhouse dengan query performance 10x lebih cepat dan deep insights capabilities!** 🚀