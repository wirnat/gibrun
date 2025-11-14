import { Tool } from '@modelcontextprotocol/sdk/types.js';

// Import indexing tools
import { INDEXING_TOOLS, handleIndexInitialize, handleIndexUpdate, handleIndexQuery, handleIndexSearchSymbols, handleIndexFindReferences, handleIndexAnalyticsTrends, handleIndexAnalyticsCorrelation, handleIndexValidate, handleIndexCleanup } from './indexing-tools.js';

// Import cache tools
import { CACHE_TOOLS, handleCacheGetOverview, handleCacheInvalidateEntries, handleCacheCleanupMaintenance, handleCacheAnalyzePerformance, handleMemoryStoreValue, handleMemoryRetrieveValue, handleMemoryFindRelated } from './cache-tools.js';

// Combine all DuckDB tools
export const DUCKDB_TOOLS: Tool[] = [
    ...INDEXING_TOOLS,
    ...CACHE_TOOLS
];

// Export all handler functions
export {
    // Indexing tools
    handleIndexInitialize,
    handleIndexUpdate,
    handleIndexQuery,
    handleIndexSearchSymbols,
    handleIndexFindReferences,
    handleIndexAnalyticsTrends,
    handleIndexAnalyticsCorrelation,
    handleIndexValidate,
    handleIndexCleanup,

    // Cache tools
    handleCacheGetOverview,
    handleCacheInvalidateEntries,
    handleCacheCleanupMaintenance,
    handleCacheAnalyzePerformance,
    handleMemoryStoreValue,
    handleMemoryRetrieveValue,
    handleMemoryFindRelated
};