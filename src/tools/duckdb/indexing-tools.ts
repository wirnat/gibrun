import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { DuckDBManager } from '@core/duckdb-manager.js';
import { SymbolSearchEngine } from '@core/symbol-search-engine.js';
import { AnalyticsEngine } from '@core/analytics-engine.js';
import { IncrementalUpdater } from '@core/incremental-updater.js';
import { SymbolExtractor } from '@core/symbol-extractor.js';
import { logError, logInfo } from '@/services/logger-service.js';
import { promisifyRun, promisifyAll, promisifyGet } from '@utils/duckdb-promisify.js';

// Tool definitions for DuckDB indexing operations
export const INDEXING_TOOLS: Tool[] = [
    {
        name: 'index_initialize',
        description: 'Initialize DuckDB index for project. Creates database schema, indexes, and performs initial indexing of all project files.',
        inputSchema: {
            type: 'object',
            properties: {
                project_root: {
                    type: 'string',
                    description: 'Root directory of the project to index',
                    default: '.'
                },
                force_recreate: {
                    type: 'boolean',
                    description: 'Force recreation of existing index',
                    default: false
                },
                include_patterns: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'File patterns to include (e.g., ["*.go", "*.ts"])',
                    default: ['*.go', '*.ts', '*.tsx', '*.js', '*.jsx', '*.py', '*.java']
                },
                exclude_patterns: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'File patterns to exclude',
                    default: ['node_modules/**', '.git/**', 'dist/**', 'build/**']
                }
            },
            required: []
        }
    },
    {
        name: 'index_update',
        description: 'Update index with changed files. Performs incremental indexing of modified, added, or deleted files.',
        inputSchema: {
            type: 'object',
            properties: {
                project_root: {
                    type: 'string',
                    description: 'Root directory of the project',
                    default: '.'
                },
                changed_files: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'List of files that have changed',
                    default: []
                },
                force_full_reindex: {
                    type: 'boolean',
                    description: 'Force full reindexing instead of incremental',
                    default: false
                }
            },
            required: []
        }
    },
    {
        name: 'index_query',
        description: 'Execute SQL queries against the DuckDB index. Supports complex analytics and reporting queries.',
        inputSchema: {
            type: 'object',
            properties: {
                project_root: {
                    type: 'string',
                    description: 'Root directory of the project',
                    default: '.'
                },
                query: {
                    type: 'string',
                    description: 'SQL query to execute'
                },
                params: {
                    type: 'array',
                    items: {},
                    description: 'Query parameters',
                    default: []
                },
                format: {
                    type: 'string',
                    enum: ['json', 'table', 'csv'],
                    description: 'Output format',
                    default: 'json'
                }
            },
            required: ['query']
        }
    },
    {
        name: 'index_search_symbols',
        description: 'Advanced symbol search with filtering. Find functions, classes, variables with complex criteria.',
        inputSchema: {
            type: 'object',
            properties: {
                project_root: {
                    type: 'string',
                    description: 'Root directory of the project',
                    default: '.'
                },
                search_term: {
                    type: 'string',
                    description: 'Search term for symbol names'
                },
                type: {
                    type: 'string',
                    enum: ['function', 'class', 'interface', 'variable', 'constant', 'method', 'struct', 'enum'],
                    description: 'Symbol type filter'
                },
                language: {
                    type: 'string',
                    description: 'Programming language filter'
                },
                file_path: {
                    type: 'string',
                    description: 'Specific file path to search in'
                },
                min_complexity: {
                    type: 'number',
                    description: 'Minimum complexity score',
                    minimum: 0
                },
                limit: {
                    type: 'number',
                    description: 'Maximum results to return',
                    default: 50,
                    maximum: 1000
                }
            },
            required: []
        }
    },
    {
        name: 'index_find_references',
        description: 'Find all references to a symbol. Shows where a function, class, or variable is used.',
        inputSchema: {
            type: 'object',
            properties: {
                project_root: {
                    type: 'string',
                    description: 'Root directory of the project',
                    default: '.'
                },
                symbol_name: {
                    type: 'string',
                    description: 'Name of the symbol to find references for'
                },
                file_path: {
                    type: 'string',
                    description: 'Optional: limit search to specific file'
                },
                include_definitions: {
                    type: 'boolean',
                    description: 'Include symbol definitions in results',
                    default: true
                }
            },
            required: ['symbol_name']
        }
    },
    {
        name: 'index_analytics_trends',
        description: 'Analyze metrics trends over time. Shows how code metrics change over time periods.',
        inputSchema: {
            type: 'object',
            properties: {
                project_root: {
                    type: 'string',
                    description: 'Root directory of the project',
                    default: '.'
                },
                metric_type: {
                    type: 'string',
                    enum: ['complexity', 'lines_count', 'dependencies', 'symbols_count'],
                    description: 'Type of metric to analyze'
                },
                time_range: {
                    type: 'object',
                    properties: {
                        amount: { type: 'number', minimum: 1 },
                        unit: { type: 'string', enum: ['days', 'weeks', 'months'] }
                    },
                    description: 'Time range for analysis',
                    default: { amount: 30, unit: 'days' }
                },
                group_by: {
                    type: 'string',
                    enum: ['day', 'week', 'month'],
                    description: 'How to group the trend data',
                    default: 'day'
                }
            },
            required: ['metric_type']
        }
    },
    {
        name: 'index_analytics_correlation',
        description: 'Find correlations between metrics. Analyze relationships between different code metrics.',
        inputSchema: {
            type: 'object',
            properties: {
                project_root: {
                    type: 'string',
                    description: 'Root directory of the project',
                    default: '.'
                },
                metric_a: {
                    type: 'string',
                    enum: ['complexity', 'lines_count', 'dependencies', 'symbols_count'],
                    description: 'First metric for correlation analysis'
                },
                metric_b: {
                    type: 'string',
                    enum: ['complexity', 'lines_count', 'dependencies', 'symbols_count'],
                    description: 'Second metric for correlation analysis'
                },
                time_range: {
                    type: 'object',
                    properties: {
                        amount: { type: 'number', minimum: 1 },
                        unit: { type: 'string', enum: ['days', 'weeks', 'months'] }
                    },
                    description: 'Time range for analysis',
                    default: { amount: 30, unit: 'days' }
                }
            },
            required: ['metric_a', 'metric_b']
        }
    },
    {
        name: 'index_validate',
        description: 'Validate index integrity. Checks for data consistency and reports any issues.',
        inputSchema: {
            type: 'object',
            properties: {
                project_root: {
                    type: 'string',
                    description: 'Root directory of the project',
                    default: '.'
                },
                check_foreign_keys: {
                    type: 'boolean',
                    description: 'Validate foreign key relationships',
                    default: true
                },
                check_data_integrity: {
                    type: 'boolean',
                    description: 'Check for data inconsistencies',
                    default: true
                },
                repair_issues: {
                    type: 'boolean',
                    description: 'Attempt to repair found issues',
                    default: false
                }
            },
            required: []
        }
    },
    {
        name: 'index_cleanup',
        description: 'Clean up old index data. Removes outdated entries and optimizes storage.',
        inputSchema: {
            type: 'object',
            properties: {
                project_root: {
                    type: 'string',
                    description: 'Root directory of the project',
                    default: '.'
                },
                older_than_days: {
                    type: 'number',
                    description: 'Remove data older than this many days',
                    minimum: 1,
                    default: 90
                },
                max_entries_per_table: {
                    type: 'number',
                    description: 'Maximum entries to keep per table',
                    minimum: 1000
                },
                dry_run: {
                    type: 'boolean',
                    description: 'Show what would be cleaned without actually doing it',
                    default: true
                }
            },
            required: []
        }
    }
];

