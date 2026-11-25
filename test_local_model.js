// Smoke-test the local llama.cpp humanizer endpoint.
// Start the server first with: ./run_local.sh
// Then run: node test_local_model.js

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PF = JSON.parse(fs.readFileSync(path.join(ROOT, 'local-model/gguf/prompt_format.json'), 'utf8'));
const corpusPath = path.join(ROOT, 'turnitin_benchmark/corpus.v0.1.jsonl');
const sample = fs.readFileSync(corpusPath, 'utf8').trim().split(/\r?\n/).map(JSON.parse)[0];
const port = process.env.PORT || '8080';

const prompt = PF.instr + '\n\n' + sample.text.trim() + PF.sep;

async function main() {
  const res = await fetch(`http://127.0.0.1:${port}/completion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = (data.content || '').trim();
  if (!text) throw new Error('Empty completion');

  const out = path.join(ROOT, 'local-model/last_test_output.txt');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, text + '\n', 'utf8');

  const nums = s => (s.match(/\b\d[\d,.]*\s*(?:%|percent|million|billion|thousand|hours?|days?|years?)?\b/gi) || []).sort();
  const before = nums(sample.text);
  const after = nums(text);
  const missing = before.filter(n => !after.includes(n));
  const added = after.filter(n => !before.includes(n));

  console.log('Local model smoke test: OK');
  console.log(`Sample: ${sample.id}`);
  console.log(`Output chars: ${text.length}`);
  console.log(`Missing numbers: ${missing.length ? missing.join(', ') : 'none'}`);
  console.log(`Added numbers: ${added.length ? added.join(', ') : 'none'}`);
  console.log(`Saved: ${out}`);
  console.log('\n--- OUTPUT ---\n');
  console.log(text);
}

main().catch(err => {
  console.error('FAILED:', err.message);
  console.error('Is run_local.sh running on port ' + port + '?');
  process.exit(1);
});
