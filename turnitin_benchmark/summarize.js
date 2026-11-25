// Summarize Turnitin AIW results for a benchmark run.
// Usage:
//   node turnitin_benchmark/summarize.js --run-id smoke_local_std
//
// It refuses to invent scores. Unscored rows are reported as PENDING.

const fs = require('fs');
const path = require('path');

const BENCH = __dirname;

function parseArgs(argv) {
  const out = { runId: null, results: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--run-id') out.runId = argv[++i];
    else if (a === '--results') out.results = argv[++i];
    else if (a.startsWith('--run-id=')) out.runId = a.slice(9);
    else if (a.startsWith('--results=')) out.results = a.slice(10);
  }
  if (!out.runId) throw new Error('Missing --run-id');
  out.runDir = path.join(BENCH, 'runs', out.runId);
  out.results = out.results || path.join(out.runDir, 'results.csv');
  return out;
}

function parseCsv(text) {
  const rows = [];
  let row = [], cur = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (c !== '\r') cur += c;
    }
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const header = rows.shift().map(h => h.trim());
  return rows.filter(r => r.some(x => x.trim())).map(r =>
    Object.fromEntries(header.map((h, i) => [h, (r[i] || '').trim()]))
  );
}

function wilson(k, n, z = 1.96) {
  if (!n) return { lower: 0, upper: 0 };
  const p = k / n;
  const denom = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / denom;
  const half = z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n) / denom;
  return { lower: Math.max(0, center - half), upper: Math.min(1, center + half) };
}

function interpret(row) {
  const display = (row.display_score || '').trim();
  const raw = (row.raw_score || '').trim();
  const explicit = (row.no_action_pass || '').trim().toLowerCase();
  if (['true', 'yes', '1', 'pass'].includes(explicit)) return true;
  if (['false', 'no', '0', 'fail'].includes(explicit)) return false;
  if (/^\*%$/.test(display)) return true;
  if (/^0(\.0+)?%$/.test(display)) return true;
  const dm = display.match(/^(\d+(?:\.\d+)?)%$/);
  if (dm) return Number(dm[1]) < 20;
  const rm = raw.match(/^(\d+(?:\.\d+)?)%?$/);
  if (rm) return Number(rm[1]) < 20;
  return null;
}

function pct(x) { return (x * 100).toFixed(1) + '%'; }

function scoreGroup(rows, label) {
  const scored = rows.map(r => ({ r, pass: interpret(r) })).filter(x => x.pass !== null);
  const pending = rows.length - scored.length;
  const k = scored.filter(x => x.pass).length;
  const n = scored.length;
  const ci = wilson(k, n);
  return {
    label,
    total: rows.length,
    scored: n,
    pending,
    pass: k,
    pass_rate: n ? k / n : null,
    ci95: n ? [ci.lower, ci.upper] : null
  };
}

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r) || 'unknown';
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}

function main() {
  const args = parseArgs(process.argv);
  const results = parseCsv(fs.readFileSync(args.results, 'utf8'));
  const metaPath = path.join(args.runDir, 'outputs.jsonl');
  const meta = fs.readFileSync(metaPath, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
  const metaBySample = new Map(meta.map(m => [m.sample_id, m]));

  const enriched = results.map(r => ({ ...r, ...(metaBySample.get(r.sample_id) || {}) }));
  const overall = scoreGroup(enriched, 'overall');

  console.log('========================================');
  console.log(`  TURNITIN SCORECARD — ${args.runId}`);
  console.log('========================================\n');

  console.log(`Rows: ${overall.total}`);
  console.log(`Scored: ${overall.scored}`);
  console.log(`Pending: ${overall.pending}`);

  if (!overall.scored) {
    console.log('\nNo Turnitin results entered yet.');
    console.log('Fill results.csv from an authorized Turnitin Originality account, then rerun this script.');
    console.log('Do not use scores from unofficial "Turnitin checker" websites.\n');
    return;
  }

  console.log(`Pass: ${overall.pass}/${overall.scored}`);
  console.log(`Pass rate: ${pct(overall.pass_rate)}`);
  console.log(`Wilson 95% CI: ${pct(overall.ci95[0])} – ${pct(overall.ci95[1])}`);
  if (overall.ci95[0] >= 0.93) {
    console.log('Claim gate: PASS — lower CI bound is at or above 93%.');
  } else {
    console.log('Claim gate: NOT MET — point estimate and lower CI bound must support the claim.');
  }

  console.log('\nStrata:');
  const strata = [
    ['domain', r => r.domain],
    ['engine', r => r.engine],
    ['strength', r => r.strength],
    ['tone', r => r.tone],
    ['variant', r => r.variant],
    ['generator', r => r.generator]
  ];
  for (const [name, fn] of strata) {
    console.log(`\n  by ${name}`);
    for (const [key, rows] of groupBy(enriched, fn)) {
      const s = scoreGroup(rows, key);
      const rate = s.scored ? pct(s.pass_rate) : 'n/a';
      console.log(`    ${key.padEnd(24)} ${String(s.pass).padStart(3)}/${String(s.scored).padEnd(3)} ${rate.padStart(7)}  pending=${s.pending}`);
    }
  }

  const critical = meta.filter(m => m.fidelity && m.fidelity.critical).length;
  const missingNumbers = meta.filter(m => m.fidelity && m.fidelity.missing_numbers.length).length;
  const missingQual = meta.filter(m => m.fidelity && m.fidelity.missing_qualifiers.length).length;
  const maxReuse = Math.max(...meta.map(m => m.reuse || 0));
  const meanReuse = meta.reduce((a, m) => a + (m.reuse || 0), 0) / (meta.length || 1);

  console.log('\nFidelity / reuse:');
  console.log(`  critical fidelity failures: ${critical}/${meta.length}`);
  console.log(`  missing numbers:            ${missingNumbers}/${meta.length}`);
  console.log(`  missing qualifiers:         ${missingQual}/${meta.length}`);
  console.log(`  mean reuse:                 ${meanReuse.toFixed(3)}`);
  console.log(`  max reuse:                  ${maxReuse.toFixed(3)}`);

  const scorecard = {
    run_id: args.runId,
    generated_at: new Date().toISOString(),
    detector: 'Turnitin AI Writing Detection',
    metric: 'no_action_pass',
    overall,
    fidelity: { critical, missingNumbers, missingQual, meanReuse, maxReuse }
  };
  fs.writeFileSync(path.join(args.runDir, 'scorecard.json'), JSON.stringify(scorecard, null, 2) + '\n', 'utf8');
  console.log(`\nWrote: ${path.join(args.runDir, 'scorecard.json')}\n`);
}

try { main(); } catch (e) { console.error('FAILED:', e.message); process.exit(1); }