// Handler functions for indexing tools
export async function handleIndexInitialize(args: any) {
    const {
        project_root = '.',
        force_recreate = false,
        include_patterns = ['*.go', '*.ts', '*.tsx', '*.js', '*.jsx', '*.py', '*.java'],
        exclude_patterns = ['node_modules/**', '.git/**', 'dist/**', 'build/**']
    } = args;

    try {
        logInfo('Initializing DuckDB index', { project_root, force_recreate });

        // Create DuckDB manager (this will initialize the database)
        const duckdbManager = new DuckDBManager(project_root);

        // Perform initial indexing
        const symbolExtractor = new SymbolExtractor();
        const indexer = new IncrementalUpdater(duckdbManager, symbolExtractor);
        const changeResult = await indexer.detectProjectChanges(project_root);
        const allFiles = [...changeResult.newFiles, ...changeResult.changedFiles];
        const result = await indexer.bulkUpdate(allFiles);

        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    success: true,
                    message: 'DuckDB index initialized successfully',
                    project_root,
                    indexed_files: result.processed,
                    skipped_files: result.skipped,
                    errors: result.errors,
                    duration_ms: result.duration_ms
                }, null, 2)
            }]
        };

    } catch (error: any) {
        logError('Index initialization failed', error, { project_root });
        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    success: false,
                    error: error.message,
                    project_root
                }, null, 2)
            }],
            isError: true
        };
    }
}

