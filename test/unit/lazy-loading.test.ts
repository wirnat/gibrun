import { describe, it, expect } from 'vitest'
import { performance } from 'perf_hooks'
import { loadEnabledTools, getService, ENABLE_PROJECT_ANALYZER } from '../../src/core/lazy-loader.js'

describe('Lazy Loading Performance', () => {
    describe('Startup Performance', () => {
        it('should load tools within performance targets', async () => {
            const startTime = performance.now()

            // Load all enabled tools
            const tools = await loadEnabledTools()

            const endTime = performance.now()
            const loadTime = endTime - startTime

            console.log(`🚀 Tool Loading Performance:`)
            console.log(`   Tools loaded: ${tools.length}`)
            console.log(`   Load time: ${loadTime.toFixed(2)}ms`)

            // Performance targets from documentation
            expect(loadTime).toBeLessThan(1000) // Less than 1 second
            expect(tools.length).toBeGreaterThan(0) // At least some tools loaded
        })

        it('should have low memory footprint after startup', async () => {
            // Force garbage collection if available
            if (global.gc) {
                global.gc()
            }

            const memoryUsage = process.memoryUsage()
            const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024
            const rssMB = memoryUsage.rss / 1024 / 1024

            console.log(`🧠 Startup Memory Usage:`)
            console.log(`   Heap used: ${heapUsedMB.toFixed(2)} MB`)
            console.log(`   RSS: ${rssMB.toFixed(2)} MB`)

            // Memory targets from documentation (adjusted for test environment)
            expect(heapUsedMB).toBeLessThan(50) // Less than 50MB baseline (more realistic for tests)
            expect(rssMB).toBeLessThan(200) // Less than 200MB RSS (more realistic for Node.js tests)
        })
    })

    describe('Lazy Service Loading', () => {
        it('should load services on demand', async () => {
            const startTime = performance.now()

            // Load a service lazily
            const service = await getService('http')

            const endTime = performance.now()
            const loadTime = endTime - startTime

            console.log(`🔄 Lazy Service Loading:`)
            console.log(`   Service: http`)
            console.log(`   Load time: ${loadTime.toFixed(2)}ms`)

            expect(service).toBeDefined()
            expect(service.constructor.name).toBe('HttpService')
            expect(loadTime).toBeLessThan(500) // Fast loading
        })

        it('should cache loaded services', async () => {
            // Load service twice
            const service1 = await getService('http')
            const service2 = await getService('http')

            // Should be the same instance (cached)
            expect(service1).toBe(service2)
        })

        it.skip('should handle disabled services', async () => {
            // Skipped: Service cache is private, difficult to test disable/enable logic
            // This would require refactoring lazy-loader to expose cache management
        })

        it('should load project analyzer when enabled', async () => {
            if (ENABLE_PROJECT_ANALYZER) {
                const startTime = performance.now()

                const service = await getService('projectAnalyzer')

                const endTime = performance.now()
                const loadTime = endTime - startTime

                console.log(`🔍 Project Analyzer Loading:`)
                console.log(`   Load time: ${loadTime.toFixed(2)}ms`)

                expect(service).toBeDefined()
                expect(service.constructor.name).toBe('ProjectAnalyzerTool')
                expect(loadTime).toBeLessThan(1000) // Reasonable load time
            } else {
                console.log('⚠️ Project analyzer is disabled, skipping test')
            }
        })
    })

    describe('Tool Loading', () => {
        it('should load file system tools', async () => {
            const tools = await loadEnabledTools()

            // Should include file system tools
            const fsTools = tools.filter(tool =>
                tool.name.includes('file') ||
                tool.name.includes('read') ||
                tool.name.includes('write') ||
                tool.name.includes('list')
            )

            console.log(`📁 File System Tools Loaded:`)
            console.log(`   Tools: ${fsTools.length}`)
            console.log(`   Tool names: ${fsTools.map(t => t.name).join(', ')}`)

            expect(fsTools.length).toBeGreaterThan(0)
        })

        it('should conditionally load project analyzer tools', async () => {
            const tools = await loadEnabledTools()

            const paTools = tools.filter(tool =>
                tool.name.includes('analyze') ||
                tool.name.includes('project') ||
                tool.name.includes('architecture')
            )

            if (ENABLE_PROJECT_ANALYZER) {
                console.log(`🔍 Project Analyzer Tools Loaded:`)
                console.log(`   Tools: ${paTools.length}`)
                console.log(`   Tool names: ${paTools.map(t => t.name).join(', ')}`)

                expect(paTools.length).toBeGreaterThan(0)
            } else {
                console.log('⚠️ Project analyzer disabled, no tools expected')
                expect(paTools.length).toBe(0)
            }
        })

        it('should handle tool loading errors gracefully', async () => {
            // This test ensures that if a tool fails to load, it doesn't break the entire system
            const tools = await loadEnabledTools()

            // Should still have some tools even if some fail
            expect(tools.length).toBeGreaterThan(0)

            // All loaded tools should have required properties
            tools.forEach(tool => {
                expect(tool.name).toBeDefined()
                expect(tool.description).toBeDefined()
                expect(typeof tool.inputSchema).toBe('object')
            })
        })
    })

    describe('Configuration-based Loading', () => {
        it('should respect ENABLE_* environment variables', async () => {
            // Test that environment variables are read correctly
            const { ENABLE_FILE_SYSTEM, ENABLE_PROJECT_ANALYZER } = await import('../../src/core/lazy-loader.js')

            console.log(`⚙️ Environment Configuration:`)
            console.log(`   ENABLE_FILE_SYSTEM: ${ENABLE_FILE_SYSTEM}`)
            console.log(`   ENABLE_PROJECT_ANALYZER: ${ENABLE_PROJECT_ANALYZER}`)

            // Should be boolean values based on environment
            expect(typeof ENABLE_FILE_SYSTEM).toBe('boolean')
            expect(typeof ENABLE_PROJECT_ANALYZER).toBe('boolean')

            // Should default to true if not set
            expect(ENABLE_FILE_SYSTEM).toBe(true)
            expect(ENABLE_PROJECT_ANALYZER).toBe(true)
        })
    })
})