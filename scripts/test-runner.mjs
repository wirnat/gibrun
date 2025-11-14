#!/usr/bin/env node

/**
 * Memory-optimized test runner for gibRun
 * Handles large test suites with memory constraints
 */

import { execSync } from 'child_process';
import { cpus } from 'os';

const HEAP_SIZE = '4096'; // 4GB heap
const MAX_WORKERS = Math.min(cpus().length - 1, 4); // Use up to 4 cores

console.log('🚀 Starting gibRun Memory-Optimized Test Runner');
console.log(`📊 System: ${cpus().length} cores available, using ${MAX_WORKERS} workers`);
console.log(`💾 Heap Size: ${HEAP_SIZE}MB\n`);

// Test suites to run
const testSuites = [
  {
    name: 'DAP Tools',
    command: `NODE_OPTIONS="--max-old-space-size=${HEAP_SIZE}" vitest run test/unit/tools/dap --no-coverage --maxWorkers=${MAX_WORKERS}`,
    description: 'Test DAP debugging tools (33 tests)'
  },
  {
    name: 'Services',
    command: `NODE_OPTIONS="--max-old-space-size=${HEAP_SIZE}" vitest run test/unit/services --no-coverage --maxWorkers=${MAX_WORKERS}`,
    description: 'Test service layer (27 tests)'
  },
  {
    name: 'Other Tools',
    command: `NODE_OPTIONS="--max-old-space-size=${HEAP_SIZE}" vitest run test/unit/tools --no-coverage --maxWorkers=${MAX_WORKERS} --exclude="**/dap/**"`,
    description: 'Test other tools (51 tests)'
  },
  {
    name: 'Integration',
    command: `NODE_OPTIONS="--max-old-space-size=${HEAP_SIZE}" vitest run test/integration --no-coverage --maxWorkers=1`,
    description: 'Test integration scenarios (3 tests)'
  }
];

let totalTests = 0;
let totalPassed = 0;
let totalFailed = 0;

for (const suite of testSuites) {
  console.log(`\n🎯 Running: ${suite.name}`);
  console.log(`📝 ${suite.description}`);
  console.log(`💻 Command: ${suite.command}\n`);

  try {
    const output = execSync(suite.command, {
      encoding: 'utf8',
      stdio: 'inherit',
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer
    });

    // Parse results from output (this is a simplified approach)
    console.log(`✅ ${suite.name} completed successfully`);

  } catch (error) {
    console.log(`❌ ${suite.name} failed`);
    console.log(`Error: ${error.message}`);

    // Continue with other suites but mark as failed
    totalFailed++;
  }
}

console.log('\n' + '='.repeat(50));
console.log('📊 TEST SUMMARY');
console.log('='.repeat(50));
console.log(`Total Test Suites: ${testSuites.length}`);
console.log(`Passed: ${testSuites.length - totalFailed}`);
console.log(`Failed: ${totalFailed}`);

if (totalFailed === 0) {
  console.log('\n🎉 All test suites passed!');
  process.exit(0);
} else {
  console.log(`\n💥 ${totalFailed} test suite(s) failed`);
  process.exit(1);
}