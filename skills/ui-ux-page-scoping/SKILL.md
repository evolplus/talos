---
name: ui-ux-page-scoping
description: Mandatory Step 0 for every UI/UX Designer mode. Resolve one Figma page as the scoped root before reading or writing Figma, update only the SRS page-scope fields when resolution is needed, and record the page Node ID/name in every UI/UX artifact so Figma operations do not walk brainstorm, archive, or Foundation pages by accident.
agents: [ui-ux-designer]
sdlc_phase: design
owner: Platform Eng
status: active
---

# UI/UX Page Scoping

## Use

Use this skill at the start of every UI/UX Designer dispatch mode:

- `extract`
- `map`
- `create`
- `import`
- `revise`
- `incorporate`

A Figma file has multiple pages. The kit scopes every read/write to one page per file so design extraction, mapping, and handoff do not mix project screens with drafts, archives, or the Foundation page.

## Inputs

- Dispatch Figma URL or the SRS `## Design References` rows.
- `docs/SRS.md` §3.4.1 fields:
  - `Figma-File-URL`
  - `Figma-Design-Page-Node-ID`
  - `Figma-Design-Page-Name`
- Figma MCP read access.

## Outputs

- A resolved page Node ID used as the root for every later Figma operation.
- Optional SRS §3.4.1 update limited to `Figma-Design-Page-Node-ID` and `Figma-Design-Page-Name`.
- Page-scope metadata in the mode artifact:
  - `Figma-Design-Page-Node-ID`
  - `Figma-Design-Page-Name`

## Procedure

1. Read the Figma URL and the paired `Figma-Design-Page-Node-ID` / `Figma-Design-Page-Name` from SRS §3.4.1.
2. If the SRS has UI requirements and the page field is missing or empty, halt with `NEEDS_CONTEXT`. Ask for the Figma page to use. Do not inspect every page to guess.
3. Resolve the captured value:
   - PAGE node (`CANVAS` / `PAGE`) -> use it as the root.
   - FRAME or SECTION node -> walk up to the containing PAGE, then update the SRS page fields.
   - PAGE NAME string -> query available pages, resolve an exact case-insensitive match, then update the SRS page fields. If no unique match exists, halt with `NEEDS_CONTEXT` and list the page names.
4. Scope every later Figma read/write to the subtree under the resolved page Node ID.
5. Record the resolved page ID/name in the artifact produced by the mode.
6. When a mode writes to Figma (`create` or `revise`), create or update project screens only inside the scoped page. The Foundation page remains governed by `design-system-author`.

## Hard Rules

- Never walk all pages of a Figma file for project screen work.
- Never choose a page by intuition or by first page ordering.
- Never modify SRS body content from this skill. Only the page-scope fields may be updated.
- Never write project screens to the Foundation page unless the dispatch is explicitly about Foundation content.
- Every downstream UI/UX artifact must carry the resolved page Node ID and page name.

## References

- `.claude/skills/figma-requirements-extraction/`
- `.claude/skills/figma-srs-mapping/`
- `.claude/skills/figma-design-handoff/`
- `.claude/skills/figma-canvas-layout/`
