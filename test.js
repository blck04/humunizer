// Test approach: extract functions by reading the HTML and using vm module
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) { console.log('FAIL: no script found'); process.exit(1); }

const jsCode = scriptMatch[1];

// Create a sandbox with mocked browser globals
const fakeEl = {
  value: '', textContent: '', innerHTML: '', disabled: false, style: {},
  classList: { add(){}, remove(){}, contains(){ return false; } },
  querySelector(){ return null; },
  querySelectorAll(){ return []; },
  addEventListener(){},
  click(){}
};

const sandbox = {
  document: {
    getElementById: () => fakeEl,
    querySelector: () => ({ addEventListener(){}, click(){} }),
    querySelectorAll: () => [],
    createElement: () => ({ textContent: '', innerHTML: '' })
  },
  navigator: { clipboard: { writeText(){} } },
  setTimeout: setTimeout,
  console: console,
  Math: Math,
  Date: Date,
  JSON: JSON,
  RegExp: RegExp,
  Set: Set,
  Map: Map,
  Array: Array,
  Object: Object,
  String: String,
  Number: Number,
  Boolean: Boolean,
  Promise: Promise,
};

vm.createContext(sandbox);

try {
  vm.runInContext(jsCode, sandbox);
} catch(e) {
  console.log('FAIL: vm eval error:', e.message);
  console.log('Stack:', e.stack?.split('\n').slice(0,3).join('\n'));
  process.exit(1);
}

// Extract functions from sandbox
const api = {
  countWords: sandbox.countWords,
  splitSentences: sandbox.splitSentences,
  protectSpans: sandbox.protectSpans,
  restoreSpans: sandbox.restoreSpans,
  computeReuse: sandbox.computeReuse,
  detectRegister: sandbox.detectRegister,
  restructureSentence: sandbox.restructureSentence,
  humanizeText: sandbox.humanizeText,
  detectAI: sandbox.detectAI,
  clippingFloor: sandbox.clippingFloor,
  clippedAverage: sandbox.clippedAverage,
  CALIBRATION_HUMAN: vm.runInContext('typeof CALIBRATION_HUMAN !== "undefined" ? CALIBRATION_HUMAN : []', sandbox),
  findGrammarIssues: sandbox.findGrammarIssues,
  escapeHtml: sandbox.escapeHtml,
  SAMPLE_TEXT: vm.runInContext('typeof SAMPLE_TEXT !== "undefined" ? SAMPLE_TEXT : ""', sandbox),
  HUMANIZE_STEPS: vm.runInContext('typeof HUMANIZE_STEPS !== "undefined" ? HUMANIZE_STEPS : []', sandbox),
  STATE: vm.runInContext('typeof STATE !== "undefined" ? STATE : {}', sandbox),
};

console.log('========================================');
console.log('  HUMANLY — Functional Engine Tests');
console.log('========================================\n');

let pass = 0, fail = 0;
function test(name, fn) {
  try {
    const result = fn();
    if (result !== false) { console.log(`  PASS  ${name}`); pass++; }
    else { console.log(`  FAIL  ${name}`); fail++; }
  } catch(e) { console.log(`  FAIL  ${name} — ${e.message}`); fail++; }
}

// 1
test('countWords counts correctly', () =>
  api.countWords('hello world foo bar') === 4 && api.countWords('') === 0
);

// 2
test('splitSentences splits properly', () => {
  const s = api.splitSentences('Hello world. This is a test! Is it working?');
  console.log(`        Got ${s.length} sentences`);
  return s.length === 3;
});

// 3
test('humanizeText returns non-empty output', () => {
  const input = 'Artificial intelligence has emerged as one of the most transformative technologies. Furthermore, the integration of machine learning has demonstrated remarkable capabilities.';
  const result = api.humanizeText(input, 'standard', 'natural');
  console.log(`        In:  "${input.slice(0,55)}..."`);
  console.log(`        Out: "${result.slice(0,55)}..."`);
  return result && result.length > 20;
});

