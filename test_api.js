/**
 * test_api.js — Automated E2E Test Suite for Humanly REST API Gateway
 */

const http = require('http');
const assert = require('assert');
const { server } = require('./server.js');

let TEST_PORT = 3001;

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, text: data });
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runApiTests() {
  console.log('========================================');
  console.log('  Humanly REST API Automated Test Suite');
  console.log('========================================\n');

  await new Promise(resolve => server.listen(TEST_PORT, '127.0.0.1', resolve));

  try {
    // 1. Health check
    process.stdout.write('• Testing GET /api/v1/health... ');
    const health = await request('GET', '/api/v1/health');
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.data.status, 'healthy');
    assert.strictEqual(typeof health.data.uptimeSeconds, 'number');
    assert.strictEqual(typeof health.data.modelServer.isResponsive, 'boolean');
    console.log('✓ PASS');

    // 2. OpenAPI JSON
    process.stdout.write('• Testing GET /api/v1/openapi.json... ');
    const openapi = await request('GET', '/api/v1/openapi.json');
    assert.strictEqual(openapi.status, 200);
    assert.strictEqual(openapi.data.openapi, '3.0.3');
    assert.ok(openapi.data.paths['/api/v1/humanize']);
    assert.ok(openapi.data.paths['/api/v1/verify-fidelity']);
    assert.ok(openapi.data.paths['/api/v1/parse-document']);
    console.log('✓ PASS');

    // 3. Swagger Docs UI
    process.stdout.write('• Testing GET /docs UI... ');
    const docs = await request('GET', '/docs');
    assert.strictEqual(docs.status, 200);
    assert.ok(docs.text.includes('SwaggerUIBundle'));
    console.log('✓ PASS');

    // 4. Verify Fidelity Endpoint (Hallucination detection)
    process.stdout.write('• Testing POST /api/v1/verify-fidelity (Catching fabricated 50%)... ');
    const fidFail = await request('POST', '/api/v1/verify-fidelity', {
      originalText: 'A percentage score is calculated according to the formula.',
      rewrittenText: 'A score of 50% is determined using the calculation framework.'
    });
    assert.strictEqual(fidFail.status, 200);
    assert.strictEqual(fidFail.data.passed, false);
    assert.ok(fidFail.data.criticalViolations.some(v => v.items.includes('50%')));
    console.log('✓ PASS');

    // 5. Verify Fidelity Endpoint (Clean pass)
    process.stdout.write('• Testing POST /api/v1/verify-fidelity (Clean fact preservation)... ');
    const fidPass = await request('POST', '/api/v1/verify-fidelity', {
      originalText: 'Sales grew by an estimated 4.2% in October 2026 (Smith et al., 2024).',
      rewrittenText: 'Revenue expanded by around 4.2% in October 2026 (Smith et al., 2024).'
    });
    assert.strictEqual(fidPass.status, 200);
    assert.strictEqual(fidPass.data.passed, true);
    assert.strictEqual(fidPass.data.criticalViolations.length, 0);
    console.log('✓ PASS');

    // 6. Humanize Text Endpoint
    process.stdout.write('• Testing POST /api/v1/humanize (Local engine)... ');
    const humanizeRes = await request('POST', '/api/v1/humanize', {
      text: 'Furthermore, it is crucial to utilize artificial intelligence to optimize operational efficiency.',
      engine: 'local',
      tone: 'natural',
      strength: 'enhanced'
    });
    assert.strictEqual(humanizeRes.status, 200);
    assert.ok(humanizeRes.data.text && humanizeRes.data.text.length > 10);
    assert.strictEqual(typeof humanizeRes.data.reuse, 'number');
    assert.strictEqual(humanizeRes.data.fidelity.passed, true);
    assert.ok(humanizeRes.data.timings.durationMs >= 0);
    console.log('✓ PASS');

    // 7. Parse Document Endpoint
    process.stdout.write('• Testing POST /api/v1/parse-document... ');
    const docText = `
Table of Contents
1. Introduction ................................. 1
2. Architecture ................................. 5

# Chapter 1: System Overview

Artificial intelligence systems require robust validation architectures.
Stylistic variance alone is insufficient to guarantee factual integrity.

Figure 1.1: Architecture diagram showing client and server layers.

| Benchmark Dataset | Word Count | Domain |
| Corpus-Academic   | 3,450      | Research |
| Corpus-Industry   | 2,890      | Business |
`;
    const parseRes = await request('POST', '/api/v1/parse-document', {
      content: docText,
      filename: 'test_doc.md'
    });
    assert.strictEqual(parseRes.status, 200);
    assert.ok(parseRes.data.blocks.length >= 5);
    assert.ok(parseRes.data.chunks.length >= 1);
    assert.strictEqual(parseRes.data.summary.tocBlocks, 1);
    assert.strictEqual(parseRes.data.summary.tableBlocks, 1);
    assert.strictEqual(parseRes.data.summary.figureBlocks, 1);
    console.log('✓ PASS');

    // 8. Batch Document Processing Endpoint
    process.stdout.write('• Testing POST /api/v1/batch-document (Full document reassembly)... ');
    const batchRes = await request('POST', '/api/v1/batch-document', {
      blocks: parseRes.data.blocks,
      chunks: parseRes.data.chunks,
      engine: 'local',
      tone: 'natural',
      strength: 'standard',
      reassembleMode: 'full-doc'
    });
    assert.strictEqual(batchRes.status, 200);
    assert.ok(batchRes.data.reassembledText.includes('Table of Contents'));
    assert.ok(batchRes.data.reassembledText.includes('Figure 1.1:'));
    assert.ok(batchRes.data.reassembledText.includes('| Benchmark Dataset |'));
    assert.strictEqual(batchRes.data.fidelitySummary.driftChunks, 0);
    console.log('✓ PASS');

    console.log('\n========================================');
    console.log('  ALL 8 REST API TESTS PASSED (100%)');
    console.log('========================================\n');

  } finally {
    server.close();
  }
}

if (require.main === module) {
  runApiTests().catch(err => {
    console.error('\nAPI Test Failed:', err);
    process.exit(1);
  });
}

module.exports = { runApiTests };
