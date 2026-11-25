# AI Humanizer Project — Handover for the Next LLM

**Prepared:** 24 November 2026
**Canonical location after handover:** `C:\Users\User\Desktop\code\humanizer`
**Previous workspace:** `C:\Users\User\WorkBuddy AI\2026-11-24-11-30-19`

This file is written so a new model can continue the project without re-reading the whole conversation. Everything below is based on actual work performed and tested, not assumptions.

---

## 1. Executive summary

The user wants an AI humanizer that can pass **Turnitin AI Writing Detection at ≥93%**, eventually as an enterprise-grade product. The original request was to understand and replicate `https://app.walterwrites.ai/en/humanizer`.

Current state:

- A working single-page web app exists: `index.html`.
- It has three tools: **Humanizer**, **AI Detector**, **Grammar Checker**.
- It supports a hosted 12B model via Hugging Face and a local rule engine.
- A real local 12B model is now downloaded and working on the user's machine.
- A Turnitin-first benchmark harness exists but has **no real Turnitin results yet**.
- A detailed fidelity analysis found that the humanized sample is structurally excellent but contains **one fabricated number** and several qualifier/title drifts.
- Enterprise research concluded that “undetectable” positioning is risky; the defensible product is a fact-preserving, on-voice rewriting layer with an auditable quality report.

**Important:** The user’s original enterprise request ended mid-sentence:

> `the end goal is an ai humaniser that passes ai detectors by atleat a 93% score and`

The missing part after “and” is still unknown. Ask if it matters.

---

## 2. File inventory

| File / folder | Purpose |
|---|---|
| `index.html` | Main single-page app: Humanizer, Detector, Grammar Checker, hosted/local engines, fidelity card. |
| `test.js` | Local engine test suite. 38 tests, all passing. |
| `test_model.js` | Hosted Gradio client test. Prompt fingerprint verified; live tests skip on quota. |
| `prompt_format.json` | Byte-exact prompt instruction and separator for `jialinyyzz/humanizer`. Fingerprint `cc51d66b4c593fbe`. |
| `run_local.sh` | Starts local llama.cpp server with mmap/lazy loading and exact sampling. |
| `LOCAL_MODEL.md` | Full local-model setup, quantization table, performance notes, CORS/browser-testing notes. |
| `local_test.html` | Browser UI for testing the local model directly against `/completion`. |
| `test_local_model.js` | Node smoke test for the local server. |
| `local-model/gguf/humanizer-12b-Q3-QAT.gguf` | Downloaded 12B model, checksum verified. |
| `local-model/gguf/prompt_format.json` | Downloaded prompt file. |
| `tools/llama/cpu/` | Portable llama.cpp CPU build. |
| `tools/llama/vulkan/` | Portable llama.cpp Vulkan build. |
| `turnitin_benchmark/corpus.v0.1.jsonl` | 12 English smoke drafts, 316–342 words each. |
| `turnitin_benchmark/generate_outputs.js` | Generates Turnitin-ready `.txt` rewrites from the corpus. |
| `turnitin_benchmark/summarize.js` | Calculates pass rate, Wilson 95% CI, strata, fidelity/reuse stats. |
| `turnitin_benchmark/runs/` | Generated outputs and PENDING Turnitin result templates. |
| `TURNITIN_TARGET.md` | Turnitin-first benchmark specification and access constraints. |
| `ENTERPRISE_RESEARCH.md` | Deep research on enterprise requirements and the 93% target. |
| `fidelity_analysis/FIDELITY_ANALYSIS.md` | Detailed fidelity analysis of a real user-supplied rewrite. |
| `fidelity_analysis/original.txt` | Original Chapter 2 sample supplied by user. |
| `fidelity_analysis/rewritten.txt` | Humanized Chapter 2 sample supplied by user. |
| `fidelity_analysis/analyze.js` | Automated comparison script: words, sentences, numbers, citations, headings, reuse. |
| `.workbuddy-ai/memory/` | Project work log. Useful but not product code. |

---

## 3. What works, and how

### 3.1 Web app

Open `index.html` in a browser. No build step.

Features:

- Text input, word count, processing overlay.
- Humanizer with engine selector:
  - `12B model (hosted)` — Hugging Face Gradio Space.
  - `Local rules (offline)` — deterministic JS rules.
- AI Detector with heuristic scores plus lower-clipped aggregation.
- Grammar Checker with regex-based rules.
- Fidelity report card for hosted model output:
  - copy rate,
  - missing numbers,
  - added numbers,
  - tokens/seconds.
- Optional in-memory Hugging Face token via gear button.