// 4
test('humanizeText removes AI transitions (enhanced)', () => {
  const input = 'AI is great. Furthermore, it is useful. Moreover, it is efficient. In conclusion, AI matters.';
  const result = api.humanizeText(input, 'enhanced', 'natural');
  console.log(`        Out: "${result}"`);
  const lower = result.toLowerCase();
  return !lower.includes('furthermore') || !lower.includes('moreover') || !lower.includes('in conclusion');
});

// 5 — rules are probabilistic, so assert across several runs
test('humanizeText replaces "utilize"', () => {
  const input = 'We utilize advanced algorithms to facilitate operations. In order to commence, we endeavor to ameliorate the situation.';
  let replaced = 0;
  for (let i = 0; i < 10; i++) {
    const result = api.humanizeText(input, 'enhanced', 'casual');
    if (!result.toLowerCase().includes('utilize')) replaced++;
  }
  console.log(`        "utilize" removed in ${replaced}/10 runs (rule weight 0.5)`);
  // Rules are intentionally randomized to avoid fixed fingerprints; the
  // assertion is that the rule works at all, not that it always fires.
  return replaced >= 3;
});

// 6
test('humanizeText adds contractions (casual)', () => {
  const input = 'It is not possible to do this. We will not continue. They are not ready.';
  const result = api.humanizeText(input, 'enhanced', 'casual');
  console.log(`        Out: "${result}"`);
  return result.includes("n't") || result.includes("'re") || result.includes("'ll") || result.includes("'s");
});

// 7
test('humanizeText academic tone avoids contractions', () => {
  const input = 'It is not possible to do this. We will not continue.';
  const result = api.humanizeText(input, 'enhanced', 'academic');
  console.log(`        Out: "${result}"`);
  return !result.includes("n't") && !result.includes("'ll");
});

// 8
test('humanizeText handles empty string', () =>
  api.humanizeText('', 'standard', 'natural') === ''
);

// 9
test('detectAI returns score 0-100', () => {
  const input = 'AI is great. Furthermore, it is useful. Moreover, it is efficient. In conclusion, AI matters.';
  const r = api.detectAI(input);
  console.log(`        AI: ${r.aiScore}%, Human: ${r.humanScore}%`);
  return r.aiScore >= 0 && r.aiScore <= 100 && r.humanScore === (100 - r.aiScore);
});

// 10
test('detectAI flags obvious AI text high (>=50)', () => {
  const aiText = 'Furthermore, it is important to note that artificial intelligence has emerged as one of the most transformative technologies. Moreover, the integration of machine learning algorithms has demonstrated remarkable capabilities. Additionally, these advancements have significant implications. In conclusion, this represents a paradigm shift.';
  const r = api.detectAI(aiText);
  console.log(`        AI Score: ${r.aiScore}%`);
  return r.aiScore >= 50;
});

// 11
test('detectAI gives lower score to human text (<50)', () => {
  const humanText = "I went to the store yesterday. Bought some milk. The cashier was nice — she smiled at me! Really made my day, you know? It's the little things.";
  const r = api.detectAI(humanText);
  console.log(`        AI Score: ${r.aiScore}%`);
  return r.aiScore < 50;
});

// 12
test('detectAI returns per-sentence scores', () => {
  const input = 'This is sentence one. This is sentence two. This is sentence three.';
  const r = api.detectAI(input);
  console.log(`        Sentences: ${r.sentenceCount}, Scores: ${r.sentenceScores.map(s=>s.score).join(', ')}`);
  return r.sentenceScores.length === 3 && r.sentenceScores.every(s => typeof s.score === 'number');
});

