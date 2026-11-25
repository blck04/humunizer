# Turnitin-First Target Plan

**Prepared:** 24 November 2026
**Decision:** Turnitin is the first named detector target.
**Scope:** English submissions only. Turnitin does not provide an AI-writing score for Chinese, and mixed-language submissions are unreliable.

---

## 1. What we are actually targeting

We are targeting **Turnitin AI Writing Detection (AIW)**, not Turnitin similarity/plagiarism scoring.

Important facts from Turnitin's current guidance:

- AIW is a module inside **Turnitin Originality** or an iThenticate 2.0 add-on. It is not a standalone public API.
- Turnitin's English model architecture was updated in **October 2026** to improve human/AI transition-point detection.
- The document score is:

  ```text
  AIW score = sentences classified as AI / sentences evaluated
  ```

- Lists, headings, references, data tables, formulas and code are removed before scoring. Those sentences are not in the denominator.
- Documents with fewer than roughly **300 evaluated prose words** are not processed reliably.
- Numeric scores below 20% are suppressed: the report shows `*%` instead of a number.
- Turnitin explicitly says AIW can identify text modified by AI paraphrasers or humanizers.
- Official accuracy claims are much more optimistic than independent academic evaluations. Treat the model as a moving black box.

### Access constraint

There is **no self-serve public Turnitin API** for this. Official access exists only for:

1. licensed institutions with instructor/admin visibility,
2. certified technical partners using the Turnitin Core API,
3. publishers through iThenticate / Crossref arrangements.

Third-party “Turnitin checker” websites are not official and must not be used as ground truth.

---

## 2. Metric definition

Do not say “93% Turnitin pass” until the metric is this specific:

```text
For a frozen, held-out corpus D, on Turnitin AIW model version V dated YYYY-MM-DD,
a document passes if the instructor-visible report shows 0% or *% AIW
and no AI-generated / AI-paraphrased sentence highlighting.
```

### Primary metric — `no_action_pass`

A document passes when:

- the AIW indicator displays `0%` or `*%`, **and**
- no sentence is highlighted as AI-generated or AI-paraphrased.

This matches the report behavior institutions actually see. `*%` means the numeric score is below 20%, so a visible numeric score of 20% or more is a failure.

### Secondary metrics

Log these when available, but do not use them as the headline claim:

| Metric | Definition | Use |
|---|---|---|
| `raw_aiw_lt_10` | Raw AIW below 10% | Stricter internal quality signal |
| `raw_aiw_lt_20` | Raw AIW below 20% | Equivalent to visible `*%` when raw data exists |
| `highlighted_sentences` | Count of AI/AI-paraphrase highlighted sentences | Diagnostic |
| `critical_fidelity_errors` | Changed numbers/names/dates, reversed claims, lost requests | Release gate |
| `minor_fidelity_errors` | Dropped qualifiers, softened modality, lost format elements | Quality report |

### The 93% threshold

For v0, the target is:

```text
point estimate >= 93% no_action_pass
```

For a defensible public or enterprise claim, require:

```text
95% Wilson confidence interval lower bound >= 93%
```

With only 200 documents, 186/200 = 93% gives a lower confidence bound around 89%, so a true ≥93% claim needs either a larger corpus or a higher observed pass rate. Report both the point estimate and the interval.

---

## 3. Corpus design

### Version 0.1 smoke corpus

The local `turnitin_benchmark/corpus.v0.1.jsonl` is a **pipeline-validation set**, not a validity benchmark.

- 12 English drafts
- 300+ prose words each
- balanced across: academic essay, business report, blog/article, technical explainer
- synthetic drafts authored locally in a generic AI-like register
- used only to prove the submit/score/analyze loop

Do not publish pass rates from this set.

### Release benchmark

Before making any claim, freeze a real benchmark:

