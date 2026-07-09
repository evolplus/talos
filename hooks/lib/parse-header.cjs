'use strict';

// hooks/lib/parse-header.cjs
// Helpers for parsing kit-format markdown headers.
//
// Tolerant of the markdown variants the kit's templates actually use, so hook
// parsing doesn't drift from how authors write the docs.
//
// Recognized line shapes (all match label "Status" → value "Signed-off"):
//   Status: Signed-off
//   **Status:** Signed-off
//   - **Status:** Signed-off
//   * Status: Signed-off
//   -   **Status**:   Signed-off
//   **Status:** **Signed-off**         (markdown bold around value is stripped)
//
// Returns the first match (multiline regex; callers typically slice the head of
// the doc before calling so the header wins over body mentions). Case-insensitive
// label match by default; pass {caseSensitive: true} to override.
//
// Callers should pre-process with stripFencedCodeBlocks() so a "format reference"
// fenced block at the top of the doc doesn't shadow the real header value.

function stripHtmlComments(content) {
  if (typeof content !== 'string') return '';
  return content.replace(/<!--[\s\S]*?(?:-->|$)/g, '');
}

function headerPrelude(content, maxChars) {
  const limit = Number.isFinite(maxChars) && maxChars > 0 ? maxChars : 4000;
  return stripHtmlComments(content).slice(0, limit);
}

function parseHeaderField(content, label, opts) {
  if (typeof content !== 'string' || typeof label !== 'string' || !label) {
    return null;
  }
  const caseSensitive = opts && opts.caseSensitive === true;
  // Escape regex metacharacters in the label
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Pattern:
  //   ^            line start
  //   [\s\-*]*     optional list-marker (- or *) and leading whitespace
  //   \*{0,2}      optional markdown bold open before the label
  //   <label>      the literal label
  //   \s*          tolerate space between label and colon
  //   :            mandatory colon
  //   \s*          space between colon and value
  //   \*{0,2}      optional markdown bold close (when bold wraps Label:)
  //   \s*          extra space after closing bold
  //   (\S+)        capture the first non-whitespace token of the value
  const flags = caseSensitive ? 'm' : 'mi';
  const rx = new RegExp(
    `^[\\s\\-*]*\\*{0,2}${escaped}\\s*:\\s*\\*{0,2}\\s*(\\S+)`,
    flags
  );
  const m = stripHtmlComments(content).match(rx);
  if (!m) return null;
  // Strip surrounding markdown bold/italic markers + trailing sentence punctuation
  return m[1]
    .replace(/^[*_]+/, '')
    .replace(/[*_]+$/, '')
    .replace(/[.,;:!?]+$/, '');
}

module.exports = { parseHeaderField, stripHtmlComments, headerPrelude };