// 13
test('detectAI returns metrics', () => {
  const input = 'This is a test sentence. Another one follows. And here is a third one for good measure.';
  const r = api.detectAI(input);
  console.log(`        P:${r.perplexity} B:${r.burstiness} F:${r.fingerprintScore}`);
  return typeof r.perplexity === 'number' && typeof r.burstiness === 'number' && typeof r.fingerprintScore === 'number';
});

// 14
test('findGrammarIssues detects spelling errors', () => {
  const text = "I will definately recieve the seperate package untill tommorow.";
  const issues = api.findGrammarIssues(text);
  console.log(`        Found ${issues.length}: ${issues.map(i=>i.original).join(', ')}`);
  return issues.length >= 3;
});

// 15
test('findGrammarIssues detects "they has"', () => {
  const issues = api.findGrammarIssues("They has been working on this.");
  console.log(`        Found: ${issues.map(i=>i.original).join(', ')}`);
  return issues.some(i => i.original.toLowerCase().includes('they has'));
});

// 16
test('findGrammarIssues detects "your welcome"', () => {
  const issues = api.findGrammarIssues("Your welcome to join us.");
  console.log(`        Found: ${issues.map(i=>i.original).join(', ')}`);
  return issues.some(i => i.original.toLowerCase().includes('your welcome'));
});

// 17
test('findGrammarIssues detects "could of"', () => {
  const issues = api.findGrammarIssues("I could of gone to the store.");
  console.log(`        Found: ${issues.map(i=>i.original).join(', ')}`);
  return issues.some(i => i.original.toLowerCase().includes('could of'));
});

// 18
test('findGrammarIssues: clean text → 0 issues', () => {
  const issues = api.findGrammarIssues("The quick brown fox jumps over the lazy dog.");
  console.log(`        Found ${issues.length} issues`);
  return issues.length === 0;
});

// 19
test('findGrammarIssues provides fixes', () => {
  const issues = api.findGrammarIssues("I cant do this wont work.");
  const withFix = issues.filter(i => i.fix !== null);
  console.log(`        Fixes: ${withFix.map(i=>`${i.original}→${i.fix}`).join(', ')}`);
  return withFix.length >= 2;
});

// 20
test('enhanced vs light produce different output', () => {
  const input = 'Furthermore, it is important to note that we utilize advanced algorithms. In conclusion, this represents a paradigm shift.';
  let diffs = 0;
  for (let i = 0; i < 5; i++) {
    if (api.humanizeText(input, 'light', 'natural') !== api.humanizeText(input, 'enhanced', 'natural')) diffs++;
  }
  console.log(`        Different in ${diffs}/5 runs`);
  return diffs >= 3;
});

// 21
test('Full pipeline: AI score drops after humanizing', () => {
  const aiText = 'Furthermore, it is important to note that artificial intelligence has emerged as one of the most transformative technologies. Moreover, the integration of machine learning algorithms has demonstrated remarkable capabilities. Additionally, these advancements have significant implications. In conclusion, this represents a paradigm shift.';
  const before = api.detectAI(aiText).aiScore;
  let bestAfter = 100;
  for (let i = 0; i < 5; i++) {
    const humanized = api.humanizeText(aiText, 'enhanced', 'casual');
    const after = api.detectAI(humanized).aiScore;
    if (after < bestAfter) bestAfter = after;
  }
  console.log(`        Before: ${before}% → After: ${bestAfter}%`);
  return bestAfter < before;
});

// 21b — regression: sentence connectors must not break acronyms ("AI" → "aI")
test('Regression: humanizer never produces lowercase "aI"', () => {
  let bad = 0;
  const input = 'AI is changing the world. The AI models are improving quickly.';
  for (let i = 0; i < 30; i++) {
    const out = api.humanizeText(input, 'enhanced', 'casual');
    if (/\baI\b/.test(out)) { bad++; console.log(`        Bad output: "${out}"`); }
  }
  console.log(`        Broken acronym in ${bad}/30 runs`);
  return bad === 0;
});