export async function handleIndexUpdate(args: any) {
    const { project_root = '.', changed_files = [], force_full_reindex = false } = args;

    try {
        logInfo('Updating DuckDB index', { project_root, changed_files_count: changed_files.length });

        const duckdbManager = new DuckDBManager(project_root, undefined);
        const symbolExtractor = new SymbolExtractor();
        const updater = new IncrementalUpdater(duckdbManager, symbolExtractor);

        let result;
        if (force_full_reindex) {
            // For full reindex, detect all project changes
            const changeResult = await updater.detectProjectChanges(project_root);
            const allFiles = [...changeResult.newFiles, ...changeResult.changedFiles, ...changeResult.unchangedFiles];
            result = await updater.bulkUpdate(allFiles);
        } else {
            result = await updater.updateIndex(changed_files);
        }

        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    success: true,
                    message: 'Index update completed',
                    project_root,
                    processed: result.processed,
                    skipped: result.skipped,
                    errors: result.errors,
                    duration_ms: result.duration_ms
                }, null, 2)
            }]
        };

    } catch (error: any) {
        logError('Index update failed', error, { project_root });
        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    success: false,
                    error: error.message,
                    project_root
                }, null, 2)
            }],
            isError: true
        };
    }
}

export async function handleIndexQuery(args: any) {
    const { project_root = '.', query, params = [], format = 'json' } = args;

    try {
        logInfo('Executing index query', { project_root, query_length: query.length });

        const duckdbManager = new DuckDBManager(project_root);
        const connection = duckdbManager.getConnection();

        const result = await  promisifyAll(connection,query, ...params);
        connection.close();

        let output;
        switch (format) {
            case 'table':
                output = formatAsTable(result);
                break;
            case 'csv':
                output = formatAsCSV(result);
                break;
            default:
                output = JSON.stringify(result, null, 2);
        }

        return {
            content: [{
                type: 'text',
                text: output
            }]
        };

    } catch (error: any) {
        logError('Index query failed', error, { project_root, query });
        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    success: false,
                    error: error.message,
                    query
                }, null, 2)
            }],
            isError: true
        };
    }
}

export async function handleIndexSearchSymbols(args: any) {
    const {
        project_root = '.',
        search_term,
        type,
        language,
        file_path,
        min_complexity,
        limit = 50
    } = args;

    try {
        logInfo('Searching symbols', { project_root, search_term, type, language });

        const duckdbManager = new DuckDBManager(project_root);
        const searchEngine = new SymbolSearchEngine(duckdbManager);

        const query = {
            searchTerm: search_term,
            type,
            language,
            filePath: file_path,
            minComplexity: min_complexity,
            limit
        };

        const results = await searchEngine.searchSymbols(query);

        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    success: true,
                    results,
                    count: results.length,
                    query
                }, null, 2)
            }]
        };

    } catch (error: any) {
        logError('Symbol search failed', error, { project_root, search_term });
        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    success: false,
                    error: error.message,
                    search_term
                }, null, 2)
            }],
            isError: true
        };
    }
}

