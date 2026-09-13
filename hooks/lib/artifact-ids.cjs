#!/usr/bin/env node
// hooks/lib/artifact-ids.cjs
//
// One definition of the kit's artifact-ID grammar, shared by every guard that
// looks for ID rows in a design artifact.
//
// THE DEFECT THIS EXISTS FOR (ISSUE-179, 2026-09-13)
// Guards hard-coded `/\bCMP-(?:\d+|NONE)\b/i` — prefix, then digits. A real
// contract's Approver-confirmed composition IDs were `CMP-GW-001..011`: a
// qualifier infix (`GW`, the flow tag) sits between the prefix and the number,
// so the pattern could never match. The document contained eleven perfectly
// valid composition rows and zero `CMP-\d+` tokens.
//
// That left the FE Dev with only two escape routes, BOTH of which required
// asserting something false:
//   - rename to CMP-NNN, contradicting the Approver-confirmed handoff
//     (handoffs/T-217.md, flow-c-grace-window-v1.md and the completeness report
//     all carry only CMP-GW-NNN); or
//   - write CMP-NONE, falsely declaring eleven real composition regions absent.
// The FE Dev correctly refused both and escalated. A guard whose only
// satisfying inputs are falsehoods is a defect in the guard, never a reason for
// an agent to lie — see § "Guards must not coerce a false assertion" in
// rules/hard-rules.md.
//
// Two compounding factors, both fixed here:
//
//   1. The failure MESSAGE was wrong. "has no CMP-* rows" is what an author
//      reads when there are eleven; it points at the content instead of the
//      pattern, which is precisely what pushes an agent toward renaming or
//      declaring NONE. `describeMismatch()` now distinguishes "no ID-like rows
//      at all" from "IDs present but not in the expected shape", and prints the
//      offending samples.
//   2. The same narrow shape was pasted into nine places across three hooks for
//      three ID families (CMP, AST, DEM). One of them was a REJECT pattern —
//      `/\bAST-\d+\b[^\r\n]*\bblocked\b/` — so a blocked asset with a qualified
//      ID silently passed the gate it was meant to catch. A hard-coded format
//      copied N times drifts from the artifacts that own it N ways.
//
// GRAMMAR
//   <PREFIX> "-" [ <QUALIFIER> "-" ]* <NUMBER>     e.g. CMP-001, CMP-GW-001,
//                                                       AST-ICON-2, DEM-A1-B2-07
//   <PREFIX> "-NONE"                               genuine absence, nothing else
//
// Qualifier segments are alphanumeric and owned by the upstream artifact — BA,
// UI/UX Designer and the Approver name them. A guard's job is to check that
// evidence rows EXIST, not to dictate what upstream may call them.

'use strict';

// One qualifier segment: letters/digits, no separators of its own.
const QUALIFIER = '[A-Za-z0-9]{1,16}';
// Up to 4 qualifier segments keeps the pattern bounded without being a
// practical limit (the observed worst case uses one).
const MAX_QUALIFIERS = 4;

function idBody() {
  return `(?:${QUALIFIER}-){0,${MAX_QUALIFIERS}}\\d{1,6}`;
}

// Matches a real ID: CMP-001, CMP-GW-001, AST-ICON-12 ...
function idPattern(prefix) {
  return new RegExp(`\\b${prefix}-${idBody()}\\b`, 'i');
}

// Matches a real ID OR the explicit absence assertion.
//
// `<PREFIX>-NONE` means "this artifact genuinely has no regions of this kind".
// It is NOT an escape hatch for a pattern that will not match: writing NONE
// over real rows is a false assertion about the design, and any guard message
// that nudges an author toward it is the guard's bug.
function idOrNonePattern(prefix) {
  return new RegExp(`\\b${prefix}-(?:NONE|${idBody()})\\b`, 'i');
}

// A table row that carries an ID of this family and also matches `suffixSource`
// somewhere on the same line — used for reject rules such as "blocked".
// Must use the same ID body as the require rules, or the reject silently
// under-matches and lets through exactly what it exists to catch.
function rowPattern(prefix, suffixSource) {
  return new RegExp(
    `^\\|?[^\\r\\n]*\\b${prefix}-${idBody()}\\b[^\\r\\n]*${suffixSource}`,
    'im'
  );
}

// Any token that merely STARTS like this family, whatever follows. Used only to
// tell "nothing here" apart from "here, but shaped differently".
function looseTokenPattern(prefix) {
  return new RegExp(`\\b${prefix}-[A-Za-z0-9][A-Za-z0-9-]*`, 'ig');
}

// Build the diagnostic for a section that failed its require rule.
// Returning the samples is the whole point: an author who sees
// "found CMP-GW-001, CMP-GW-002" knows to fix the PATTERN, not the document.
function describeMismatch(prefix, sectionText, heading) {
  const label = heading ? `## ${heading}` : `${prefix}-* section`;
  const found = [];
  if (typeof sectionText === 'string' && sectionText) {
    const seen = new Set();
    for (const m of sectionText.match(looseTokenPattern(prefix)) || []) {
      const t = m.replace(/[-–—,.;:)\]]+$/, '');
      if (!seen.has(t)) { seen.add(t); found.push(t); }
      if (found.length >= 6) break;
    }
  }

  if (found.length === 0) {
    return `${label} has no ${prefix}-* rows ` +
      `(expected ${prefix}-NNN, or ${prefix}-<QUALIFIER>-NNN, or ${prefix}-NONE if there genuinely are none)`;
  }

  return (
    `${label} contains ${prefix}-* tokens that do not match the expected ID shape: ` +
    `${found.join(', ')}${found.length >= 6 ? ', …' : ''}. ` +
    `Expected ${prefix}-NNN or ${prefix}-<QUALIFIER>-NNN (qualifier segments are alphanumeric). ` +
    `The rows are present, so this is an ID-SHAPE mismatch, not missing evidence — ` +
    `do NOT rename IDs that an Approver-confirmed handoff already fixed, and do NOT write ` +
    `${prefix}-NONE over real rows. If the IDs are legitimate and still rejected, the pattern is wrong: ` +
    `raise it as an open issue against hooks/lib/artifact-ids.cjs.`
  );
}

module.exports = {
  MAX_QUALIFIERS,
  QUALIFIER,
  describeMismatch,
  idBody,
  idOrNonePattern,
  idPattern,
  looseTokenPattern,
  rowPattern,
};
