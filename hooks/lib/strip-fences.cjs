'use strict';

// hooks/lib/strip-fences.cjs
// Pure function: given a markdown string, return the same string with content
// inside ``` fenced code blocks removed. Used by hooks that parse kit-format
// markdown so example/reference content inside fences isn't matched as real
// data.
//
// Limitations (acknowledged):
//   - Backtick fences only. The kit doesn't use ~~~ fences.
//   - Fence open detected at start-of-line (^```). Doesn't handle indented
//     fences (CommonMark allows ≤3 leading spaces).
//   - If a fence opens but never closes, every line after the open is stripped.
//     Treat as defensive: a malformed fence shouldn't make hooks over-trigger.
//   - Nested fences (` ``` ` inside ` ``` `) aren't first-class in CommonMark;
//     the toggle behavior here treats consecutive opens as nest-friendly enough
//     for the kit's purposes.

function stripFencedCodeBlocks(content) {
  if (typeof content !== 'string') return '';
  const lines = content.split('\n');
  const out = [];
  let inFence = false;
  for (const line of lines) {
    if (/^```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    out.push(line);
  }
  return out.join('\n');
}

module.exports = { stripFencedCodeBlocks };
