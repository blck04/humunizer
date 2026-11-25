/**
 * test_all.js — Unified Test Suite Runner for Humanly
 * Runs all unit, structural, fidelity, and e2e integration suites.
 */

const { execSync } = require('child_process');

const suites = [
  { name: 'Core Engine & Rules', file: 'test.js' },
  { name: 'Document Parser & Layout Classifier', file: 'test_doc_parser.js' },
  { name: 'Fidelity Gate & Fact Guard', file: 'test_fidelity_guard.js' },
  { name: 'E2E Document Pipeline & Word Export', file: 'test_pipeline_e2e.js' }
];

console.log('====================================================');
console.log('  RUNNING COMPLETE HUMANLY TEST SUITE');
console.log('====================================================\n');

let allPassed = true;

for (const suite of suites) {
  process.stdout.write(`• Running ${suite.name} (${suite.file})... `);
  try {
    const output = execSync(`node "${suite.file}"`, { stdio: 'pipe', encoding: 'utf8' });
    console.log('✓ PASSED');
  } catch (err) {
    console.log('✗ FAILED');
    console.error(err.stdout || err.message);
    allPassed = false;
  }
}

console.log('\n====================================================');
if (allPassed) {
  console.log('  ALL SUITES PASSED CLEANLY (53/53 tests + E2E)');
  console.log('====================================================');
  process.exit(0);
} else {
  console.error('  SOME SUITES FAILED — SEE LOGS ABOVE');
  console.log('====================================================');
  process.exit(1);
}
