// Generate Turnitin-ready rewrite outputs from the smoke corpus.
// Usage:
//   node turnitin_benchmark/generate_outputs.js --engine local --strength standard --tone natural --run-id smoke_local_std
//   HF_TOKEN=hf_xxx node turnitin_benchmark/generate_outputs.js --engine model --run-id smoke_model
//
// No Turnitin calls are made here. This only creates files and metadata.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const BENCH = __dirname;
const FidelityGuard = require(path.join(ROOT, 'fidelity_guard.js'));

function parseArgs(argv) {
  const out = {
    engine: 'local',
    strength: 'standard',
    tone: 'natural',
    runId: null,
    corpus: path.join(BENCH, 'corpus.v0.1.jsonl'),
    token: process.env.HF_TOKEN || '',
    port: process.env.PORT || '8080',
    resume: false,
    limit: null
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--engine') out.engine = argv[++i];
    else if (a === '--strength') out.strength = argv[++i];
    else if (a === '--tone') out.tone = argv[++i];
    else if (a === '--run-id') out.runId = argv[++i];
    else if (a === '--corpus') out.corpus = argv[++i];
    else if (a.startsWith('--engine=')) out.engine = a.slice(9);
    else if (a.startsWith('--strength=')) out.strength = a.slice(11);
    else if (a.startsWith('--tone=')) out.tone = a.slice(7);
    else if (a.startsWith('--run-id=')) out.runId = a.slice(9);
    else if (a.startsWith('--corpus=')) out.corpus = a.slice(9);
    else if (a === '--port') out.port = argv[++i];
    else if (a.startsWith('--port=')) out.port = a.slice(7);
    else if (a === '--resume') out.resume = true;
    else if (a === '--limit') out.limit = Number(argv[++i]);
    else if (a.startsWith('--limit=')) out.limit = Number(a.slice(8));
  }
  if (!out.runId) out.runId = `smoke_${out.engine}_${out.strength}_${out.tone}`;
  if (!['local', 'model', 'local-server'].includes(out.engine)) throw new Error(`Unknown engine: ${out.engine}`);
  return out;
}

function makeSeededMath(seed) {
  let a = seed >>> 0;
  const m = Object.create(Math);
  m.random = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return m;
}

function hash(s) {
  return crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
}

