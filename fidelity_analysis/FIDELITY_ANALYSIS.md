# Fidelity Analysis: Supplied Chapter 2 Rewrite

**Input:** 483 words, 34 sentences
**Humanized output:** 683 words, 43 sentences
**Measured 5-gram reuse:** 0.0436
**Detector score reported by user:** 89% human

> The 89% figure is a detector result. It says nothing about factual accuracy. This report evaluates whether the rewrite preserved the meaning, facts, numbers, citations, headings and qualifiers of the original.

## Verdict

**Stylistic rewrite: excellent. Factual fidelity: high but not clean.**

The rewrite changed sentence structure dramatically while preserving almost every substantive claim. However, it contains **one critical fabricated number**, several altered headings/captions, and a cluster of softer qualifier shifts. It is **not submission-ready without correction**.

| Category | Count | Severity |
|---|---:|---|
| Critical factual additions | 1 | Critical |
| Missing original facts | 0 | — |
| Altered titles / captions | 3 | Medium |
| Qualifier or emphasis drift | ~10 | Minor–Medium |
| Pure wording / style changes | many | Acceptable |

## Automated checks

```text
Original words:      483
Rewritten words:     683   (+41%)
Original sentences:  34
Rewritten sentences: 43
Reuse (5-gram):      0.0436
```

Numbers found:

```text
Original:  1998, 2, 2.1, 2.1, 2.2, 2.2.1, 2.2.2, 2007
Rewritten: 1998, 2, 2.1, 2.1, 2.2, 2.2.1, 2.2.2, 20, 2007, 5, 50
```

- `20` is a legitimate normalization of “out of twenty”.
- `5` is a legitimate normalization of “five discrete operational classes”.
- **`50` is fabricated.** The original said “a percentage score”, not “50%”.

## Critical issue

### 1. Fabricated number: `50%`

Original:

> A percentage score cannot tell you which physics law tripped up a learner...

Rewrite:

> A score of 50% does not tell us which physical law a learner struggled with...

This converts a generic statement into a specific empirical claim. It is the kind of error a skimming reader will miss and an examiner or supervisor may treat as invented evidence.

**Fix:**

> A single percentage score does not tell us which physical law a learner struggled with...

## Medium issues

### 2. Figure 2.1 caption changed

Original:

> Figure 2.1: From learner response to instructional action

Rewrite:

> Figure 2.1: Inform learners, adjust instruction.

The new wording is related but not equivalent. If the figure itself was not changed, the caption is now inaccurate.

### 3. Section 2.2.1 heading changed

Original:

> 2.2.1 Formative Assessment as an Information Loop

Rewrite:

> 2.2.1 Formative Assessment as an Information Feedback Mechanism

“Information loop” and “information feedback mechanism” are conceptually close, but this is still a title change. It may break cross-references or contents-page consistency.

### 4. “Virtually none” weakened to “few”, and the subject shifted

Original:

> ...virtually none of these taxonomies translate cleanly into automated NLP pipelines.

Rewrite:

> ...few of them can be mapped easily to an automated NLP pipeline.

Two changes:

- “virtually none” → “few” is a meaningful weakening.
- “taxonomies” → “them” refers back to “misconceptions”, so the claim shifts from *taxonomies not translating* to *misconceptions not mapping*.

### 5. “Systemic” and “examiner” lost

Original:

> ...a systemic issue regularly highlighted in Southern African regional examiner reports.

Rewrite:

> It is a problem that is often pointed out in regional reports on examination (in Southern Africa).

“Systemic issue” became “problem”; “examiner reports” became generic “reports on examination”.

## Minor qualifier and emphasis drift

| Original | Rewrite | Effect |
|---|---|---|
| “proved” / “notable achievement gains” | “established the fact” / “significant positive impact” | Slight softening, direction preserved |
| “struggling learners benefiting the most” | “especially effective for learners who are struggling” | Superlative “the most” weakened |
| “actively help pupils close the gap” | “can contribute to the learners successfully narrowing the gap” | Added hedging: active → possible |
| “curricular benchmarks” | “a given curriculum requirement” | Plural → singular, narrower |
| “Fluffy praise ('good effort')” | “Saying that a learner did well” | Quoted example generalized |
| “zero actionable insight” | “does not help ... understand” | Weaker but same direction |
| “routinely conceal glaring conceptual fault lines” | “can hide some significant conceptual errors” | Frequency and severity weakened |
| “exact same procedural pitfalls” | “same kinds of procedural mistakes” | “exact” weakened |
| “carry straight over” | “continue” | Slight loss of directness |
| “dozens of qualitative student misconceptions” | “many qualitative misconceptions” | Specific count generalized |
| “revision of Bloom's taxonomy” | “modified form of ... adaption of Bloom's taxonomy” | “adaption” is awkward; “revision” was precise |
| “underlying cognitive processes” | “the cognitive processes” | “underlying” dropped |

## What was preserved correctly

The rewrite correctly preserved:

- Black and Wiliam (1998); Hattie and Timperley (2007).
- The mark “out of twenty / 20”.
- Five operational classes.
- Zimbabwe, secondary / high-school mathematics, simultaneous equations.
- Substitution, elimination and matrices.
- Advanced-level calculus and Southern Africa.
- Anderson and Krathwohl, Bloom's taxonomy, factual/conceptual knowledge vs cognitive processes.
- Table 2.1 and Figure 2.1 identifiers.
- The core argument: diagnostic support, targeted revision, teacher inspection/verification/override.
- The distinction between a classroom companion and an automated grader.

## Recommended corrections before use

1. Replace **“A score of 50%”** with **“A single percentage score”**.
2. Restore Figure 2.1’s original caption unless the figure was intentionally renamed.
3. Restore section 2.2.1’s original heading unless the new title is deliberate.
4. Change **“few of them”** to **“virtually none of these taxonomies”**.
5. Restore **“systemic issue ... regional examiner reports”**.
6. Change **“adaption”** to **“revision”** or **“adaptation”**.
7. Optional: restore “the most”, “actively”, “exact same”, “routinely”, and “glaring” where the stronger wording was intended.

## Bottom line

If the only criterion is detector evasion, the rewrite did well. If the criterion is academic fidelity, it is roughly **8/10**: structurally excellent, mostly faithful, but carrying one fabricated number and several weakened claims. Fix the `50%` sentence first; that alone changes a generic methodological point into a false specific claim.

Supporting files:

- `original.txt`
- `rewritten.txt`
- `analyze.js`