| Dimension | Requirement |
|---|---|
| Size | >= 200 held-out documents for validation; >= 1,000 for release claims |
| Language | English only |
| Length | 300–1,200 evaluated prose words |
| Domains | academic, business, blog, technical, forum/social, creative |
| Generators | at least four named sources, e.g. GPT-5.x, Claude, Gemini, Llama |
| Conditions | original draft and rewritten output for every document |
| Format | `.txt` for consistency, unless the real workflow requires `.docx` |
| Provenance | source hash, date, generator, prompt, author consent |
| Split | development / validation / locked test |

### Baseline gate

A draft stays in the benchmark only if the original receives a visible numeric AIW score of 20% or higher. If the original is already `*%`, it cannot demonstrate improvement.

---

## 4. Experiment matrix

Run the following rewrite configurations against the frozen development set:

| Engine | Strength | Tone | Purpose |
|---|---|---|---|
| local rules | light | natural | fastest, lowest change |
| local rules | standard | natural | current default profile |
| local rules | enhanced | natural | maximum local rewriting |
| local rules | standard | academic | academic-register preservation |
| hosted 12B model | default | n/a | real trained model |
| local 12B model | default | n/a | only when hardware is available |

Selection rule:

- choose the production configuration by **fidelity, reuse and register** metrics;
- use Turnitin results only as a post-hoc report;
- do not build best-of-N selection using Turnitin feedback, because that trains directly against the detector boundary.

---

## 5. Evaluation workflow

1. Produce deterministic outputs with `generate_outputs.js`.
2. Store each rewrite as `.txt`, with metadata in JSONL.
3. Run fidelity checks before submission. Reject outputs with critical errors.
4. Submit original and rewritten files to Turnitin through an authorized account.
5. Record results in `results.csv` using the documented schema.
6. Run `summarize.js` to calculate:
   - overall no-action pass rate,
   - Wilson 95% interval,
   - strata by domain, generator, engine, strength, tone and length,
   - fidelity error rates.
7. Keep a dated scorecard for every model or rule change.

### Required result fields

```text
sample_id,run_id,variant,engine,strength,tone,rewrite_hash,
submission_date,turnitin_model_date,display_score,raw_score,
highlighted_sentences,no_action_pass,note
```

`display_score` examples: `0%`, `*%`, `37%`.

---

## 6. Local model status

The hosted Space is still quota-limited, so the local model path is now installed:

- `humanizer-12b-Q3-QAT.gguf` downloaded and checksum-verified.
- Portable CPU and Vulkan `llama-server` binaries installed under `tools/llama/`.
- `run_local.sh` starts the model with mmap + lazy tensor reads and memory-saving KV cache settings.
- One 329-word smoke draft rewrote successfully with **no missing or added numbers**.
- A verified 2-draft run (`smoke_local_model_q3_fix`) produced reuse of `0.0071` and `0.0329`, with zero critical fidelity failures. That is far better than the local rule engine.
- Full 12-draft generation can be resumed later with `--resume`; it takes roughly 4–5 minutes per draft on this CPU.

Details are in `LOCAL_MODEL.md`.

## 7. Immediate blocker

We cannot measure a real Turnitin score from this machine yet. We need one of:

1. **Best:** an institutional Turnitin Originality account where an instructor/admin can submit `.txt` files and export or read AIW results.
2. **Better for automation:** a Turnitin Core API key created by an institutional admin, plus permission to use it for this research.
3. **Acceptable research path:** a consenting instructor runs the batch inside their course site and returns the AIW report values.

Without that, the honest next step is to finish the harness, generate the rewrites, and keep the Turnitin columns `PENDING`. Public GPTZero/Originality-style detectors may be used for development only, never reported as Turnitin results.

---

## 8. What changes in the product

Once we have real Turnitin labels:

1. Freeze the best configuration as `turnitin-v0`.
2. Add a target selector in the app: `Turnitin AIW 2026-10`.
3. Show a report card with:
   - fact fidelity,
   - reuse,
   - register preservation,
   - detector result marked as **post-hoc only**,
   - clear warning that AIW is probabilistic and not a misconduct decision.
4. Do not market “undetectable” or “guaranteed 0%”. Market the measured, dated result.