async function callLocalModel(draft, port) {
  const pfPath = path.join(ROOT, 'local-model/gguf/prompt_format.json');
  const pf = JSON.parse(fs.readFileSync(pfPath, 'utf8'));
  const prompt = pf.instr + '\n\n' + draft.trim() + pf.sep;
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/completion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Connection': 'close' },
        body: JSON.stringify({
          prompt,
          temperature: 1.0,
          top_p: 0.95,
          top_k: 0,
          min_p: 0,
          repeat_penalty: 1.0,
          n_predict: 2048
        })
      });
      if (!res.ok) throw new Error(`Local server HTTP ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const text = (data.content || '').trim();
      if (!text) throw new Error('Local server returned an empty completion');
      return { text, copyRate: null, timings: data.timings || null };
    } catch (e) {
      lastErr = e;
      if (attempt < 3) console.error(`Local model attempt ${attempt} failed: ${e.message}; retrying`);
    }
  }
  throw lastErr;
}

const QUALIFIER_LEMMAS = [
  'estimate', 'approximately', 'rough', 'about', 'around', 'nearly', 'almost',
  'over', 'under', 'at least', 'up to', 'less than', 'more than', 'exactly',
  'may', 'might', 'suggest', 'can', 'could', 'likely', 'unlikely', 'possible',
  'typically', 'generally', 'often', 'sometimes', 'significant'
];

function stemQualifier(w) {
  const s = w.toLowerCase().replace(/[^a-z ]/g, '').trim();
  if (!s) return s;
  if (s.endsWith('ies') && s.length > 4) return s.slice(0, -3) + 'y';
  if (s.endsWith('ing') && s.length > 5) return s.slice(0, -3);
  if (s.endsWith('ed') && s.length > 4) return s.slice(0, -2);
  if (s.endsWith('es') && s.length > 4) return s.slice(0, -2);
  if (s.endsWith('s') && s.length > 3) return s.slice(0, -1);
  return s;
}

function extractNumbers(text) {
  const re = /\b\d[\d,.]*\s*(?:%|percent|percentage points?|million|billion|thousand|trillion|kg|km|hours?|days?|weeks?|months?|years?)?\b/gi;
  return (text.match(re) || [])
    .map(x => x.toLowerCase().replace(/\s+/g, ' ').trim())
    .sort();
}

function extractQualifiers(text) {
  const lower = text.toLowerCase();
  const found = new Set();
  for (const lemma of QUALIFIER_LEMMAS) {
    const re = new RegExp('\\b' + lemma.replace(/ /g, '\\s+') + '(s|es|ed|ing)?\\b', 'g');
    if (re.test(lower)) found.add(lemma);
  }
  return Array.from(found).sort();
}

function diff(a, b) {
  const setB = new Set(b);
  const setA = new Set(a);
  return {
    missing: a.filter(x => !setB.has(x)),
    added: b.filter(x => !setA.has(x))
  };
}

function csvEscape(v) {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function loadApi(args) {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('No <script> block found in index.html');

  const fakeEl = {
    value: '', textContent: '', innerHTML: '', disabled: false, style: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {}, click() {}
  };

  const sandbox = {
    document: {
      getElementById: () => fakeEl,
      querySelector: () => ({ addEventListener() {}, click() {} }),
      querySelectorAll: () => [],
      createElement: () => ({ textContent: '', innerHTML: '' })
    },
    navigator: { clipboard: { writeText() {} } },
    console,
    Math: makeSeededMath(0xC0FFEE),
    Date,
    JSON,
    RegExp,
    Set,
    Map,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Promise,
    fetch,
    AbortController,
    TextDecoder,
    setTimeout,
    clearTimeout,
    encodeURIComponent
  };

  vm.createContext(sandbox);
  vm.runInContext(m[1], sandbox);
  vm.runInContext(`STATE.hfToken = ${JSON.stringify(args.token)}`, sandbox);

  return {
    humanizeText: sandbox.humanizeText,
    callHumanizerModel: sandbox.callHumanizerModel,
    callLocalModel,
    computeReuse: sandbox.computeReuse,
    STATE: vm.runInContext('STATE', sandbox)
  };
}

async function main() {
  const args = parseArgs(process.argv);
  let corpus = fs.readFileSync(args.corpus, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
  if (args.limit) corpus = corpus.slice(0, args.limit);
  const api = loadApi(args);
  const runDir = path.join(BENCH, 'runs', args.runId);
  const txtDir = path.join(runDir, 'txt');
  fs.mkdirSync(txtDir, { recursive: true });

  const summaryPath = path.join(runDir, 'outputs.jsonl');
  const resultsPath = path.join(runDir, 'results.csv');
  const header = [
    'sample_id', 'run_id', 'variant', 'engine', 'strength', 'tone', 'rewrite_hash',
    'submission_date', 'turnitin_model_date', 'display_score', 'raw_score',
    'highlighted_sentences', 'no_action_pass', 'note'
  ];

  let summaryRows = [];
  let resultRows = [];
  if (args.resume && fs.existsSync(summaryPath)) {
    summaryRows = fs.readFileSync(summaryPath, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
  }
  if (args.resume && fs.existsSync(resultsPath)) {
    resultRows = fs.readFileSync(resultsPath, 'utf8').trim().split(/\r?\n/).slice(1).filter(Boolean).map(line => line.split(','));
  }
  const done = new Set(summaryRows.map(r => r.sample_id));
  if (!args.resume) {
    fs.writeFileSync(summaryPath, '', 'utf8');
    fs.writeFileSync(resultsPath, header.join(',') + '\n', 'utf8');
  } else if (!fs.existsSync(resultsPath)) {
    fs.writeFileSync(resultsPath, header.join(',') + '\n', 'utf8');
  }

  console.log(`Generating ${corpus.length} outputs | engine=${args.engine} strength=${args.strength} tone=${args.tone} run=${args.runId}${args.resume ? ' (resume)' : ''}`);

  for (const sample of corpus) {
    if (done.has(sample.id)) {
      console.log(`SKIP ${sample.id} (already generated)`);
      continue;
    }
    let rewrite;
    let modelMeta = {};

    if (args.engine === 'model') {
      const r = await api.callHumanizerModel(sample.text);
      rewrite = r.text;
      modelMeta = {
        copyRate: r.copyRate,
        modelMissingNumbers: r.missingNumbers,
        modelAddedNumbers: r.addedNumbers,
        tokens: r.tokens,
        seconds: r.seconds,
        truncated: r.truncated
      };
    } else if (args.engine === 'local-server') {
      const r = await api.callLocalModel(sample.text, args.port);
      rewrite = r.text;
      modelMeta = { copyRate: r.copyRate, localServer: true, timings: r.timings };
    } else {
      rewrite = api.humanizeText(sample.text, args.strength, args.tone);
    }

    if (!rewrite || !rewrite.trim()) throw new Error(`Empty rewrite for ${sample.id}`);

    const fidelityReport = FidelityGuard.verifyFidelity(sample.text, rewrite);

    const row = {
      sample_id: sample.id,
      domain: sample.domain,
      generator: sample.generator,
      title: sample.title,
      run_id: args.runId,
      engine: args.engine,
      strength: args.strength,
      tone: args.tone,
      original_hash: hash(sample.text),
      rewrite_hash: hash(rewrite),
      original_words: sample.text.trim().split(/\s+/).length,
      rewrite_words: rewrite.trim().split(/\s+/).length,
      reuse: Number(api.computeReuse(sample.text, rewrite).toFixed(4)),
      fidelity: {
        passed: fidelityReport.passed,
        critical: !fidelityReport.passed,
        critical_violations: fidelityReport.criticalViolations,
        advisories: fidelityReport.advisories,
        missing_numbers: fidelityReport.entityDiff.numbers.missing,
        added_numbers: fidelityReport.entityDiff.numbers.added,
        missing_dates: fidelityReport.entityDiff.dates.missing,
        added_dates: fidelityReport.entityDiff.dates.added,
        missing_citations: fidelityReport.entityDiff.citations.missing,
        missing_qualifiers: fidelityReport.entityDiff.qualifiers.dropped,
        added_qualifiers: []
      },
      ...modelMeta
    };

    const file = path.join(txtDir, `${sample.id}.txt`);
    fs.writeFileSync(file, rewrite + '\n', 'utf8');
    row.file = path.relative(BENCH, file).replace(/\\/g, '/');
    summaryRows.push(row);

    const noteText = fidelityReport.passed
      ? 'PENDING'
      : `PENDING (FIDELITY FAIL: ${fidelityReport.criticalViolations.map(v => v.items.join('|')).join(';')})`;

    resultRows.push([
      sample.id,
      args.runId,
      `${args.engine}_${args.strength}_${args.tone}`,
      args.engine,
      args.strength,
      args.tone,
      row.rewrite_hash,
      '',
      '',
      '',
      '',
      '',
      '',
      noteText
    ]);

    fs.appendFileSync(summaryPath, JSON.stringify(row) + '\n', 'utf8');
    fs.appendFileSync(resultsPath, resultRows[resultRows.length - 1].map(csvEscape).join(',') + '\n', 'utf8');
    
    if (!fidelityReport.passed) {
      console.warn(`⚠️ FIDELITY ALERT ${sample.id}: ${fidelityReport.criticalViolations.map(v => v.message).join(' | ')}`);
    }
    console.log(`DONE ${sample.id} reuse=${row.reuse} words=${row.rewrite_words} fidelity=${fidelityReport.passed ? 'PASS' : 'FAIL'}`);
  }

  const critical = summaryRows.filter(r => r.fidelity.critical).length;
  const maxReuse = Math.max(...summaryRows.map(r => r.reuse));
  console.log(`Wrote: ${summaryPath}`);
  console.log(`Wrote: ${resultsPath}`);
  console.log(`Critical fidelity failures: ${critical}/${summaryRows.length}`);
  console.log(`Max reuse: ${maxReuse.toFixed(3)}`);
  console.log('Turnitin results are PENDING. Do not invent or paste scores from unofficial checkers.');
}

main().catch(err => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
