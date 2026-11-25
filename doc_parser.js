/**
 * doc_parser.js — Document Parser, Layout Classifier & Chunking Engine
 * 
 * Extracts and classifies structured blocks from documents (.txt, .md, .docx, .pdf):
 * - Identifies and preserves Tables of Contents (TOC), Tables, Figures/Diagrams, Headings.
 * - Extracts prose paragraphs and chunks them into optimal lengths (~300–500 words) for
 *   humanization via the 12B model or local engine.
 * - Supports dual-mode reassembly:
 *     1) 'prose-only': pure narrative prose for Turnitin/detector targeting.
 *     2) 'full-doc': full document reconstruction preserving original tables, TOC, and diagrams.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DocParser = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  // ===== BLOCK TYPES =====
  const BLOCK_TYPES = {
    TOC: 'toc',
    TABLE: 'table',
    FIGURE: 'figure',
    HEADING: 'heading',
    PROSE: 'prose',
    CODE: 'code',
    METADATA: 'metadata'
  };

  // ===== REGEX PATTERNS =====
  const PATTERNS = {
    // TOC Detection: dotted leaders, trail page numbers, or explicit headers
    tocHeader: /^(?:table of contents|contents|outline|table of figures|list of tables)\b/i,
    tocLeaderLine: /^(?:[\w\s.,:()/-]{2,80}?)(?:\.{3,}|…{2,}|\s{3,})\s*(?:[ivxlcdm]+|\d+)\s*$/i,
    tocSectionLine: /^(?:chapter\s+\d+|section\s+\d+|\d+(\.\d+)*)\s+[^\n]{2,80}\s+(?:[ivxlcdm]+|\d+)$/i,

    // Figure / Diagram Detection (e.g., Figure 1, Figure 1.1:, Fig. 2-A)
    figureCaption: /^(?:figure|fig\.|illustration|chart|diagram|plate|photo|image)\s+\d+(?:[.-]\d+)*[:.]?\s+[^\n]*/i,

    // Table Detection
    markdownTableSeparator: /^\s*\|?\s*:?-+:?\s*\|\s*:?-+:?.*$/m,
    markdownTableRow: /^\s*\|(?:[^|\r\n]+\|)+\s*$/,
    tabDelimitedRow: /^[^\t\r\n]+\t[^\t\r\n]+(?:\t[^\t\r\n]+)*$/,

    // Headings
    heading: /^(?:#+\s+[^\n]+|chapter\s+\d+[:.]?\s*[^\n]*|\d+(\.\d+)*\s+[A-Z][^\n]{1,60})$/i,

    // Code blocks
    codeFence: /^```[\s\S]*?```$/m
  };

  /**
   * Counts words in a string.
   */
  function countWords(str) {
    if (!str || !str.trim()) return 0;
    return str.trim().split(/\s+/).length;
  }

  /**
   * Classifies a single raw text block or paragraph.
   */
  function classifyBlock(text, prevBlockType) {
    const trimmed = text.trim();
    if (!trimmed) return null;

    // 1. Code Fence
    if (trimmed.startsWith('```') && trimmed.endsWith('```')) {
      return { type: BLOCK_TYPES.CODE, label: 'Code Block', filterTurnitin: true };
    }

    // 2. TOC Header or TOC Leader Lines
    if (PATTERNS.tocHeader.test(trimmed)) {
      return { type: BLOCK_TYPES.TOC, label: 'Table of Contents', filterTurnitin: true };
    }
    const lines = trimmed.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const leaderLines = lines.filter(l => PATTERNS.tocLeaderLine.test(l) || PATTERNS.tocSectionLine.test(l));
    if (leaderLines.length > 0 && (leaderLines.length / lines.length >= 0.5 || prevBlockType === BLOCK_TYPES.TOC)) {
      return { type: BLOCK_TYPES.TOC, label: 'Table of Contents', filterTurnitin: true };
    }

    // 3. Figures & Diagrams
    if (PATTERNS.figureCaption.test(trimmed)) {
      return { type: BLOCK_TYPES.FIGURE, label: 'Figure / Diagram', filterTurnitin: true };
    }

    // 4. Tables (Markdown or Tab-delimited)
    if (lines.length >= 2) {
      const isMdTable = lines.some(l => PATTERNS.markdownTableSeparator.test(l)) ||
                        lines.filter(l => PATTERNS.markdownTableRow.test(l)).length >= 2;
      const isTabTable = lines.filter(l => PATTERNS.tabDelimitedRow.test(l)).length >= 2;
      if (isMdTable || isTabTable) {
        return { type: BLOCK_TYPES.TABLE, label: 'Data Table', filterTurnitin: true };
      }
    }

    // 5. Headings (Short single lines, title case, chapter markers)
    if (lines.length === 1 && (PATTERNS.heading.test(trimmed) || (trimmed.length < 70 && !/[.!?]$/.test(trimmed) && /^[A-Z0-9]/.test(trimmed)))) {
      return { type: BLOCK_TYPES.HEADING, label: 'Heading / Section', filterTurnitin: true };
    }

    // 6. Default to Body Prose
    return { type: BLOCK_TYPES.PROSE, label: 'Body Prose', filterTurnitin: false };
  }

  /**
   * Parses raw plain text / Markdown into structured classified blocks.
   */
  function parseText(rawText) {
    if (!rawText || !rawText.trim()) return [];

    // Split on double newlines or major structural gaps
    const rawParagraphs = rawText.split(/(?:\r?\n){2,}/);
    const blocks = [];
    let idCounter = 1;
    let prevType = null;

    for (let i = 0; i < rawParagraphs.length; i++) {
      const p = rawParagraphs[i].trim();
      if (!p) continue;

      const classification = classifyBlock(p, prevType);
      if (!classification) continue;

      const isProse = classification.type === BLOCK_TYPES.PROSE;
      const wCount = countWords(p);

      blocks.push({
        id: 'block_' + (idCounter++),
        type: classification.type,
        label: classification.label,
        filterTurnitin: classification.filterTurnitin,
        rawContent: p,
        wordCount: wCount,
        // By default, prose blocks are queued for humanization; others are preserved untouched.
        includedForHumanize: isProse,
        humanizedContent: null,
        status: isProse ? 'queued' : 'preserved'
      });

      prevType = classification.type;
    }

    return blocks;
  }

  /**
   * Parses HTML content (such as from mammoth.js conversion of .docx).
   */
  function parseHtml(htmlContent) {
    if (!htmlContent || !htmlContent.trim()) return [];

    // If DOMParser is available (browser environment), use it
    if (typeof DOMParser !== 'undefined') {
      const doc = new DOMParser().parseFromString(htmlContent, 'text/html');
      const nodes = Array.from(doc.body.children);
      const blocks = [];
      let idCounter = 1;
      let prevType = null;

      for (const node of nodes) {
        const tagName = node.tagName.toLowerCase();
        let type = BLOCK_TYPES.PROSE;
        let label = 'Body Prose';
        let filterTurnitin = false;
        let text = node.innerText || node.textContent || '';
        text = text.trim();
        if (!text && tagName !== 'table' && tagName !== 'img') continue;

        if (tagName === 'table') {
          type = BLOCK_TYPES.TABLE;
          label = 'Data Table';
          filterTurnitin = true;
          text = node.outerHTML;
        } else if (tagName === 'img' || tagName === 'figure' || PATTERNS.figureCaption.test(text)) {
          type = BLOCK_TYPES.FIGURE;
          label = 'Figure / Diagram';
          filterTurnitin = true;
        } else if (/^h[1-6]$/.test(tagName)) {
          type = BLOCK_TYPES.HEADING;
          label = 'Heading ' + tagName.toUpperCase();
          filterTurnitin = true;
        } else {
          // Check paragraph content
          const classified = classifyBlock(text, prevType);
          type = classified.type;
          label = classified.label;
          filterTurnitin = classified.filterTurnitin;
        }

        const isProse = type === BLOCK_TYPES.PROSE;
        blocks.push({
          id: 'block_' + (idCounter++),
          type,
          label,
          filterTurnitin,
          rawContent: text,
          wordCount: countWords(text),
          includedForHumanize: isProse,
          humanizedContent: null,
          status: isProse ? 'queued' : 'preserved'
        });
        prevType = type;
      }
      return blocks;
    }

    // Fallback: parse via text regex
    return parseText(htmlContent.replace(/<[^>]+>/g, '\n\n'));
  }

  /**
   * Smart Chunking:
   * Groups prose blocks into chunks of ~300 to 500 words to match 12B model capabilities
   * and Turnitin 300+ word sentence-evaluation threshold.
   */
  function createChunks(blocks, minWords = 250, maxWords = 500) {
    const chunks = [];
    let currentChunk = {
      chunkIndex: 0,
      blockIds: [],
      text: '',
      wordCount: 0,
      status: 'queued',
      humanizedText: null
    };

    for (const b of blocks) {
      if (!b.includedForHumanize) continue;

      const words = b.wordCount;
      // If adding this block exceeds maxWords and we already have enough words, start a new chunk
      if (currentChunk.wordCount >= minWords && (currentChunk.wordCount + words > maxWords)) {
        chunks.push(currentChunk);
        currentChunk = {
          chunkIndex: chunks.length,
          blockIds: [],
          text: '',
          wordCount: 0,
          status: 'queued',
          humanizedText: null
        };
      }

      currentChunk.blockIds.push(b.id);
      currentChunk.text = currentChunk.text ? (currentChunk.text + '\n\n' + b.rawContent) : b.rawContent;
      currentChunk.wordCount += words;
    }

    if (currentChunk.blockIds.length > 0) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  /**
   * Reassembles output according to selected mode:
   * 1. 'prose-only': Returns only humanized prose chunks (Turnitin target).
   * 2. 'full-doc': Replaces prose blocks with their humanized counterparts, keeping
   *    all tables, headings, TOC, and figures in their exact original sequential order!
   */
  function reassembleDocument(blocks, chunks, mode = 'prose-only') {
    // Map blockId -> humanized replacement
    // If a chunk contains multiple blockIds, we map them accordingly
    const blockHumanizedMap = {};
    for (const ch of chunks) {
      if (ch.humanizedText && ch.blockIds) {
        if (ch.blockIds.length === 1) {
          blockHumanizedMap[ch.blockIds[0]] = ch.humanizedText;
        } else {
          // If grouped, assign the combined text to the first block and empty strings to subsequent
          blockHumanizedMap[ch.blockIds[0]] = ch.humanizedText;
          for (let i = 1; i < ch.blockIds.length; i++) {
            blockHumanizedMap[ch.blockIds[i]] = '';
          }
        }
      }
    }

    if (mode === 'prose-only' || mode === 'clean-prose') {
      const prosePieces = [];
      for (const ch of chunks) {
        if (ch.humanizedText) {
          prosePieces.push(ch.humanizedText.trim());
        }
      }
      return prosePieces.join('\n\n');
    }

    // Mode: 'full-doc'
    const fullPieces = [];
    for (const b of blocks) {
      if (b.includedForHumanize && blockHumanizedMap[b.id] !== undefined) {
        const replacement = blockHumanizedMap[b.id];
        if (replacement) {
          fullPieces.push(replacement.trim());
        }
      } else {
        // Untouched structural element (Table, TOC, Figure, Heading, etc.)
        fullPieces.push(b.rawContent.trim());
      }
    }

    return fullPieces.filter(Boolean).join('\n\n');
  }

  /**
   * Generates a simple .docx file binary blob from plain text or HTML.
   * Creates a standard Office Open XML container with word/document.xml.
   */
  function generateDocxBlob(content) {
    const paragraphs = content.split(/(?:\r?\n){2,}/);
    let xmlBody = '';
    for (const p of paragraphs) {
      const lines = p.split(/\r?\n/);
      let runXml = '';
      for (let j = 0; j < lines.length; j++) {
        const clean = lines[j]
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        runXml += `<w:r><w:t xml:space="preserve">${clean}</w:t></w:r>`;
        if (j < lines.length - 1) {
          runXml += '<w:r><w:br/></w:r>';
        }
      }
      xmlBody += `<w:p><w:pPr><w:spacing w:after="200" w:line="276" w:lineRule="auto"/></w:pPr>${runXml}</w:p>`;
    }

    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${xmlBody}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

    const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

    const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

    // If JSZip is available, use it to zip properly; otherwise, fallback to HTML-based Word format (.doc/.docx compatible)
    if (typeof JSZip !== 'undefined') {
      const zip = new JSZip();
      zip.file('[Content_Types].xml', contentTypesXml);
      zip.file('_rels/.rels', relsXml);
      zip.file('word/document.xml', documentXml);
      return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    }

    // Universal fallback: HTML document that Word opens natively and seamlessly
    const wordHtml = `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='utf-8'><title>Humanized Document</title>
<style>
body { font-family: 'Calibri', 'Segoe UI', sans-serif; font-size: 11pt; line-height: 1.5; margin: 1in; }
p { margin-bottom: 10pt; }
</style>
</head>
<body>
${paragraphs.map(p => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>`).join('\n')}
</body></html>`;

    return Promise.resolve(new Blob([wordHtml], { type: 'application/msword' }));
  }

  return {
    BLOCK_TYPES,
    PATTERNS,
    countWords,
    classifyBlock,
    parseText,
    parseHtml,
    createChunks,
    reassembleDocument,
    generateDocxBlob
  };
});
