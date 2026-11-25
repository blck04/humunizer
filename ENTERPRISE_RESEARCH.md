# AI Humanizer: Enterprise-Grade Readiness Research

**Prepared:** 24 November 2026
**Context:** current prototype is a single-file static web app (`index.html`) with three tools — Humanizer (real 12B model via hosted Space, local rule engine fallback), AI Detector (heuristic + lower-clipped aggregation), Grammar Checker. No backend, no auth, no persistence, no SLA.

> **Note on scope:** the request ended with "and". This report addresses the stated goal — an AI humanizer that passes AI detectors at ≥93%. Send the truncated half and I will fold it in.

---

## 1. Executive verdict

**The 93% target is not yet a well-defined engineering requirement.** Before any of it can be built, five things must be named:

1. **Which detectors** — Turnitin, GPTZero, Originality.ai, Winston, Pangram, Copyleaks? "Passes detectors" is not one test.
2. **Which version** of each — detectors retrain; the 2026-08 Turnitin change collapsed its two-colour report specifically to reduce false misconduct reviews.
3. **What "pass" means** — `AI probability < 0.5`? `< 0.15`? "human" label at the vendor's strictest threshold?
4. **What corpus** — 62 hand-picked samples is not evidence; you need a held-out, versioned, reproducible set with domains and lengths.
5. **What the denominator is** — percentage of *documents* passing, or percentage of *detector calls* passing? Multi-detector pass rates compound: 0.93³ ≈ 0.80 across three detectors.

**Is ≥93% achievable?** On a narrow, named detector and a narrow domain, yes — published independent runs put dedicated humanizers at 68–79% against Turnitin, with the best tools reaching 96.2% average in one 2026 ranking. But this is a **moving target, not a durable capability**. The FTC's August 2025 Workado order barred accuracy claims without "competent and reliable evidence" at the time the claim is made — a standard that applies to *bypass* claims too. An unqualified "93% detector pass" advertised publicly is both an enforcement and a procurement risk.

**The more serious finding:** the commercially defensible enterprise product is not the detector-evasion tool. It is a **disclosed naturalness / brand-voice layer**. The evasion product has ~150+ competitors, a 6–12 month compliance climb, direct conflict with EU AI Act Article 50 (in force 2 Aug 2026; penalties up to €15M or 3% of global turnover), and a decaying technical moat. The voice/governance product sells at 5–20× the ARPU to buyers who can actually sign a contract. The technology overlaps heavily; the positioning does not.

---

## 2. Gap analysis: current prototype vs enterprise

| Area | Current state | Enterprise requirement | Gap |
|---|---|---|---|
| Model | 12B via free hosted Space, quota-limited; local rules fallback | Owned fine-tuned weights, dedicated serving, controlled versioning | Critical |
| Eval | 38 heuristic unit tests, 3 live tests (4 skipped on quota) | Versioned benchmark harness, named detector versions, dated reports, confidence intervals | Critical |
| Fidelity | `protectSpans` locks numbers/dates/qualifiers; reuse guard | Automated atomic-fact judge on every output; rejection threshold; human review path | Critical |
| Backend | None — static HTML | API gateway, auth, job queue, rate limits, key management | Critical |
| Security | HF token held in memory; API key model not applicable yet | OWASP LLM Top 10 controls, PII redaction, prompt-injection defence | Critical |
| Privacy | Hosted Space stores drafts anonymously per its notice | DPA, zero-data-retention, no-training clause, subprocessor registry, EU/US residency | Critical |
| Reliability | Single point of failure (Space quota); no SLA | 99.9% SLA, fallbacks, status page, idempotent retries, p50 <5s | Major |
| Product | 3 tools, no login/history/teams | SSO/SAML/OIDC, SCIM, RBAC, audit logs, teams, API keys, OpenAPI spec | Major |
| Compliance | None | SOC 2 Type II, ISO 27001/42001, Article 50 posture, China labeling if in scope | Major |
| Cost | Free (quota-limited) | Predictable cost per *approved* output with reruns accounted | Major |

---

## 3. Workstreams

### 3.1 Model ownership

Why: reselling a frontier API leaves you exposed to upstream watermarking — Phrasly's entire stated differentiation is in-house models trained on 1M+ human pages for this reason. The hosted Walter-model Space also has a daily quota, which is already our blocker.

- Fine-tune an owned base on licensed human corpora. The HF humanizer used SFT (draft→human original pairs, ~25% acceptance gate) → DPO → GRPO with a three-part reward: fidelity, register, reuse.
- **Keep the detector out of the reward.** Training against a classifier teaches its decision boundary, not natural writing. Use detector scores only as a *post-hoc reporting artifact*.
- Acquisition options: own weights + GPU (highest control), dedicated inference endpoint, or licensed third-party engine with contractual no-watermark/no-training terms.
- Smaller models are viable for short text (the StealthHumanizer BART is 406M), but its quality was poor in our test — it invented three numbers in a single sentence. Do not trade fidelity for latency without an automated guard.

