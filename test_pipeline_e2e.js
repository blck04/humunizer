// test_pipeline_e2e.js — End-to-end integration test for long document processing
const assert = require('assert');
const docParser = require('./doc_parser.js');

console.log('========================================');
console.log('  E2E Long-Document Pipeline Test');
console.log('========================================\n');

// 1. Construct realistic academic thesis draft (with TOC, headings, tables, figures, code, and long prose)
const thesisDraft = `Table of Contents
1. Introduction and Motivation ................. 1
2. Related Work and Detection Landscape ........ 5
3. Proposed Dual-Engine Architecture .......... 14
4. Empirical Results and Discussion ............ 22

Chapter 1: Introduction and Motivation

Artificial intelligence has rapidly evolved from a theoretical research interest into a pervasive computational capability. Across educational and enterprise contexts, natural language models produce coherent prose that challenges conventional evaluation criteria.

The primary difficulty lies in the fact that automated evaluation metrics frequently conflate structural fluency with genuine human agency. Consequently, organizations and academic institutions are grappling with the unintended side effects of machine-generated text in critical documentation.

Figure 1.1: Schematic diagram of the fact-locking neural rewriting pipeline.

To mitigate stylistic artifacts while safeguarding factual integrity, rewriting pipelines must adhere to strict constraint criteria. In particular, numerical quantities, proper nouns, and citations must remain invariant throughout any syntactic transformation.

| Benchmark Dataset | Word Count | Baseline AI Score | Humanized AI Score |
| --- | --- | --- | --- |
| Corpus Academicus | 45,200 | 88.4% | 14.2% |
| Enterprise Docs | 28,150 | 92.1% | 8.7% |

Chapter 2: Proposed Dual-Engine Architecture

In contrast to conventional rewriters that indiscriminately substitute synonyms, the proposed system employs a two-phase architecture. The initial phase identifies and extracts non-prose structural entities such as tables of contents, figures, and data tables.

Following structural extraction, the residual narrative prose is partitioned into semantic chunks suitable for targeted inference. Each chunk is processed independently, allowing progressive streaming and granular fidelity verification.

\`\`\`python
# Example of deterministic fact verification
def verify_fidelity(original: str, rewrite: str) -> bool:
    return extract_numbers(original) == extract_numbers(rewrite)
\`\`\`

Finally, the reassembly phase recombines the humanized prose with the untouched structural blocks. This approach preserves the complete document formatting while neutralizing machine-detection artifacts across the narrative flow.`;

// 2. Parse text into classified blocks
const blocks = docParser.parseText(thesisDraft);
console.log(`1. Document parsed into ${blocks.length} blocks:`);
blocks.forEach(b => {
  console.log(`   - [${b.type.toUpperCase()}] (${b.wordCount} words) ${b.label}: "${b.rawContent.slice(0, 35)}..."`);
});

assert(blocks.some(b => b.type === 'toc'), 'Must detect TOC');
assert(blocks.some(b => b.type === 'table'), 'Must detect Table');
assert(blocks.some(b => b.type === 'figure'), 'Must detect Figure');
assert(blocks.some(b => b.type === 'code'), 'Must detect Code');
assert(blocks.filter(b => b.type === 'prose').length === 6, 'Must detect 6 prose blocks');
console.log('   ✓ Classification verified.');

// 3. Chunking for long prose
const chunks = docParser.createChunks(blocks, 50, 90);
console.log(`\n2. Prose partitioned into ${chunks.length} chunks (target 50-90 words/chunk):`);
chunks.forEach((c, idx) => {
  console.log(`   - Chunk ${idx + 1}: ${c.wordCount} words, spans blocks [${c.blockIds.join(', ')}]`);
});
assert(chunks.length >= 2, 'Should create multiple chunks for long prose');
console.log('   ✓ Chunking verified.');

// 4. Simulate progressive chunk processing
console.log('\n3. Simulating progressive humanization stream...');
chunks.forEach((chunk, idx) => {
  chunk.status = 'processing';
  // Mock neural humanization: varying sentence cadence while preserving entities
  chunk.humanizedText = `[HUMANIZED SECTION ${idx + 1}]: ` + chunk.text.replace(/\bconsequently\b/gi, 'as a result').replace(/\bfrequently\b/gi, 'often');
  chunk.status = 'done';
  console.log(`   - Chunk ${idx + 1} completed (${chunk.wordCount} words).`);
});
console.log('   ✓ All chunks processed.');

// 5. Test Mode 1: Clean Prose Only (Turnitin Ready)
console.log('\n4. Verifying Mode 1: Clean Prose Only...');
const cleanProse = docParser.reassembleDocument(blocks, chunks, 'clean-prose');
assert(!cleanProse.includes('Table of Contents'), 'Clean prose must not have TOC');
assert(!cleanProse.includes('Benchmark Dataset'), 'Clean prose must not have Table');
assert(!cleanProse.includes('Figure 1.1:'), 'Clean prose must not have Figure');
assert(cleanProse.includes('[HUMANIZED SECTION 1]'), 'Clean prose must have humanized content');
console.log(`   - Clean prose output word count: ${docParser.countWords(cleanProse)} words`);
console.log('   ✓ Clean Prose export verified.');

// 6. Test Mode 2: Full Document (Keep Tables & TOC)
console.log('\n5. Verifying Mode 2: Full Document Reassembly...');
const fullDoc = docParser.reassembleDocument(blocks, chunks, 'full-doc');
assert(fullDoc.includes('Table of Contents'), 'Full doc must keep TOC');
assert(fullDoc.includes('Corpus Academicus') && fullDoc.includes('Enterprise Docs'), 'Full doc must keep Table');
assert(fullDoc.includes('Figure 1.1: Schematic diagram'), 'Full doc must keep Figure');
assert(fullDoc.includes('def verify_fidelity'), 'Full doc must keep Code block');
assert(fullDoc.includes('[HUMANIZED SECTION 1]'), 'Full doc must replace prose with humanized sections');

// Check sequential ordering
const tocIndex = fullDoc.indexOf('Table of Contents');
const figIndex = fullDoc.indexOf('Figure 1.1');
const tableIndex = fullDoc.indexOf('Benchmark Dataset');
const codeIndex = fullDoc.indexOf('def verify_fidelity');
assert(tocIndex < figIndex && figIndex < tableIndex && tableIndex < codeIndex, 'Structural ordering must be strictly preserved');
console.log('   ✓ Full Document ordering and integrity verified.');

// 7. DOCX Generation Test
console.log('\n6. Testing DOCX Blob Generation...');
docParser.generateDocxBlob(fullDoc).then(blob => {
  assert(blob, 'Must generate a blob');
  console.log(`   - Generated blob: size = ${blob.size} bytes, type = ${blob.type}`);
  assert(blob.size > 500, 'DOCX blob must contain substantial content');
  console.log('   ✓ DOCX Generation verified.');
  console.log('\n========================================');
  console.log('  ALL E2E PIPELINE TESTS PASSED (100%)');
  console.log('========================================');
}).catch(err => {
  console.error('FAIL in DOCX generation:', err);
  process.exit(1);
});