// 21c — regression: inflection agreement ("utilizes" must stay "uses", never "use")
test('Regression: humanizer keeps verb agreement (no "We uses")', () => {
  let bad = 0;
  const input = 'We utilize advanced algorithms. She utilizes them daily.';
  for (let i = 0; i < 30; i++) {
    const out = api.humanizeText(input, 'enhanced', 'natural');
    if (/\b(We|I|They|You) uses\b|\b(He|She|It) use\b/i.test(out)) {
      bad++; console.log(`        Bad output: "${out}"`);
    }
  }
  console.log(`        Broken agreement in ${bad}/30 runs`);
  return bad === 0;
});

// 22
test('escapeHtml escapes dangerous characters', () => {
  const r = api.escapeHtml('<script>alert("xss")</script>');
  console.log(`        Out: "${r}"`);
  return !r.includes('<script>') && r.includes('&lt;');
});

// 23
test('SAMPLE_TEXT exists and is substantial', () => {
  const wc = api.countWords(api.SAMPLE_TEXT);
  console.log(`        ${api.SAMPLE_TEXT.length} chars, ${wc} words`);
  return api.SAMPLE_TEXT.length > 200 && wc > 50;
});

// ===== FIDELITY TESTS (from the referenced humanizer write-up) =====

test('FIDELITY: "an estimated 4.2%" survives every rewrite', () => {
  const input = 'An estimated 4.2% of users reported issues. The data suggest a possible cause.';
  let bad = 0;
  for (let i = 0; i < 20; i++) {
    const out = api.humanizeText(input, 'enhanced', 'casual');
    if (!/estimated 4\.2%/i.test(out)) { bad++; console.log(`        Bad: "${out}"`); }
  }
  console.log(`        Qualifier dropped in ${bad}/20 runs`);
  return bad === 0;
});

test('FIDELITY: "suggest" is never upgraded to "conclude/show"', () => {
  const input = 'The data suggest a link. This suggests further study is needed.';
  let bad = 0;
  for (let i = 0; i < 20; i++) {
    const out = api.humanizeText(input, 'enhanced', 'natural');
    if (!/suggest/i.test(out)) { bad++; console.log(`        Bad: "${out}"`); }
  }
  console.log(`        Hedge lost in ${bad}/20 runs`);
  return bad === 0;
});

test('FIDELITY: numbers, dates and names survive rewriting', () => {
  const input = 'On March 15, 2026, Dr. Jane Smith reported 1,200 cases in 12 countries.';
  let bad = 0;
  for (let i = 0; i < 20; i++) {
    const out = api.humanizeText(input, 'enhanced', 'casual');
    if (!/March 15, 2026/.test(out) || !/1,200/.test(out) || !/12 countries/.test(out)) {
      bad++; console.log(`        Bad: "${out}"`);
    }
  }
  console.log(`        Facts damaged in ${bad}/20 runs`);
  return bad === 0;
});

test('REGISTER: informal slang is not flattened to generic prose', () => {
  const input = "Honestly, that's kinda awesome — gonna grab one, you know? lol";
  let flattened = 0;
  for (let i = 0; i < 20; i++) {
    const out = api.humanizeText(input, 'enhanced', 'business');
    if (!/kinda|awesome|gonna|lol|you know/i.test(out)) {
      flattened++; console.log(`        Flattened: "${out}"`);
    }
  }
  console.log(`        Register flattened in ${flattened}/20 runs`);
  return flattened === 0;
});

test('REGISTER: detectRegister identifies informal text', () =>
  api.detectRegister('lol yeah that is awesome!') === 'informal' &&
  api.detectRegister('The results indicate a measurable effect.') === 'neutral'
);

test('REUSE: verbatim 5-gram copy stays low', () => {
  const input = 'Furthermore, the integration of machine learning algorithms has demonstrated remarkable capabilities across a wide range of applications. Moreover, these systems are being deployed in many industries.';
  const reuses = [];
  for (let i = 0; i < 10; i++) {
    reuses.push(api.computeReuse(input, api.humanizeText(input, 'enhanced', 'natural')));
  }
  const median = reuses.sort((a,b)=>a-b)[5];
  console.log(`        Median reuse: ${(median*100).toFixed(1)}%`);
  return median < 0.35;
});