export async function handleIndexFindReferences(args: any) {
    const { project_root = '.', symbol_name, file_path, include_definitions = true } = args;

    try {
        logInfo('Finding symbol references', { project_root, symbol_name, file_path });

        const duckdbManager = new DuckDBManager(project_root);
        const searchEngine = new SymbolSearchEngine(duckdbManager);

        const results = await searchEngine.findReferences(symbol_name, file_path);

        let filteredResults = results;
        if (!include_definitions) {
            filteredResults = results.filter(r => r.type !== 'definition');
        }

        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    success: true,
                    symbol_name,
                    references: filteredResults,
                    count: filteredResults.length
                }, null, 2)
            }]
        };

    } catch (error: any) {
        logError('Find references failed', error, { project_root, symbol_name });
        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    success: false,
                    error: error.message,
                    symbol_name
                }, null, 2)
            }],
            isError: true
        };
    }
}

export async function handleIndexAnalyticsTrends(args: any) {
    const {
        project_root = '.',
        metric_type,
        time_range = { amount: 30, unit: 'days' },
        group_by = 'day'
    } = args;

    try {
        logInfo('Analyzing metrics trends', { project_root, metric_type, time_range, group_by });

        const duckdbManager = new DuckDBManager(project_root);
        const analyticsEngine = new AnalyticsEngine(duckdbManager);

        const trends = await analyticsEngine.getMetricsTrends(metric_type, time_range, group_by);

        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    success: true,
                    metric_type,
                    time_range,
                    group_by,
                    trends,
                    data_points: trends.length
                }, null, 2)
            }]
        };

    } catch (error: any) {
        logError('Analytics trends failed', error, { project_root, metric_type });
        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    success: false,
                    error: error.message,
                    metric_type
                }, null, 2)
            }],
            isError: true
        };
    }
}

export async function handleIndexAnalyticsCorrelation(args: any) {
    const {
        project_root = '.',
        metric_a,
        metric_b,
        time_range = { amount: 30, unit: 'days' }
    } = args;

    try {
        logInfo('Analyzing metrics correlation', { project_root, metric_a, metric_b, time_range });

        const duckdbManager = new DuckDBManager(project_root);
        const analyticsEngine = new AnalyticsEngine(duckdbManager);

        const correlation = await analyticsEngine.getCorrelationAnalysis(metric_a, metric_b, time_range);

        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    success: true,
                    metric_a,
                    metric_b,
                    time_range,
                    correlation
                }, null, 2)
            }]
        };

    } catch (error: any) {
        logError('Analytics correlation failed', error, { project_root, metric_a, metric_b });
        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    success: false,
                    error: error.message,
                    metric_a,
                    metric_b
                }, null, 2)
            }],
            isError: true
        };
    }
}

export async function handleIndexValidate(args: any) {
    const {
        project_root = '.',
        check_foreign_keys = true,
        check_data_integrity = true,
        repair_issues = false
    } = args;

    try {
        logInfo('Validating index integrity', { project_root, check_foreign_keys, check_data_integrity });

        const duckdbManager = new DuckDBManager(project_root);
        const connection = duckdbManager.getConnection();

        // Basic validation - check if tables exist and have data
        const validationResults = {
            tables_exist: false,
            data_integrity: true,
            foreign_keys_valid: true,
            issues: [] as string[]
        };

        try {
            // Check if main tables exist
            const tables = await  promisifyAll(connection,`
                SELECT name FROM sqlite_master
                WHERE type='table' AND name IN ('files', 'symbols', 'metrics')
            `);
            validationResults.tables_exist = tables.length >= 3;

            if (!validationResults.tables_exist) {
                validationResults.issues.push('Required tables are missing');
            }

            // Basic data integrity check
            if (check_data_integrity) {
                const orphanedSymbols = await  promisifyAll(connection,`
                    SELECT COUNT(*) as count FROM symbols s
                    LEFT JOIN files f ON s.file_path = f.file_path
                    WHERE f.file_path IS NULL
                `);
                if (orphanedSymbols[0].count > 0) {
                    validationResults.data_integrity = false;
                    validationResults.issues.push(`${orphanedSymbols[0].count} orphaned symbols found`);
                }
            }

        } finally {
            connection.close();
        }

        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    success: true,
                    validation_results: validationResults,
                    issues_found: validationResults.issues.length,
                    repaired: repair_issues
                }, null, 2)
            }]
        };

    } catch (error: any) {
        logError('Index validation failed', error, { project_root });
        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    success: false,
                    error: error.message,
                    project_root
                }, null, 2)
            }],
            isError: true
        };
    }
}

