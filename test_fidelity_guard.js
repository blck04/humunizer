// test_fidelity_guard.js — Unit & Regression Tests for Fidelity Gate
const assert = require('assert');
const guard = require('./fidelity_guard.js');

console.log('========================================');
console.log('  Fidelity Gate & Fact Guard Tests');
console.log('========================================\n');

let pass = 0, fail = 0;
function test(name, fn) {
  try {
    const result = fn();
    if (result !== false) { console.log(`  PASS  ${name}`); pass++; }
    else { console.log(`  FAIL  ${name}`); fail++; }
  } catch(e) { console.log(`  FAIL  ${name} — ${e.message}`); fail++; }
}

// 1. Regression test: Chapter 2 sample with fabricated "50%"
test('REGRESSION: Flags fabricated "50%" as critical violation', () => {
  const original = "A percentage score was recorded across all evaluated sections.";
  const rewritten = "A score of 50% was recorded across all evaluated sections.";
  
  const report = guard.verifyFidelity(original, rewritten);
  const hasAdded50 = report.criticalViolations.some(v => v.type === 'added_number' && v.items.includes('50%'));
  
  return !report.passed && hasAdded50;
});

// 2. Missing numbers
test('Catches missing number "4.2%" as critical violation', () => {
  const original = "The system showed an estimated 4.2% gain in overall throughput.";
  const rewritten = "The system showed a gain in overall throughput.";
  
  const report = guard.verifyFidelity(original, rewritten);
  const hasMissing = report.criticalViolations.some(v => v.type === 'missing_number' && v.items.some(x => x.includes('4.2')));
  
  return !report.passed && hasMissing;
});

// 3. Perfect preservation
test('Passes cleanly when all numbers, dates, and citations are preserved', () => {
  const original = "In October 2026, Li et al. (2026) reported a 14.5% improvement across 1,200 trials.";
  const rewritten = "Li et al. (2026) documented a 14.5% improvement across 1200 trials back in October 2026.";
  
  const report = guard.verifyFidelity(original, rewritten);
  return report.passed && report.criticalViolations.length === 0;
});

// 4. Catches date alterations
test('Flags fabricated or altered dates', () => {
  const original = "The update rolled out in 2024.";
  const rewritten = "The update rolled out in November 2026.";
  
  const report = guard.verifyFidelity(original, rewritten);
  const hasDateViolation = report.criticalViolations.some(v => v.type === 'added_date' || v.type === 'missing_date');
  
  return !report.passed && hasDateViolation;
});

// 5. Catches dropped citations
test('Flags dropped academic citations', () => {
  const original = "Recent benchmarks confirm this observation (Smith & Jones, 2024).";
  const rewritten = "Recent benchmarks confirm this observation without a doubt.";
  
  const report = guard.verifyFidelity(original, rewritten);
  const hasCiteViolation = report.criticalViolations.some(v => v.type === 'missing_citation');
  
  return !report.passed && hasCiteViolation;
});

// 6. Qualifier drift advisory
test('Reports dropped qualifiers as advisories without blocking if numbers match', () => {
  const original = "The findings suggest that roughly 80% of participants agreed.";
  const rewritten = "The findings prove that 80% of participants agreed.";
  
  const report = guard.verifyFidelity(original, rewritten);
  const hasDroppedQualifier = report.advisories.some(a => a.type === 'dropped_qualifier');
  
  // Passed critical (since 80% matches), but advisory logged
  return report.passed && hasDroppedQualifier;
});

console.log(`\nResults: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