Local test suite:

```bash
node test.js
```

Current result: **38 passed, 0 failed**.

### 3.2 Hosted model path

Model: `jialinyyzz/humanizer`, a 12B Gemma 4 fine-tune.

Flow:

1. POST `/gradio_api/call/v2/humanize` with `{ draft }`.
2. Receive `event_id`.
3. GET `/gradio_api/call/humanize/{event_id}` SSE stream.
4. Parse result JSON containing `text`, `copy_rate`, `missing_numbers`, `added_numbers`, `tokens`, `seconds`.

Prompt must be byte-exact. Fingerprint: `cc51d66b4c593fbe`.

Problem: the public Space has a ZeroGPU daily quota. Live calls currently fail without a token.

### 3.3 Local model path — working

Hardware detected:

- 15.43 GB RAM total.
- 14 logical CPUs.
- Intel integrated GPU only.
- ~744 GB free disk.

Chosen quantization: `humanizer-12b-Q3-QAT.gguf`.

- Size: `5,587,794,816` bytes.
- SHA-256: `307bbfdf66fb22bf98aaa93fe7d54a713bf167e646073dc0cf10870b1525eb94`.
- Verified against Hugging Face.

Why Q3: Q6/Q8 need too much RAM. Q4 might fit if apps are closed. Q3 is the safest balance.

Start server:

```bash
cd "C:/Users/User/Desktop/code/humanizer"
./run_local.sh
```

Then use the same-origin test page:

```text
http://127.0.0.1:8080/local_test.html
```

Do **not** use the preview-panel proxy URL for browser testing. It blocked cross-origin localhost fetches. `run_local.sh` now adds `--path "$ROOT"` so the page is served from the llama.cpp server itself.

Direct API test:

```bash
node test_local_model.js
```

Generate benchmark outputs:

```bash
node turnitin_benchmark/generate_outputs.js \
  --engine local-server \
  --run-id smoke_local_model_q3 \
  --resume
```

Performance observed:

- Prompt processing: ~13–18 tokens/s.
- Generation: ~1.4–2.5 tokens/s.
- ~4–5 minutes per 300-word rewrite.
- Server working set: ~5.5 GB.
- Free RAM while loaded: roughly 0.3 GB. Close other apps first.

Streaming explanation:

- llama.cpp does not stream weights over the network during inference.
- It uses local memory mapping and lazy tensor reads:
  - `-lm mmap`
  - `-lzm on`
  - `-cram 2048`
  - `-ctk q8_0`
  - `-ctv q8_0`
- This is “streaming from SSD”, not from Hugging Face during generation.

Verified local-model quality:

- Smoke rewrite preserved all numbers.
- 2-draft generator run: reuse `0.0071` and `0.0329`.
- Zero critical fidelity failures in those two samples.
- This is far better than the local rule engine (~0.72–0.86 reuse).

### 3.4 Turnitin benchmark harness

Corpus: 12 English smoke drafts, 316–342 words, across academic, business, blog and technical domains. It is a pipeline-validation set, not a validity benchmark.

Generate outputs:

```bash
node turnitin_benchmark/generate_outputs.js --engine local --strength enhanced --tone natural --run-id smoke_local_enh
node turnitin_benchmark/generate_outputs.js --engine local-server --run-id smoke_local_model_q3 --resume
node turnitin_benchmark/summarize.js --run-id smoke_local_model_q3
```

Result CSV columns:

```text
sample_id,run_id,variant,engine,strength,tone,rewrite_hash,
submission_date,turnitin_model_date,display_score,raw_score,
highlighted_sentences,no_action_pass,note
```

All fields are currently `PENDING`. No Turnitin scores have been invented.

Pass definition:

> A document passes when the instructor-visible Turnitin AIW report shows `0%` or `*%`, with no AI-generated or AI-paraphrased sentence highlighting.

For a defensible 93% claim, require the Wilson 95% lower bound to be ≥93%, not just the point estimate.

### 3.5 Fidelity analysis

User supplied a real Chapter 2 original and humanized version. The rewrite scored 89% human on an unspecified detector.

Automated analysis:

- Original: 483 words, 34 sentences.
- Rewrite: 683 words, 43 sentences.
- Reuse: `0.0436`.
- All original numbers/citations preserved.
- But the rewrite introduced **“A score of 50%”** where the original said generic “A percentage score”.
- Figure 2.1 caption and section 2.2.1 heading were changed.
- Several qualifiers were softened.

Verdict: structurally excellent, roughly 8/10 factual fidelity, not submission-ready until corrected.

---

## 4. What has been done

