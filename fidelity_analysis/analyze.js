// Automated checks for the supplied original vs humanized text.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const original = fs.readFileSync(path.join(__dirname, 'original.txt'), 'utf8');
const rewritten = fs.readFileSync(path.join(__dirname, 'rewritten.txt'), 'utf8');

// Reuse computeReuse from the app so this check matches the benchmark harness.
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const fakeEl = {
  value: '', textContent: '', innerHTML: '', disabled: false, style: {},
  classList: { add() {}, remove() {}, contains() { return false; } },
  querySelector() { return null; }, querySelectorAll() { return []; },
  addEventListener() {}, click() {}
};
const sandbox = {
  document: { getElementById: () => fakeEl, querySelector: () => ({ addEventListener() {}, click() {} }), querySelectorAll: () => [], createElement: () => ({}) },
  navigator: { clipboard: { writeText() {} } }, console, Math, Date, JSON, RegExp, Set, Map,
  Array, Object, String, Number, Boolean, Promise, setTimeout, clearTimeout
};
vm.createContext(sandbox);
vm.runInContext(script, sandbox);
const computeReuse = sandbox.computeReuse;

function words(s) { return s.trim() ? s.trim().split(/\s+/).length : 0; }
function sentences(s) { return s.match(/[^.!?]+[.!?]+/g) || []; }

function numbers(s) {
  const re = /\b\d+(?:[.,]\d+)*\s*(?:%|percent|percentage points?|million|billion|thousand|kg|km|hours?|days?|weeks?|months?|years?)?\b/gi;
  return (s.match(re) || []).map(x => x.toLowerCase().replace(/\s+/g, ' ').trim()).sort();
}
function wordNumbers(s) {
  const map = { one:'1', two:'2', three:'3', four:'4', five:'5', six:'6', seven:'7', eight:'8', nine:'9', ten:'10', eleven:'11', twelve:'12', twenty:'20' };
  const found = [];
  for (const [w, n] of Object.entries(map)) if (new RegExp('\\b' + w + '\\b', 'i').test(s)) found.push(n);
  return found.sort();
}
function citations(s) {
  return (s.match(/\b[A-Z][a-z]+(?:\s*(?:&|and)\s*[A-Z][a-z]+)?\s*\(?\d{4}\)?/g) || []).sort();
}
function headings(s) {
  return s.split(/\n/).map(x => x.trim()).filter(x => /^(\d+(?:\.\d+)*\.?\s|Chapter|Figure|Table)/.test(x));
}
function diff(a, b) {
  const A = new Set(a), B = new Set(b);
  return { missing: a.filter(x => !B.has(x)), added: b.filter(x => !A.has(x)) };
}

const numDiff = diff(numbers(original), numbers(rewritten));
const wordNumDiff = diff(wordNumbers(original), wordNumbers(rewritten));
const citeDiff = diff(citations(original), citations(rewritten));
const headDiff = diff(headings(original), headings(rewritten));

console.log(JSON.stringify({
  original_words: words(original),
  rewritten_words: words(rewritten),
  original_sentences: sentences(original).length,
  rewritten_sentences: sentences(rewritten).length,
  reuse: Number(computeReuse(original, rewritten).toFixed(4)),
  numeric: {
    original: numbers(original),
    rewritten: numbers(rewritten),
    diff: numDiff
  },
  spelled_numbers: {
    original: wordNumbers(original),
    rewritten: wordNumbers(rewritten),
    diff: wordNumDiff
  },
  citations: {
    original: citations(original),
    rewritten: citations(rewritten),
    diff: citeDiff
  },
  headings: {
    original: headings(original),
    rewritten: headings(rewritten),
    diff: headDiff
  }
}, null, 2));
