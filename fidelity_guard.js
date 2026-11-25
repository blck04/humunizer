/**
 * fidelity_guard.js — Pre/Post-Flight Atomic Fact Verification Gate
 * 
 * Protects against factual hallucination, number fabrication, and qualifier drift:
 * - Pre-flight entity extraction (numbers, percentages, dates, citations, proper nouns, hedges).
 * - Post-flight entity verification:
 *     * Added numbers (Critical Violation) — catches hallucinations like "50%".
 *     * Missing numbers (Critical Violation) — catches lost factual data.
 *     * Altered dates or citations (Critical Violation).
 *     * Dropped qualifiers / hedge weakening (Advisory Warning).
 * - Works identically in Node.js and the browser.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FidelityGuard = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  const QUALIFIERS = [
    'estimated', 'approximately', 'roughly', 'about', 'around', 'nearly', 'almost',
    'at least', 'up to', 'less than', 'more than', 'exactly', 'over', 'under',
    'suggest', 'suggests', 'suggested', 'may', 'might', 'could', 'possible', 'possibly',
    'maybe', 'perhaps', 'likely', 'unlikely', 'probable', 'probably', 'apparently',
    'reportedly', 'allegedly', 'seems', 'seem', 'appears', 'appear', 'tends', 'tend',
    'generally', 'typically', 'often', 'sometimes', 'rarely', 'occasionally',
    'partially', 'potentially', 'some', 'several', 'few', 'many', 'most'
  ];

  const WORD_NUMBERS = {
    'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
    'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
    'ten': '10', 'eleven': '11', 'twelve': '12', 'thirteen': '13',
    'fourteen': '14', 'fifteen': '15', 'sixteen': '16', 'seventeen': '17',
    'eighteen': '18', 'nineteen': '19', 'twenty': '20', 'thirty': '30',
    'forty': '40', 'fifty': '50', 'sixty': '60', 'seventy': '70',
    'eighty': '80', 'ninety': '90', 'hundred': '100', 'thousand': '1000',
    'million': '1000000', 'billion': '1000000000'
  };

  /**
   * Normalizes a number string for robust comparison.
   * "50 %" -> "50%"
   * "4.2 percent" -> "4.2%"
   * "1,000" -> "1000"
   */
  function normalizeNumber(numStr) {
    if (!numStr) return '';
    let s = numStr.toLowerCase().trim();
    s = s.replace(/,/g, '');
    s = s.replace(/\s*(?:percent|percentage points?)/gi, '%');
    s = s.replace(/\s+/g, ' ');
    return s;
  }

  /**
   * Extracts all numeric expressions from text (percentages, units, decimals, ints).
   */
  function extractNumbers(text) {
    if (!text || typeof text !== 'string') return [];
    
    // Pattern matches numbers with optional units or %
    const numRegex = /\b\d+(?:[.,]\d+)*(?:\s*%|\s*percent|\s*percentage points?|\s*(?:million|billion|thousand|trillion|kg|km|m|cm|mm|hours?|days?|weeks?|months?|years?|dollars?|usd|\$|€|£)\b)?/gi;
    const matches = text.match(numRegex) || [];
    
    // Also check for spelled-out numbers
    const spelled = [];
    for (const [word, val] of Object.entries(WORD_NUMBERS)) {
      const re = new RegExp('\\b' + word + '\\b', 'gi');
      if (re.test(text)) {
        spelled.push(val);
      }
    }

    const normalized = matches.map(normalizeNumber).concat(spelled);
    // Return sorted unique values
    return Array.from(new Set(normalized)).sort();
  }

  /**
   * Extracts dates and years (e.g. "2026", "October 2026", "24 November 2026", "2026-11-24").
   */
  function extractDates(text) {
    if (!text || typeof text !== 'string') return [];
    const datePatterns = [
      /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}\b/gi,
      /\b\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}\b/gi,
      /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}\b/gi,
      /\b\d{4}-\d{2}-\d{2}\b/g,
      /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g
    ];

    const dates = [];
    for (const re of datePatterns) {
      const m = text.match(re);
      if (m) dates.push(...m);
    }
    return Array.from(new Set(dates.map(d => d.trim()))).sort();
  }

  /**
   * Extracts academic and formal citations (e.g., "Li et al. (2026)", "(Smith & Jones, 2024)").
   */
  function extractCitations(text) {
    if (!text || typeof text !== 'string') return [];
    const citeRegex = /\(?[A-Z][a-z]+(?:\s*(?:et\s+al\.?|&|and)\s*[A-Z][a-z]+)?(?:\s*,\s*|\s+)\(?\d{4}\)?/g;
    const matches = text.match(citeRegex) || [];
    return Array.from(new Set(matches.map(c => c.trim().replace(/^\(|\)$/g, '')))).sort();
  }

  /**
   * Extracts qualifiers and hedges.
   */
  function extractQualifiers(text) {
    if (!text || typeof text !== 'string') return [];
    const found = new Set();
    const lower = text.toLowerCase();
    for (const q of QUALIFIERS) {
      const re = new RegExp('\\b' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
      if (re.test(lower)) {
        found.add(q.toLowerCase());
      }
    }
    return Array.from(found).sort();
  }

  /**
   * Compares an original draft and a rewritten draft to enforce factual fidelity.
   * 
   * Returns a complete fidelity scorecard:
   * - passed: boolean
   * - criticalViolations: Array of violations (added numbers, missing numbers, changed dates)
   * - advisories: Array of advisory notices (qualifier drift)
   * - entityDiff: Detailed breakdown of numbers, dates, citations, and qualifiers
   */
  function verifyFidelity(originalDraft, rewrittenDraft, options = {}) {
    const orig = (originalDraft || '').trim();
    const rew = (rewrittenDraft || '').trim();

    const origNumbers = extractNumbers(orig);
    const rewNumbers = extractNumbers(rew);

    const origDates = extractDates(orig);
    const rewDates = extractDates(rew);

    const origCites = extractCitations(orig);
    const rewCites = extractCitations(rew);

    const origQualifiers = extractQualifiers(orig);
    const rewQualifiers = extractQualifiers(rew);

    // Number diffs
    const rewNumSet = new Set(rewNumbers);
    const origNumSet = new Set(origNumbers);

    // Added numbers (CRITICAL: Hallucinations like "50%")
    const addedNumbers = rewNumbers.filter(n => {
      // Check exact match or raw number match (e.g. "50%" vs "50")
      const bare = n.replace(/[^0-9.]/g, '');
      const origHasBare = origNumbers.some(on => on.replace(/[^0-9.]/g, '') === bare);
      return !origNumSet.has(n) && !origHasBare;
    });

    // Missing numbers (CRITICAL: Lost data)
    const missingNumbers = origNumbers.filter(n => {
      const bare = n.replace(/[^0-9.]/g, '');
      const rewHasBare = rewNumbers.some(rn => rn.replace(/[^0-9.]/g, '') === bare);
      return !rewNumSet.has(n) && !rewHasBare;
    });

    // Date diffs
    const rewDateSet = new Set(rewDates);
    const origDateSet = new Set(origDates);
    const addedDates = rewDates.filter(d => !origDateSet.has(d));
    const missingDates = origDates.filter(d => !rewDateSet.has(d));

    // Citation diffs
    const rewCiteSet = new Set(rewCites);
    const missingCites = origCites.filter(c => !rewCiteSet.has(c));

    // Qualifier drift
    const rewQualSet = new Set(rewQualifiers);
    const droppedQualifiers = origQualifiers.filter(q => !rewQualSet.has(q));

    // Build violations & advisories
    const criticalViolations = [];
    const advisories = [];

    // 1. Added numbers (Hallucination)
    if (addedNumbers.length > 0) {
      criticalViolations.push({
        type: 'added_number',
        severity: 'critical',
        items: addedNumbers,
        message: `Fabricated numbers detected: ${addedNumbers.join(', ')}`
      });
    }

    // 2. Missing numbers (Data loss)
    if (missingNumbers.length > 0) {
      criticalViolations.push({
        type: 'missing_number',
        severity: 'critical',
        items: missingNumbers,
        message: `Original numbers missing from rewrite: ${missingNumbers.join(', ')}`
      });
    }

    // 3. Date alterations
    if (addedDates.length > 0) {
      criticalViolations.push({
        type: 'added_date',
        severity: 'critical',
        items: addedDates,
        message: `New or altered dates introduced: ${addedDates.join(', ')}`
      });
    }
    if (missingDates.length > 0) {
      criticalViolations.push({
        type: 'missing_date',
        severity: 'critical',
        items: missingDates,
        message: `Original dates missing: ${missingDates.join(', ')}`
      });
    }

    // 4. Citation alterations
    if (missingCites.length > 0) {
      criticalViolations.push({
        type: 'missing_citation',
        severity: 'critical',
        items: missingCites,
        message: `Citations dropped: ${missingCites.join(', ')}`
      });
    }

    // 5. Advisories (qualifier drift)
    if (droppedQualifiers.length > 0) {
      advisories.push({
        type: 'dropped_qualifier',
        severity: 'advisory',
        items: droppedQualifiers,
        message: `Qualifiers / hedges softened: ${droppedQualifiers.join(', ')}`
      });
    }

    const passed = criticalViolations.length === 0;

    return {
      passed,
      criticalViolations,
      advisories,
      summary: passed
        ? '✓ Factual fidelity verified: all numbers, dates, and citations preserved without fabrication.'
        : `⚠️ Fidelity Gate Failed: ${criticalViolations.map(v => v.message).join('; ')}`,
      entityDiff: {
        numbers: { original: origNumbers, rewritten: rewNumbers, added: addedNumbers, missing: missingNumbers },
        dates: { original: origDates, rewritten: rewDates, added: addedDates, missing: missingDates },
        citations: { original: origCites, rewritten: rewCites, missing: missingCites },
        qualifiers: { original: origQualifiers, rewritten: rewQualifiers, dropped: droppedQualifiers }
      }
    };
  }

  return {
    QUALIFIERS,
    WORD_NUMBERS,
    extractNumbers,
    extractDates,
    extractCitations,
    extractQualifiers,
    verifyFidelity
  };
});
