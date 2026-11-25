/**
 * server.js — Local Application Server & Model Lifecycle Manager
 * 
 * Provides:
 * 1. Zero-dependency HTTP static file server for index.html, doc_parser.js, etc.
 * 2. API endpoints:
 *    - GET  /api/model-status: checks if llama-server process is active & responsive
 *    - POST /api/start-model: spawns llama-server.exe in the background
 *    - POST /api/stop-model: gracefully terminates llama-server.exe
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 3000;
const LLAMA_PORT = 8080;
const ROOT = __dirname;

let llamaProcess = null;
let modelStatus = 'stopped'; // 'stopped' | 'starting' | 'running' | 'error'
let lastError = null;

// Find llama-server binary
function getLlamaBinary() {
  const vulkan = path.join(ROOT, 'tools/llama/vulkan/llama-server.exe');
  const cpu = path.join(ROOT, 'tools/llama/cpu/llama-server.exe');
  if (fs.existsSync(vulkan)) return vulkan;
  if (fs.existsSync(cpu)) return cpu;
  return null;
}

// Check if llama-server HTTP endpoint is responding
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

// MIME types dictionary
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // API Endpoints
  if (url.pathname === '/api/model-status') {
    const isProbeOk = await probeLlamaHealth();
    if (isProbeOk) modelStatus = 'running';
    else if (modelStatus === 'running') modelStatus = 'stopped';

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: modelStatus,
      isResponsive: isProbeOk,
      port: LLAMA_PORT,
      pid: llamaProcess ? llamaProcess.pid : null,
      lastError
    }));
    return;
  }

  if (url.pathname === '/api/start-model' && req.method === 'POST') {
    const result = startLlamaModel();
    res.writeHead(result.success ? 200 : 500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }

  if (url.pathname === '/api/stop-model' && req.method === 'POST') {
    const result = stopLlamaModel();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }

  // Static File Serving
  let filePath = path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname);
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
});

if (require.main === module) {
  server.listen(PORT, '127.0.0.1', () => {
    console.log('========================================================');
    console.log(`  Humanly App & Local Model Manager running!`);
    console.log(`  Open your browser at: http://127.0.0.1:${PORT}`);
    console.log('========================================================');
  });
}

module.exports = { server, startLlamaModel, stopLlamaModel, probeLlamaHealth };