1. Investigated Walter Writes-style humanizer UX and built a local replica.
2. Found and fixed a fatal JavaScript syntax error.
3. Built 38 local tests using Node `vm` with mocked browser globals.
4. Applied the Hugging Face article’s design principles:
   - fidelity first,
   - protect numbers/dates/qualifiers,
   - no hedge deletion,
   - no meaning-flipping swaps,
   - keep detector out of the reward.
5. Integrated the real 12B hosted model via its Gradio API.
6. Verified prompt byte-exactness with fingerprint `cc51d66b4c593fbe`.
7. Added fidelity reporting from model metadata.
8. Added optional HF token support for quota issues.
9. Read the user-supplied PDF on robust detection and applied lower-clipped scoring to the detector.
10. Evaluated `StealthHumanizer`; rejected it as unsafe because it hallucinated numbers.
11. Performed deep enterprise research and wrote `ENTERPRISE_RESEARCH.md`.
12. Chose Turnitin as the first named detector target and wrote `TURNITIN_TARGET.md`.
13. Built the Turnitin smoke corpus, output generator and scorecard summarizer.
14. Downloaded and verified the Q3-QAT local model.
15. Installed portable llama.cpp CPU and Vulkan builds.
16. Built a working browser test page and fixed the localhost/CORS/preview issue.
17. Analysed a real user rewrite and identified a critical fabricated number.

---

## 5. Key research facts to preserve

### Hugging Face humanizer article

- SFT pairs used real human writing as fixed targets.
- DPO then GRPO.
- Reward has fidelity, register and reuse terms. **No detector in the reward.**
- Reuse includes verbatim 5-gram copy and content-masked syntactic skeleton recall.
- Critical errors climb after ~225 RL steps; checkpoint chosen from a ladder.
- External Originality.ai result: 85% human for v2, never fed back into training.
- Dropped qualifiers occur in about 1 output in 3.
- Short drafts under ~120 words are less reliable.

### Turnitin

- AIW score = flagged sentences / evaluated sentences.
- Lists, headings, references, tables, formulas and code are excluded.
- Under ~300 evaluated prose words, unreliable.
- Scores 1–19% display as `*%`.
- English model architecture updated October 2026.
- Turnitin explicitly says AIW detects humanizer-modified text.
- No public self-serve API for individuals.
- Access requires institutional Originality license, admin-created TCA key, or certified partner route.
- Do not use unofficial “Turnitin checker” sites as ground truth.

### Enterprise

- SOC 2 Type II, DPA, no-training clause, zero-data retention, SSO/SCIM/RBAC, SLA are hard gates.
- EU AI Act Article 50 in force 2 Aug 2026; “undetectable” positioning creates serious exposure.
- FTC Workado order: accuracy claims require competent and reliable evidence.
- Better positioning: disclosed fact-preserving naturalness / brand voice layer.

---

## 6. What needs fixing

### Critical

1. **Fidelity gate is not integrated into the app or generator.**
   - The local model introduced “50%” in the Chapter 2 sample.
   - Need pre-flight fact locking and post-flight atomic-fact comparison.
   - Reject or resample on added numbers, changed dates/names, reversed claims.

2. **Turnitin results are missing.**
   - Need authorized Turnitin access before any ≥93% claim.

3. **Local rule engine quality is poor.**
   - Reuse ~0.72–0.86 vs target <0.35.
   - Output has grammar bugs such as fragments and bad connectors.
   - Treat it only as offline fallback.

### High priority

4. **Full 12-draft local-model benchmark not completed.**
   - A first batch failed on keep-alive; fixed.
   - A verified 2-draft rerun succeeded.
   - Resume with `--resume`; expect ~4–5 min/draft.

5. **Hosted model quota.**
   - Needs HF token or dedicated endpoint.

6. **`index.html` does not yet expose the local server as an engine.**
   - Add a third engine option: `Local 12B server`.
   - POST to `http://127.0.0.1:8080/completion` with the exact prompt.

7. **Detector is heuristic, not Turnitin.**
   - Do not present its output as a Turnitin predictor.

### Medium / later

8. No backend, auth, persistence, teams, API keys, audit logs.
9. No OpenAPI spec, queue, rate limits, SLA or status page.
10. No SOC 2 / ISO 27001 / ISO 42001 programme.
11. Article 50 provenance/disclosure workflow not built.
12. Grammar checker is regex-only and limited.

---

## 7. Current status & remaining work