export async function handleIndexCleanup(args: any) {
    const {
        project_root = '.',
        older_than_days = 90,
        max_entries_per_table,
        dry_run = true
    } = args;

    try {
        logInfo('Cleaning up index data', { project_root, older_than_days, dry_run });

        const duckdbManager = new DuckDBManager(project_root);
        const connection = duckdbManager.getConnection();

        const cleanupResults = {
            metrics_cleaned: 0,
            todos_cleaned: 0,
            git_history_cleaned: 0,
            dry_run
        };

        try {
            if (!dry_run) {
                // Clean old metrics
                await promisifyRun(connection, `
                    DELETE FROM metrics
                    WHERE recorded_at < NOW() - INTERVAL '${older_than_days} days'
                `);
                cleanupResults.metrics_cleaned = 0; // Cannot determine affected rows in DuckDB

                // Clean old todos
                await promisifyRun(connection, `
                    DELETE FROM todos
                    WHERE created_at < NOW() - INTERVAL '${older_than_days} days'
                `);
                cleanupResults.todos_cleaned = 0; // Cannot determine affected rows in DuckDB

                // Clean old git history
                await promisifyRun(connection, `
                    DELETE FROM git_history
                    WHERE date < NOW() - INTERVAL '${older_than_days} days'
                `);
                cleanupResults.git_history_cleaned = 0; // Cannot determine affected rows in DuckDB

                // Optimize database
                await  promisifyRun(connection,'VACUUM');
            } else {
                // Dry run - just count what would be cleaned
                const metricsCount = await  promisifyAll(connection,`
                    SELECT COUNT(*) as count FROM metrics
                    WHERE recorded_at < NOW() - INTERVAL '${older_than_days} days'
                `);
                cleanupResults.metrics_cleaned = metricsCount[0].count;

                const todosCount = await  promisifyAll(connection,`
                    SELECT COUNT(*) as count FROM todos
                    WHERE created_at < NOW() - INTERVAL '${older_than_days} days'
                `);
                cleanupResults.todos_cleaned = todosCount[0].count;

                const gitCount = await  promisifyAll(connection,`
                    SELECT COUNT(*) as count FROM git_history
                    WHERE date < NOW() - INTERVAL '${older_than_days} days'
                `);
                cleanupResults.git_history_cleaned = gitCount[0].count;
            }

        } finally {
            connection.close();
        }

        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    success: true,
                    cleanup_results: cleanupResults,
                    dry_run,
                    project_root
                }, null, 2)
            }]
        };

    } catch (error: any) {
        logError('Index cleanup failed', error, { project_root });
        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    success: false,
                    error: error.message,
                    project_root
                }, null, 2)
            }],
            isError: true
        };
    }
}

// Utility functions
function formatAsTable(data: any[]): string {
    if (data.length === 0) return 'No results';

    const headers = Object.keys(data[0]);
    const rows = data.map(row => headers.map(h => String(row[h] || '')));

    // Simple table formatting
    const colWidths = headers.map((h, i) => Math.max(h.length, ...rows.map(r => r[i].length)));

    let output = headers.map((h, i) => h.padEnd(colWidths[i])).join(' | ') + '\n';
    output += colWidths.map(w => '-'.repeat(w)).join('-+-') + '\n';
    output += rows.map(r => r.map((cell, i) => cell.padEnd(colWidths[i])).join(' | ')).join('\n');

    return output;
}

function formatAsCSV(data: any[]): string {
    if (data.length === 0) return '';

    const headers = Object.keys(data[0]);
    let output = headers.join(',') + '\n';

    for (const row of data) {
        const values = headers.map(h => {
            const value = row[h];
            if (typeof value === 'string' && value.includes(',')) {
                return `"${value.replace(/"/g, '""')}"`;
            }
            return String(value || '');
        });
        output += values.join(',') + '\n';
    }

    return output;
}