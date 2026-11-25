// test_doc_parser.js — Tests for doc_parser.js
const assert = require('assert');
const docParser = require('./doc_parser.js');

console.log('========================================');
console.log('  DocParser & Layout Classifier Tests');
console.log('========================================\n');

let pass = 0, fail = 0;
function test(name, fn) {
  try {
    const result = fn();
    if (result !== false) { console.log(`  PASS  ${name}`); pass++; }
    else { console.log(`  FAIL  ${name}`); fail++; }
  } catch(e) { console.log(`  FAIL  ${name} — ${e.message}`); fail++; }
}

const sampleDocument = `Table of Contents
1. Introduction ................................. 1
2. Background and Related Work .................. 4
3. Methodology and Architecture ................. 12
4. Experimental Evaluation ...................... 25

Chapter 1: Introduction

Artificial intelligence has seen rapid advancements in recent years, particularly in natural language generation. Large language models are now capable of generating coherent, contextually relevant text across a wide range of tasks and domains.

Furthermore, these developments have created new challenges in distinguishing between human-written and machine-generated content, raising important questions for academic integrity and content authenticity.

| Model Name | Parameters | Turnitin Score |
| --- | --- | --- |
| GPT-4 | Unknown | 85% |
| Gemma-12B | 12 Billion | 12% |

Figure 1.1: System architecture for automated fidelity-preserving rewriting.

The proposed architecture incorporates a fact-locking filter alongside a fine-tuned Gemma 12B model. By decoupling factual preservation from style adjustment, the system ensures that numbers, dates, and named entities remain completely untouched during rewriting.`;

// 1. Classification
test('Identifies TOC block correctly', () => {
  const blocks = docParser.parseText(sampleDocument);
  const toc = blocks.find(b => b.type === 'toc');
  return toc && toc.filterTurnitin === true && toc.label === 'Table of Contents';
});

test('Identifies Table block correctly', () => {
  const blocks = docParser.parseText(sampleDocument);
  const table = blocks.find(b => b.type === 'table');
  return table && table.filterTurnitin === true && table.rawContent.includes('GPT-4');
});

test('Identifies Figure / Diagram caption correctly', () => {
  const blocks = docParser.parseText(sampleDocument);
  const figure = blocks.find(b => b.type === 'figure');
  return figure && figure.filterTurnitin === true && figure.rawContent.startsWith('Figure 1.1:');
});

test('Identifies Heading correctly', () => {
  const blocks = docParser.parseText(sampleDocument);
  const heading = blocks.find(b => b.type === 'heading');
  return heading && heading.rawContent.includes('Chapter 1: Introduction');
});

test('Identifies Body Prose blocks correctly', () => {
  const blocks = docParser.parseText(sampleDocument);
  const prose = blocks.filter(b => b.type === 'prose');
  return prose.length === 3 && prose.every(p => p.filterTurnitin === false && p.includedForHumanize === true);
});

// 2. Chunking
test('Smart chunking groups prose into valid chunks', () => {
  const blocks = docParser.parseText(sampleDocument);
  const chunks = docParser.createChunks(blocks, 50, 200);
  return chunks.length >= 1 && chunks.every(ch => ch.wordCount > 0);
});

// 3. Reassembly: Prose-Only mode
test('Reassembles prose-only cleanly without TOC, tables or figures', () => {
  const blocks = docParser.parseText(sampleDocument);
  const chunks = docParser.createChunks(blocks, 50, 200);
  // Simulate humanization
  chunks.forEach((ch, idx) => {
    ch.humanizedText = `[HUMANIZED CHUNK ${idx + 1}]: ${ch.text.slice(0, 40)}...`;
  });

  const output = docParser.reassembleDocument(blocks, chunks, 'prose-only');
  const hasToc = output.includes('Table of Contents');
  const hasTable = output.includes('GPT-4');
  const hasFigure = output.includes('Figure 1.1');
  const hasHumanized = output.includes('[HUMANIZED CHUNK 1]');

  return !hasToc && !hasTable && !hasFigure && hasHumanized;
});

// 4. Reassembly: Full-Document mode
test('Reassembles full document preserving TOC, tables, and figures in original position', () => {
  const blocks = docParser.parseText(sampleDocument);
  const chunks = docParser.createChunks(blocks, 50, 200);
  // Simulate humanization
  chunks.forEach((ch, idx) => {
    ch.humanizedText = `HUMANIZED_PARAGRAPH_${idx + 1}`;
  });

  const output = docParser.reassembleDocument(blocks, chunks, 'full-doc');
  
  // Must contain original TOC
  assert(output.includes('Table of Contents'), 'TOC should be preserved in full-doc');
  // Must contain original Table
  assert(output.includes('GPT-4') && output.includes('Gemma-12B'), 'Table should be preserved in full-doc');
  // Must contain original Figure
  assert(output.includes('Figure 1.1: System architecture'), 'Figure should be preserved in full-doc');
  // Must contain humanized text
  assert(output.includes('HUMANIZED_PARAGRAPH_1'), 'Humanized paragraph should replace prose');

  // Verify order: TOC should appear before Table, Table before Figure
  const tocPos = output.indexOf('Table of Contents');
  const tablePos = output.indexOf('GPT-4');
  const figPos = output.indexOf('Figure 1.1');

  return tocPos < tablePos && tablePos < figPos;
});

// 5. Long text chunking test (1500 words)
test('Handles long document chunking without splitting sentences', () => {
  const longParagraph = 'Artificial intelligence systems continue to advance rapidly in many domains. '.repeat(10);
  const rawLongDoc = Array(15).fill(longParagraph).join('\n\n');
  const blocks = docParser.parseText(rawLongDoc);
  const chunks = docParser.createChunks(blocks, 250, 400);

  const totalWords = blocks.reduce((acc, b) => acc + b.wordCount, 0);
  const chunkWords = chunks.reduce((acc, c) => acc + c.wordCount, 0);

  return chunks.length > 2 && Math.abs(totalWords - chunkWords) === 0;
});

console.log(`\nResults: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