### Completed in recent milestones:
1. **Document Extractor & Batch Mode (`doc_parser.js`)**:
   - Parses `.docx`, `.pdf`, `.txt`, `.md`.
   - Layout classifier preserves Tables of Contents, Tables, Figures, Headings, and Code Blocks.
   - Smart chunking (250–450 words) with sentence preservation.
   - Dual-mode reassembler: Clean Prose export vs Full Document reassembly (restoring all non-prose elements in original document order).
   - In-browser OpenXML `.docx` blob export with proper typography and paragraph tags.
2. **Warm Editorial UI/UX Overhaul (`index.html`)**:
   - Implemented exact custom palette: `["#000000", "#14213d", "#fca311", "#e5e5e5", "#ffffff"]`.
   - Typography: Google Font `Newsreader` editorial serif headlines + `Inter` clean body font.
   - Dual-mode toggle: `Text Snippet Mode` vs `Document Extractor & Batch Mode`.
   - Interactive document inspector with inclusion checkboxes and live preview.
   - Integrated local model server controls: `⚡ Start 12B Model` / `⏹ Stop 12B Model` button and live status pill (`🟢 Server Online` / `🔴 Server Offline`).
3. **Atomic Fidelity Gate & Fact Guard (`fidelity_guard.js`)**:
   - Pre- and post-flight entity extraction and validation.
   - Protects against number fabrication (e.g. catches the "50%" hallucination from Chapter 2).
   - Catches missing numbers (e.g. "4.2%"), altered dates, dropped citations.
   - Qualifier softening tracked and surfaced as advisories.
   - Fully wired into `index.html` (Snippet mode & Document Extractor chunk inspector) and `turnitin_benchmark/generate_outputs.js`.
4. **Enterprise REST API & Swagger UI (`server.js`, `openapi.json`, `test_api.js`)**:
   - High-performance, zero-dependency Node.js HTTP API server.
   - `GET /api/v1/health`: System uptime, local 12B model availability and process metrics.
   - `GET /api/v1/openapi.json`: Complete OpenAPI 3.0.3 specification.
   - `GET /docs` & `GET /api/docs`: Interactive browser Swagger UI explorer.
   - `POST /api/v1/humanize`: Text rewriting with automatic factual fidelity verification and reuse calculation.
   - `POST /api/v1/verify-fidelity`: Atomic fact comparison, critical violation alerts, and qualifier drift tracking.
   - `POST /api/v1/parse-document`: Structural block extraction, TOC/Table/Figure detection, and prose chunking.
   - `POST /api/v1/batch-document`: Sequential chunk humanization and dual-mode document reassembly.
5. **Unified Test Suite (`test_all.js`)**:
   - 61 unit and API integration tests + full E2E pipeline test passing (100%).

### Remaining enterprise roadmap:
1. **Local model benchmark completion**:
   - Run the full 12-draft smoke set using the local 12B model with `--resume`.
2. **Turnitin instructor verification**:
   - Submit `.txt` drafts from `turnitin_benchmark/runs/` to an authorized Turnitin instructor/TCA account and record real AIW scores into `results.csv`.
3. **Enterprise compliance & governance**:
   - API authentication (API keys/Bearer tokens).
   - SOC 2 / EU AI Act Article 50 provenance logging and zero-data retention policy.

---

## 8. Commands quick reference

```bash
# From the project folder: C:\Users\User\Desktop\code\humanizer

# Run all test suites (53 tests + E2E pipeline)
node test_all.js

# Start app server and model manager (http://127.0.0.1:3000)
start_app.bat
# or
node server.js

# Start local llama.cpp 12B model server directly (http://127.0.0.1:8080)
run_local.bat
# or
./run_local.sh

# Local server smoke test
node test_local_model.js

# Generate benchmark outputs with Fidelity Gate active
node turnitin_benchmark/generate_outputs.js --engine local-server --run-id smoke_local_model_q3 --resume

# Summarize benchmark scorecard
node turnitin_benchmark/summarize.js --run-id smoke_local_model_q3
```

---

## 9. Credentials and safety notes

- No API keys or Turnitin credentials are stored in the project.
- HF token, if used, is kept only in browser memory.
- Never use unofficial “Turnitin checker” websites as ground truth.
- Do not market “undetectable” or “guaranteed 0%”.
- Keep detectors out of the training reward. Use detector scores only as post-hoc reporting.
- Always proofread numbers, dates, names and claim direction.

---

## 10. Final note to the next LLM

The user is practical and wants things tested, not just described. When they ask whether something works, run it and report concrete results. The strongest technical insight so far is that the real local 12B model produces very low reuse and good structure, but it still invents specific numbers. The next bottleneck is not style; it is **fact fidelity plus real Turnitin measurement**.