### 3.2 Evaluation harness — this is the actual moat

A maintained adversarial evaluation loop is both the engineering feedback signal and the legal defence for claims.

- Fixed, versioned corpus: ≥1,000 held-out drafts across domain (academic, email, blog, report, forum), length (≤120 words is a known weak spot), language (English and Chinese separately), and generator (ChatGPT, Claude, Gemini, Llama).
- Named detector versions + date + threshold + hardware. Store raw outputs, not just scores.
- Metrics beyond pass rate:
  - **Fidelity**: critical errors (reversed claims, changed numbers/names/dates, lost requests), minor errors (dropped qualifiers), format drops. Two independent judges; count only agreements.
  - **Reuse**: verbatim 5-gram copy and content-masked syntactic skeleton recall.
  - **Register**: slang/joke/informality preservation.
  - **Detector**: per-detector pass rate at stated FPR, with confidence intervals from paired cluster bootstrap.
- Rerun on every model change and on a monthly detector-drift schedule. Publish a dated scorecard.
- **Do not ship a percentage without this harness behind it.**

### 3.3 Fidelity guardrails

The reference evaluation found dropped qualifiers in ~1 in 3 outputs — the most common failure, and the kind a skimming reader misses.

- Pre-flight: extract atomic facts (numbers, units, dates, names, quotes, qualifiers, modality) and lock them.
- Post-flight: re-extract and compare; reject on any critical mismatch. Route rejected outputs to resample or human review.
- Keep the "proofread every number, date and claim direction" disclaimer — even a 97%-correct rewriter needs a reader.
- Add an explicit "Create fact" / freeze-span UI, and make sure the *serving path* actually honours it (StealthHumanizer's `freezeWords` had no effect on its free model because the prompt was bypassed — a cautionary example).

### 3.4 Serving and cost

- Dedicated inference with batching, quantization chosen by measured fidelity (the HF model withheld Q5 and Q4 as unusable), autoscaling, and a queue for long documents.
- Split at paragraph boundaries; 8,192-token context was the reference model's limit.
- Measure **cost per approved output**, not cost per word — every failed fidelity check and rerun consumes words.
- Target p50 <5s for blog-length input; consumer tools at 30–60s are disqualifying in a pipeline.
- Model routing by length (short→small model, long→large), with a fidelity gate on the small-model path.
- Fallback chain: primary model → secondary → rule engine → clear failure. Never silently return a degraded rewrite.

### 3.5 Product and API

- Stable OpenAPI spec, documented error taxonomy, Python/JS/cURL samples, streaming, idempotent retries, webhooks for batch jobs.
- Pooled word credits instead of hard per-request caps; step-up team tier rather than a pricing cliff.
- SSO/SAML/OIDC, SCIM, RBAC, per-user/per-document audit logs, API key rotation, usage endpoint.
- Teams: shared pool, role separation, white-label option for agency buyers.
- Keep separate tools (humanize / detect / grammar) but share one balance and one API key.

### 3.6 Security — OWASP LLM Top 10 (2025)

Relevant controls for an app that accepts arbitrary user text and forwards it to a model:

1. **LLM01 Prompt Injection** — user text must never alter system instructions; use delimiters and instruction hierarchy.
2. **LLM02 Sensitive Information Disclosure** — PII redaction before model calls; never log raw drafts.
3. **LLM03 Supply Chain** — pin model/weight hashes, verify checksums, audit dependencies.
4. **LLM04 Data/Model Poisoning** — provenance checks on training corpora.
5. **LLM05 Improper Output Handling** — treat model output as untrusted; escape before rendering (already partly done via `escapeHtml`).
6. **LLM06 Excessive Agency** — no tool execution from model output.
7. **LLM07 System Prompt Leakage** — keep the exact prompt format server-side; do not echo it.
8. **LLM08 Vector/Embedding Weaknesses** — only if adding RAG for voice samples.
9. **LLM09 Misinformation** — factuality gate above.
10. **LLM10 Unbounded Consumption** — per-tenant rate limits, word caps, timeouts, cost alerts.

Note the tension: the humanizer model needs a **byte-exact raw completion prompt**, not a chat template. That makes the usual chat-layer injection defences inapplicable — sanitisation has to happen before prompt assembly.

### 3.7 Privacy, compliance, legal

- **SOC 2 Type II** (12-month period, current within 12 months) — the first hard gate above ~$50K ACV. Type I alone fails. ISO 27001; ISO 42001 for sophisticated AI buyers.
- **DPA + SCCs/IDTA**, published subprocessor list with 30-day change notice, explicit **no-training clause** in the DPA (not marketing copy), zero-data-retention processing.
- **Data residency** US/EU; EU-only inference for GDPR teams; VPC/on-prem for regulated buyers.
- **99.9% SLA**, public status page, RTO <4h / RPO <1h, 72h breach notification.
- **EU AI Act Article 50** (in force 2 Aug 2026): machine-readable marking of synthetic text, with an exemption for assistive editing that does not substantially alter input or semantics. Deployers disclosing public-interest text unless named editorial responsibility. Penalties up to €15M / 3% turnover. Extra-territorial. Embedding a third-party model under your own brand may make you the provider.
- **China**: labeling measures effective 1 Sep 2025 require visible labels and machine-readable identifiers.
- **FTC Workado order (28 Aug 2025)**: no accuracy/efficacy advertising without competent and reliable evidence. Applies to "bypass" claims.
- **Academic-integrity exposure**: several universities now treat humanizer use as misconduct itself; multiple institutions disabled Turnitin AI detection over false positives; courts have begun expunging AI flags. Do not sell on "pass Turnitin" to students.
- **Positioning**: "AI-assisted naturalness and brand voice with disclosed involvement" survives procurement. "Undetectable" does not.

### 3.8 Team and process

Minimum realistic team: ML engineer (training/eval), backend/infra engineer (serving, queue, API), security/compliance lead (SOC 2, DPA), product/design, and an adversarial evaluator/content ops analyst. Budget **6–12 months** to enterprise-ready, dominated by compliance evidence, not code.

---

## 4. Phased roadmap

**Phase 0 — Definition (1–2 weeks)**
- Decide the positioning (evasion vs disclosed naturalness layer).
- Write the metric spec: detectors, versions, thresholds, corpus, pass definition.
- Freeze a v0 benchmark of ≥200 documents.

**Phase 1 — Trustworthy engine (4–8 weeks)**
- Owned model or licensed engine with no upstream watermark risk.
- Atomic-fact fidelity gate with reject/resample.
- Evaluation harness with dated scorecards; publish methodology.
- Backend API with auth, rate limits, queue, fallback chain.

**Phase 2 — Enterprise surface (8–16 weeks)**
- SSO/SCIM/RBAC, audit logs, teams, OpenAPI spec, SLA + status page.
- DPA, no-training clause, ZDR, subprocessor registry, EU/US residency.
- Start SOC 2 Type II observation window.

**Phase 3 — Compliance close (ongoing, 6–12 months total)**
- SOC 2 Type II report, ISO 42001 path, VPC option.
- Article 50 posture: preserve provenance markers, disclose AI assistance, maintain editorial-responsibility workflow.
- Continuous detector-drift monitoring and model refresh.

**Gate to claim ≥93%:** the number is only publishable when it is (a) measured on the frozen held-out set, (b) dated with named detector versions, (c) accompanied by fidelity and confidence intervals, and (d) re-verifiable by the buyer.

---

## 5. Recommendation

Do not build "a tool that passes detectors at 93%" as the company. Build **a fact-preserving, on-voice rewriting layer with an auditable quality report**, and let the detector score be one metric inside that report. That product:

- can credibly target ≥93% on a *named* detector and *named* corpus without making a universal claim;
- passes the enterprise procurement screen that 150+ consumer humanizers fail;
- avoids the Article 50 and FTC exposure that comes with undetectability marketing;
- has a defensible moat in the evaluation harness and fidelity guardrails, not in a detector boundary that will move next month.

The current prototype is a good demo of the UX and now has the right fidelity instincts. It is roughly **one backend, one evaluation harness, and one compliance programme away** from being a credible seed of that product — not one model swap away.

---

## Sources

- Li, Chakraborty & Tewari, *Robust Detection of LLM-Generated Text under Contamination*, arXiv:2609.29935 (user-supplied PDF)
- HF article: *We built an AI humanizer and never let it see a detector* (SFT/DPO/GRPO design, fidelity numbers, quantization notes)
- Hugging Face model card and prompt_format.json, `jialinyyzz/humanizer`
- Sadasivan et al., *Can AI-Generated Text be Reliably Detected?*, arXiv:2303.11156
- RAID benchmark, raid-bench.xyz
- OWASP GenAI Security Project, *Top 10 Risks for LLM Applications 2025*
- EU AI Act Article 50 (artificialintelligenceact.eu)
- FTC final order against Workado, 28 Aug 2025 (via FTC Northwest Region announcement and legal analyses)
- StealthHumanizer repository (rudra496), market and pricing research compiled 2026-11-24
- Vendor pricing pages: Walter Writes, Phrasly Business, WriteHuman, Undetectable AI, ToHuman
