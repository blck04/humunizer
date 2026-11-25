// End-to-end test of the real model client in index.html.
// Hits the live public Gradio Space and verifies fidelity metadata.
const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];

const fakeEl = {
  value: '', textContent: '', innerHTML: '', title: '', disabled: false, style: {},
  classList: { add(){}, remove(){}, contains(){ return false; } },
  querySelector(){ return null; }, querySelectorAll(){ return []; },
  addEventListener(){}, click(){}
};

const sandbox = {
  document: {
    getElementById: () => fakeEl,
    querySelector: () => ({ addEventListener(){}, click(){} }),
    querySelectorAll: () => [],
    createElement: () => ({ textContent: '', innerHTML: '' })
  },
  navigator: { clipboard: { writeText(){} } },
  fetch: global.fetch,
  AbortController: global.AbortController,
  TextDecoder: global.TextDecoder,
  setTimeout, clearTimeout, clearInterval, setInterval,
  console, Math, Date, JSON, RegExp, Set, Map, Array, Object,
  String, Number, Boolean, Promise, Error
};

vm.createContext(sandbox);
vm.runInContext(js, sandbox);

const call = name => vm.runInContext(name, sandbox);

console.log('========================================');
console.log('  LIVE MODEL CLIENT TEST');
console.log('========================================\n');

let pass = 0, fail = 0, skip = 0;
function test(name, fn) {
  return Promise.resolve().then(fn).then(ok => {
    if (ok !== false) { console.log(`  PASS  ${name}`); pass++; }
    else { console.log(`  FAIL  ${name}`); fail++; }
  }).catch(e => { console.log(`  FAIL  ${name} — ${e.message}`); fail++; });
}
function skipped(name, why) {
  console.log(`  SKIP  ${name}`);
  console.log(`        ${why}`);
  skip++;
}

(async () => {
  // 1. Prompt built from the local config must match the published fingerprint.
  await test('Prompt is byte-for-byte correct (fingerprint cc51d66b4c593fbe)', () => {
    const pf = JSON.parse(fs.readFileSync(__dirname + '/prompt_format.json', 'utf8'));
    const prompt = pf.instr + '\n\n' + 'X' + pf.sep;
    const fp = crypto.createHash('sha256').update(prompt).digest('hex').slice(0, 16);
    console.log(`        Computed fingerprint: ${fp}`);
    return fp === pf.fingerprint && fp === 'cc51d66b4c593fbe';
  });

  // 2. buildCompletionPrompt in the app uses the same bytes.
  await test('App buildCompletionPrompt matches prompt_format.json', () => {
    const pf = JSON.parse(fs.readFileSync(__dirname + '/prompt_format.json', 'utf8'));
    const built = call('buildCompletionPrompt')("X");
    return built === pf.instr + '\n\n' + 'X' + pf.sep;
  });

  // 3. Live model call. A quota limit is an environmental limit, not a code bug.
  const draft = 'Furthermore, the integration of machine learning algorithms has demonstrated remarkable capabilities. An estimated 4.2% of users reported issues.';
  let meta, quotaError = null;
  try {
    meta = await call('callHumanizerModel')(draft);
    console.log(`  PASS  Live 12B model returns a rewrite`);
    pass++;
    console.log(`        Rewrite: "${meta.text.slice(0, 120)}"`);
  } catch (e) {
    if (/quota|limit|authenticate/i.test(e.message)) {
      quotaError = e.message;
      skipped('Live 12B model returns a rewrite', 'Public Space free quota exhausted (not a code failure).');
    } else {
      console.log(`  FAIL  Live 12B model returns a rewrite — ${e.message}`);
      fail++;
    }
  }

  if (meta) {
    await test('Model returns fidelity metadata', () => {
      console.log(`        copy_rate=${meta.copyRate} missing=${JSON.stringify(meta.missingNumbers)} added=${JSON.stringify(meta.addedNumbers)}`);
      return typeof meta.copyRate === 'number' &&
             Array.isArray(meta.missingNumbers) &&
             Array.isArray(meta.addedNumbers);
    });
    await test('Number 4.2 survives the real rewrite', () => {
      const ok = /4\.2/.test(meta.text);
      console.log(`        Number preserved: ${ok}`);
      return ok;
    });
    await test('Verbatim copy rate below 35%', () => {
      console.log(`        copy_rate=${(meta.copyRate * 100).toFixed(1)}%`);
      return meta.copyRate < 0.35;
    });
  } else {
    skipped('Model returns fidelity metadata', 'Requires a successful live call.');
    skipped('Number 4.2 survives the real rewrite', 'Requires a successful live call.');
    skipped('Verbatim copy rate below 35%', 'Requires a successful live call.');
  }

  // Quota errors must carry actionable guidance in the UI.
  await test('Quota errors explain the fix', () => {
    if (!quotaError) return true;
    const ok = /token/i.test(quotaError) && /Local rules/i.test(quotaError);
    console.log(`        Message: "${quotaError.slice(-110)}"`);
    return ok;
  });

  console.log('\n========================================');
  console.log(`  Results: ${pass} passed, ${fail} failed, ${skip} skipped`);
  console.log('========================================');
  process.exit(fail > 0 ? 1 : 0);
})();
