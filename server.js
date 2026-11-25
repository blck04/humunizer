/**
 * server.js — Humanly Enterprise Application Server & REST API Gateway
 * 
 * Provides:
 * 1. REST API v1:
 *    - GET  /api/v1/health: Server health, uptime & 12B model availability
 *    - GET  /api/v1/openapi.json: Complete OpenAPI 3.0.3 specification
 *    - GET  /docs & /api/docs: Interactive Swagger UI explorer
 *    - POST /api/v1/verify-fidelity: Pre/post-flight atomic fact verification
 *    - POST /api/v1/humanize: Text humanization with mandatory fact-guard check
 *    - POST /api/v1/parse-document: Multi-block layout classifier & prose chunker
 *    - POST /api/v1/batch-document: Batch chunk execution & dual-mode reassembly
 * 2. Model Lifecycle Endpoints:
 *    - GET  /api/model-status: checks if llama-server process is active
 *    - POST /api/start-model: spawns llama-server.exe in the background
 *    - POST /api/stop-model: gracefully terminates llama-server.exe
 * 3. Zero-dependency HTTP static file server.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 3000;
const LLAMA_PORT = process.env.LLAMA_PORT || 8080;
const ROOT = __dirname;
const START_TIME = Date.now();

// Module imports
const DocParser = require(path.join(ROOT, 'doc_parser.js'));
const FidelityGuard = require(path.join(ROOT, 'fidelity_guard.js'));

let llamaProcess = null;
let modelStatus = 'stopped'; // 'stopped' | 'starting' | 'running' | 'error'
let lastError = null;

// ============================================================
//  CORE REWRITE & DETECTION ENGINE LOADER (VM ISOLATION)
// ============================================================
let engineCache = null;

function getEngine() {
  if (engineCache) return engineCache;

  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('No script block found in index.html');

  const fakeEl = {
    value: '', textContent: '', innerHTML: '', disabled: false, style: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    querySelector() { return null; }, querySelectorAll() { return []; },
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
    setTimeout, clearTimeout, console, Math, Date, JSON, RegExp, Set, Map, Array, Object, String, Number, Boolean, Promise
  };

  vm.createContext(sandbox);
  vm.runInContext(m[1], sandbox);

  engineCache = {
    humanizeText: sandbox.humanizeText,
    detectAI: sandbox.detectAI,
    computeReuse: sandbox.computeReuse,
    countWords: sandbox.countWords,
    splitSentences: sandbox.splitSentences
  };
  return engineCache;
}

// ============================================================
//  LOCAL LLAMA.CPP SERVER CONTROLS
// ============================================================

function getLlamaBinary() {
  const vulkan = path.join(ROOT, 'tools/llama/vulkan/llama-server.exe');
  const cpu = path.join(ROOT, 'tools/llama/cpu/llama-server.exe');
  if (fs.existsSync(vulkan)) return vulkan;
  if (fs.existsSync(cpu)) return cpu;
  return null;
}

async function probeLlamaHealth() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${LLAMA_PORT}/health`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1200, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function startLlamaModel() {
  if (llamaProcess) {
    return { success: true, message: 'Server is already running', status: modelStatus };
  }

  const binary = getLlamaBinary();
  if (!binary) {
    lastError = 'llama-server.exe not found in tools/llama/vulkan or tools/llama/cpu';
    modelStatus = 'error';
    return { success: false, error: lastError };
  }

  const modelPath = path.join(ROOT, 'local-model/gguf/humanizer-12b-Q3-QAT.gguf');
  if (!fs.existsSync(modelPath)) {
    lastError = 'Model file not found: ' + modelPath;
    modelStatus = 'error';
    return { success: false, error: lastError };
  }

  modelStatus = 'starting';
  lastError = null;

  const args = [
    '-m', modelPath,
    '-c', '8192',
    '-np', '1',
    '-t', '10',
    '-ngl', '0',
    '-lm', 'mmap',
    '-lzm', 'on',
    '-cram', '2048',
    '-ctk', 'q8_0',
    '-ctv', 'q8_0',
    '--host', '127.0.0.1',
    '--port', String(LLAMA_PORT),
    '--path', ROOT,
    '--temp', '1.0',
    '--top-p', '0.95',
    '--top-k', '0',
    '--min-p', '0',
    '--repeat-penalty', '1.0'
  ];

  console.log('[Server] Spawning llama-server:', binary);
  llamaProcess = spawn(binary, args, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false
  });

  llamaProcess.stdout.on('data', (d) => {
    const str = d.toString();
    if (str.includes('HTTP server listening')) {
      modelStatus = 'running';
      console.log('[llama-server] Ready on port', LLAMA_PORT);
    }
  });

  llamaProcess.stderr.on('data', (d) => {
    const str = d.toString();
    if (str.includes('HTTP server listening')) {
      modelStatus = 'running';
      console.log('[llama-server] Ready on port', LLAMA_PORT);
    }
  });

  llamaProcess.on('exit', (code) => {
    console.log('[llama-server] Process exited with code', code);
    llamaProcess = null;
    modelStatus = 'stopped';
  });

  llamaProcess.on('error', (err) => {
    console.error('[llama-server] Failed to start:', err.message);
    lastError = err.message;
    modelStatus = 'error';
    llamaProcess = null;
  });

  return { success: true, message: 'Model server starting...', status: modelStatus };
}

function stopLlamaModel() {
  if (llamaProcess) {
    try {
      llamaProcess.kill();
    } catch (e) {}
    llamaProcess = null;
    modelStatus = 'stopped';
    return { success: true, message: 'Model server stopped' };
  }
  modelStatus = 'stopped';
  return { success: true, message: 'Model server was not running' };
}

async function callLocalLlama(text) {
  const pfPath = path.join(ROOT, 'local-model/gguf/prompt_format.json');
  let prompt;
  if (fs.existsSync(pfPath)) {
    const pf = JSON.parse(fs.readFileSync(pfPath, 'utf8'));
    prompt = pf.instr + '\n\n' + text.trim() + pf.sep;
  } else {
    prompt = text.trim();
  }

  const res = await fetch(`http://127.0.0.1:${LLAMA_PORT}/completion`, {
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
  if (!res.ok) {
    throw new Error(`llama-server HTTP ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return {
    text: (data.content || '').trim(),
    timings: data.timings || null
  };
}

// ============================================================
//  HTTP UTILS
// ============================================================

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 50 * 1024 * 1024) { // 50MB
        req.destroy();
        reject(new Error('Payload exceeds 50MB limit'));
      }
    });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(new Error('Invalid JSON: ' + e.message));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data, null, 2));
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

const SWAGGER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Humanly API Documentation</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    body { margin: 0; background: #fafafa; font-family: 'Inter', sans-serif; }
    .swagger-ui .topbar { display: none; }
    .custom-header {
      background: #14213d;
      color: #ffffff;
      padding: 18px 32px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 2px solid #fca311;
    }
    .custom-header h1 {
      margin: 0;
      font-family: 'Newsreader', serif;
      font-size: 24px;
      font-weight: 500;
    }
    .custom-header a {
      color: #fca311;
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="custom-header">
    <h1>Humanly Enterprise API</h1>
    <div>
      <a href="/" style="margin-right:20px;">← Back to App</a>
      <a href="/api/v1/openapi.json" target="_blank">OpenAPI Spec (JSON)</a>
    </div>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '/api/v1/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout"
      });
    };
  </script>
</body>
</html>`;

// ============================================================
//  MAIN HTTP SERVER DISPATCHER
// ============================================================

const server = http.createServer(async (req, res) => {
  // Global CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1:3000'}`);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  try {
    // 1. HEALTH ENDPOINT
    if (pathname === '/api/v1/health' && req.method === 'GET') {
      const isProbeOk = await probeLlamaHealth();
      if (isProbeOk) modelStatus = 'running';
      else if (modelStatus === 'running') modelStatus = 'stopped';

      sendJson(res, 200, {
        status: 'healthy',
        version: '1.0.0',
        uptimeSeconds: Math.round((Date.now() - START_TIME) / 1000),
        timestamp: new Date().toISOString(),
        modelServer: {
          status: modelStatus,
          isResponsive: isProbeOk,
          port: Number(LLAMA_PORT),
          pid: llamaProcess ? llamaProcess.pid : null,
          binaryFound: Boolean(getLlamaBinary()),
          modelFound: fs.existsSync(path.join(ROOT, 'local-model/gguf/humanizer-12b-Q3-QAT.gguf'))
        }
      });
      return;
    }

    // 2. OPENAPI SPEC
    if (pathname === '/api/v1/openapi.json' && req.method === 'GET') {
      const openapiPath = path.join(ROOT, 'openapi.json');
      if (fs.existsSync(openapiPath)) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        fs.createReadStream(openapiPath).pipe(res);
      } else {
        sendJson(res, 404, { error: 'openapi.json not found' });
      }
      return;
    }

    // 3. INTERACTIVE DOCS
    if ((pathname === '/docs' || pathname === '/api/docs') && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(SWAGGER_HTML);
      return;
    }

    // 4. VERIFY FIDELITY ENDPOINT
    if (pathname === '/api/v1/verify-fidelity' && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (!body.originalText || !body.rewrittenText) {
        sendJson(res, 400, { error: 'Missing required fields: originalText and rewrittenText' });
        return;
      }
      const report = FidelityGuard.verifyFidelity(body.originalText, body.rewrittenText);
      sendJson(res, 200, report);
      return;
    }

    // 5. HUMANIZE ENDPOINT
    if (pathname === '/api/v1/humanize' && req.method === 'POST') {
      const t0 = Date.now();
      const body = await readJsonBody(req);
      const text = body.text;
      if (!text || typeof text !== 'string' || !text.trim()) {
        sendJson(res, 400, { error: 'Missing or empty field: text' });
        return;
      }

      const engineName = body.engine || 'local';
      const tone = body.tone || 'natural';
      const strength = body.strength || 'standard';

      let rewritten = '';
      let timings = null;

      if (engineName === 'local-server') {
        const isOnline = await probeLlamaHealth();
        if (!isOnline) {
          sendJson(res, 503, {
            error: 'Local 12B model server is offline on port ' + LLAMA_PORT,
            tip: 'Start model server via POST /api/start-model or run run_local.bat'
          });
          return;
        }
        const modelRes = await callLocalLlama(text);
        rewritten = modelRes.text;
        timings = modelRes.timings;
      } else {
        const engine = getEngine();
        rewritten = engine.humanizeText(text, strength, tone);
      }

      const engine = getEngine();
      const fidelityReport = FidelityGuard.verifyFidelity(text, rewritten);
      const reuse = engine.computeReuse(text, rewritten);
      const reuseScore = typeof reuse === 'number' ? reuse : (reuse && reuse.reuse5Gram != null ? reuse.reuse5Gram : 0);

      sendJson(res, 200, {
        text: rewritten,
        originalWords: engine.countWords(text),
        rewrittenWords: engine.countWords(rewritten),
        reuse: Number(reuseScore.toFixed(4)),
        engine: engineName,
        fidelity: fidelityReport,
        timings: {
          durationMs: Date.now() - t0,
          modelTimings: timings
        }
      });
      return;
    }

    // 6. PARSE DOCUMENT ENDPOINT
    if (pathname === '/api/v1/parse-document' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const content = body.content;
      if (!content || typeof content !== 'string') {
        sendJson(res, 400, { error: 'Missing or empty field: content' });
        return;
      }

      const filename = body.filename || 'document.txt';
      const targetMin = body.targetChunkMin || 250;
      const targetMax = body.targetChunkMax || 450;

      const blocks = DocParser.parseText(content);
      const chunks = DocParser.createChunks(blocks, targetMin, targetMax);

      const summary = {
        filename,
        totalBlocks: blocks.length,
        proseBlocks: blocks.filter(b => b.type === 'prose').length,
        tableBlocks: blocks.filter(b => b.type === 'table').length,
        figureBlocks: blocks.filter(b => b.type === 'figure').length,
        headingBlocks: blocks.filter(b => b.type === 'heading').length,
        tocBlocks: blocks.filter(b => b.type === 'toc').length,
        codeBlocks: blocks.filter(b => b.type === 'code').length,
        totalChunks: chunks.length,
        totalWords: blocks.reduce((acc, b) => acc + b.wordCount, 0)
      };

      sendJson(res, 200, { filename, blocks, chunks, summary });
      return;
    }

    // 7. BATCH DOCUMENT ENDPOINT
    if (pathname === '/api/v1/batch-document' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const blocks = body.blocks;
      const chunks = body.chunks;
      if (!Array.isArray(blocks) || !Array.isArray(chunks)) {
        sendJson(res, 400, { error: 'Missing required array fields: blocks and chunks' });
        return;
      }

      const engineName = body.engine || 'local';
      const tone = body.tone || 'natural';
      const strength = body.strength || 'standard';
      const mode = body.reassembleMode || 'clean-prose';

      let driftCount = 0;
      let passedCount = 0;

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        let rewritten = '';
        if (engineName === 'local-server') {
          const modelRes = await callLocalLlama(chunk.text);
          rewritten = modelRes.text;
        } else {
          const engine = getEngine();
          rewritten = engine.humanizeText(chunk.text, strength, tone);
        }

        chunk.humanizedText = rewritten;
        chunk.status = 'done';

        const fidelity = FidelityGuard.verifyFidelity(chunk.text, rewritten);
        chunk.fidelity = fidelity;
        if (fidelity.passed) passedCount++;
        else driftCount++;
      }

      const reassembledText = DocParser.reassembleDocument(blocks, chunks, mode);
      const engine = getEngine();

      sendJson(res, 200, {
        reassembledText,
        mode,
        chunks,
        fidelitySummary: {
          totalChunks: chunks.length,
          passedChunks: passedCount,
          driftChunks: driftCount
        },
        wordCount: engine.countWords(reassembledText)
      });
      return;
    }

    // 8. MODEL LIFECYCLE ENDPOINTS
    if (pathname === '/api/model-status' && req.method === 'GET') {
      const isProbeOk = await probeLlamaHealth();
      if (isProbeOk) modelStatus = 'running';
      else if (modelStatus === 'running') modelStatus = 'stopped';

      sendJson(res, 200, {
        status: modelStatus,
        isResponsive: isProbeOk,
        port: Number(LLAMA_PORT),
        pid: llamaProcess ? llamaProcess.pid : null,
        lastError
      });
      return;
    }

    if (pathname === '/api/start-model' && req.method === 'POST') {
      const result = startLlamaModel();
      sendJson(res, result.success ? 200 : 500, result);
      return;
    }

    if (pathname === '/api/stop-model' && req.method === 'POST') {
      const result = stopLlamaModel();
      sendJson(res, 200, result);
      return;
    }

    // 9. STATIC FILE SERVING
    let filePath = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(ROOT, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      }
    });

  } catch (err) {
    console.error('[Server Error]', err);
    sendJson(res, 500, { error: err.message || 'Internal Server Error' });
  }
});

if (require.main === module) {
  server.listen(PORT, '127.0.0.1', () => {
    console.log('========================================================');
    console.log(`  Humanly Enterprise Application Server & REST API`);
    console.log(`  App UI:        http://127.0.0.1:${PORT}`);
    console.log(`  API Docs:      http://127.0.0.1:${PORT}/docs`);
    console.log(`  OpenAPI Spec:  http://127.0.0.1:${PORT}/api/v1/openapi.json`);
    console.log(`  Health Check:  http://127.0.0.1:${PORT}/api/v1/health`);
    console.log('========================================================');
  });
}

module.exports = {
  server,
  startLlamaModel,
  stopLlamaModel,
  probeLlamaHealth,
  getEngine
};