test('FIDELITY: rewriter never invents a contrast ("But ...")', () => {
  const input = 'The system is fast. The system is reliable.';
  let bad = 0;
  for (let i = 0; i < 30; i++) {
    const out = api.humanizeText(input, 'enhanced', 'casual');
    if (/\bBut\b/.test(out)) { bad++; console.log(`        Bad: "${out}"`); }
  }
  console.log(`        Invented contrast in ${bad}/30 runs`);
  return bad === 0;
});

test('protect/restore is lossless on its own', () => {
  const input = 'An estimated 4.2% of users, about 12 of them, said maybe.';
  const locked = api.protectSpans(input);
  const restored = api.restoreSpans(locked.text, locked.spans);
  console.log(`        Protected ${locked.spans.length} spans`);
  // "about 12" is one span (longest-first), so 3 is the correct count.
  return restored === input && locked.spans.length >= 3;
});

// ===== CLIPPING TESTS (Li et al. 2026, arXiv 2609.29935) =====

test('clipping floor is derived from the calibration corpus', () => {
  const floor = api.clippingFloor(0.80);
  console.log(`        Floor (q=0.80): ${floor}`);
  return floor > 0 && floor <= 30;
});

test('clippedAverage raises low outliers but leaves others alone', () => {
  const floor = 25;
  const raw = [10, 60, 65];
  const clipped = api.clippedAverage(raw, floor); // (25+60+65)/3 = 50
  console.log(`        raw mean=${(raw.reduce((a,b)=>a+b,0)/3).toFixed(1)} clipped=${clipped.toFixed(1)}`);
  return Math.abs(clipped - 50) < 0.01 &&
         api.clippedAverage([40, 50, 60], floor) === 50;
});

test('detectAI reports both raw and clipped scores', () => {
  const r = api.detectAI('Furthermore, the data suggest a link. Moreover, it is important to note that results may vary.');
  console.log(`        raw=${r.rawScore} clipped=${r.clippedScore} floor=${r.clippingFloor}`);
  return typeof r.rawScore === 'number' && typeof r.clippedScore === 'number' &&
         r.clippedScore >= r.rawScore;
});

test('CLIPPING: partially human-edited AI text scores higher than raw', () => {
  // 5 obvious AI sentences, 2 human ones swapped in (29% contamination).
  const contaminated = [
    'The cashier was really nice, she smiled at me!',
    'Furthermore, the integration of machine learning has demonstrated remarkable capabilities.',
    'Moreover, it is important to note that these advancements have significant implications.',
    "Honestly, I don't know what to tell you.",
    'Consequently, organizations must leverage robust frameworks to facilitate operations.',
    'Additionally, a wide range of factors may influence the outcome.',
    'The system utilizes advanced algorithms to optimize performance across domains.'
  ].join(' ');
  const r = api.detectAI(contaminated);
  console.log(`        raw=${r.rawScore} clipped=${r.clippedScore} gap=${r.clippedScore - r.rawScore}`);
  console.log(`        final AI score=${r.aiScore}%`);
  return r.clippedScore > r.rawScore;
});

test('CLIPPING: clean human text is not inflated much', () => {
  const human = api.CALIBRATION_HUMAN.join(' ');
  const r = api.detectAI(human);
  console.log(`        raw=${r.rawScore} clipped=${r.clippedScore} final=${r.aiScore}%`);
  return r.clippedScore - r.rawScore <= 10 && r.aiScore < 50;
});

console.log('\n========================================');
console.log(`  Results: ${pass} passed, ${fail} failed`);
console.log('========================================');
process.exit(fail > 0 ? 1 : 0);
