---
name: ba-ingestion-pipeline
description: BA ingestion backbone run on every ingestion dispatch (after the mode-specific setup skill). Contains Phase 1.X common procedure (structural conformance, US/FR pairing, self-containment, external-integration identification, Design-Flow + Design-Guideline + Frontend-Framework + Backend-Track/Framework detection), Phase 1.Z delta detection (iteration trigger), and Phase 2 sign-off gate (caps at Ready-for-Sign-off; BA never self-signs-off).
agents: [ba]
sdlc_phase: planning
owner: Platform Eng
status: active
---

# BA Ingestion Pipeline — Phase 1.X common + Phase 1.Z delta + Phase 2 sign-off

## When to use

You are the BA and you have finished a mode-specific setup skill (Mode A/B/C/D/E/F). Run the common procedure that applies to every ingestion dispatch: Phase 1.X (structural + pairing + self-containment + external-integration + Design-Flow/Guideline + Frontend-Framework + Backend-Track/Framework), Phase 1.Z (delta detection / iteration trigger), and Phase 2 (sign-off gate). If Phase 1.Z produces a diff, the iteration is planned via the `ba-iteration-planning` skill on a later dispatch.

#### Phase 1.X — Common Procedure (all modes)

0. **Structural conformance check.** Compare the incoming SRS against [`.claude/agents/_templates/_artifacts/srs-template.md`](../../agents/_templates/_artifacts/srs-template.md) as the structural baseline. Verify the following top-level sections exist (even if empty placeholders):
   - Header block: H1 title, Version, Domain, Author, Status, Last-Updated, Signed-off-by, Designated Design Approver, Design-Flow, Design-Guideline, Frontend-Framework, Backend-Track, Backend-Framework, Designated Dependency Approver
   - § 1 Executive Summary
   - § 2 Business Requirements Document (BRD)
   - § 3 Functional Requirements (with §3.1 Domain Specification, §3.2 User Stories, §3.3 FRS, §3.4 Technical Constraints & Interface)
   - § 4 Non-Functional Requirements (with §4.1 Security & Compliance when triggered)
   - § 5 User Roles & Permissions
   - § 6 User Activity Logging & Tracking Specification
   - § 7 Definition of Done (DoD)
   - § 8 Open Questions & Clarifications
   - § 9 Resolved Questions
   - § 10 Changelog

   For UI-bearing SRSs, also verify §3.4.1 Design References, §3.4.2 UI Introspection Profile, and §3.4.3 Acceptance of Non-Introspectable Surfaces (the last only when §3.4.2 contains Partial or None rows).

   For SRSs with any API surface (HTTP REST / gRPC / GraphQL / async messaging), also verify §3.4.4 API Contract Format. Required when at least one FR exposes an endpoint or message contract. If §3.4.4 is missing AND the SRS has any FR with Input Schema / Output Schema / Error Handling implying an external interface, raise an OQ in §8 with category `api-contract-format-undeclared`: "Project has APIs (FRs: <list>) but §3.4.4 API Contract Format is not declared. Default would be `openapi-3.1` for REST endpoints; explicit declaration required per CLAUDE.md §10. Suggested resolution: (a) declare openapi-3.1 if REST; (b) declare proto3 / graphql-sdl for gRPC / GraphQL; (c) ADR-justified markdown for legacy / prototype scope only.

   For SRSs that ship any frontend or backend code, also verify §3.4.5 Source Layout. It declares the two fixed source roots (`frontend/`, `backend/`) plus one sub-directory per app/service when a tier has more than one (slugs mirror the architecture's C4 containers). Frontend rows include `Framework / Runtime`, which must agree with `Frontend-Framework:`. Backend rows include `Framework / Runtime` and `Backend Track`, which must agree with `Backend-Framework:` and `Backend-Track:`. If §3.4.5 is missing AND the SRS implies FE or BE code (any FR with UI surface or server-side operation), seed it with the two roots and a single-app/single-service row each, then raise an OQ in §8 with category `source-layout-undeclared` only if the tier count is genuinely ambiguous: "Project ships code but §3.4.5 Source Layout is not declared. Default is `frontend/` + `backend/` with single-app/single-service layout; declare sub-directories if there are multiple FE apps or BE services. FE Dev / BE Dev writes are hook-gated to the declared roots."

   - **Conformant** (all required sections present, even if empty): proceed to step 1.
   - **Partially conformant** (some sections missing): proceed; the existing per-section ingestion (steps 3–4) handles the gaps.
   - **Non-conformant** (more than half the required sections missing): file the first OQ in § 8: "SRS does not conform to the kit's template structure — N of M required sections missing. Likely needs re-authoring rather than augmentation." Proceed with ingestion, but expect heavy augmentation.

0a. **`docs/user-stories/` pairing verification.** After Step 0 structural conformance, walk SRS §3.2 index and the `docs/user-stories/` directory together. For every US-ID in §3.2 there must be a file at `docs/user-stories/<US-ID>.md`, and vice-versa. Orphans (rows without files, files without rows) become OQs in SRS §8 — do NOT silently delete either side. See the docs/user-stories/ Pairing Rule in `srs-ingestion-checklist.md`.

0b. **`docs/frs/` pairing verification.** After Step 0a, walk SRS §3.3 index and the `docs/frs/` directory together. For every FR-ID in §3.3 there must be a file at `docs/frs/<FR-ID>.md`, and vice-versa. Orphans (rows without files, files without rows) become OQs in SRS §8 — do NOT silently delete either side. See the docs/frs/ Pairing Rule in `srs-ingestion-checklist.md`.

1. Read the incoming `docs/SRS.md` end to end.
2. Validate it against the SRS ingestion checklist.
3. For each missing engineering section the checklist requires:
   - Add the section under the canonical heading
   - Populate it from existing SRS content if equivalent content exists under a different heading (link or copy; do
     not require rename)
   - If the content does not exist anywhere in the SRS, leave the section present with a placeholder and raise an
     Open Question requesting it
4. For each present-but-insufficient section: do not rewrite. Raise an Open Question.
5. Add the workflow's required header (Status, Last-Updated, Signed-off-by) if missing. Initial Status = `In-Review`.
6. **Designated Design Approver handling.** Ensure the `Designated Design Approver:` field is in the header (value `TBD` if absent). If the SRS has at least one UI surface AND the value is `TBD`, file a `deferred` entry in `docs/open-issues.md` per the Designated Design Approver Rule in the ingestion checklist. Do **not** file as a SRS `## Open Questions` entry — Approver gaps are process metadata, not requirement gaps, and must not block sign-off.

7. **Designated Dependency Approver handling.** Ensure the `Designated Dependency Approver:` field is in the header (value `TBD` if absent). If the SRS has architecture / SA scope AND the value is `TBD`, file a `deferred` entry in `docs/open-issues.md` per the Designated Dependency Approver Rule in the ingestion checklist. Do **not** file as a SRS `## Open Questions` entry — Approver gaps are process metadata, not requirement gaps, and must not block sign-off.


8. **Self-containment check (automated procedure).** Per CLAUDE.md §10 self-containment invariant, grep each kit artifact produced by this ingestion (`docs/SRS.md`, `docs/user-stories/*.md`, `docs/frs/*.md`, `docs/architecture.md`, `docs/decisions/*.md`, `docs/test-cases/**/*.md`, `docs/uiux/handoffs/*.md`, `docs/uiux/visual-specs/*.md`) for body-content references back to upstream input. Flag any hit on:

   - `see docs/requirements/<...>`, `details in docs/requirements/<...>`, `refer to docs/requirements/<...>`
   - `see docs/archaeology-reports/<...>`, `details in docs/archaeology-reports/<...>`
   - `see <Confluence URL>`, `refer to <Notion page>`, `<Jira-epic://> ref` in body content
   - `see services/<path>`, `details in services/<path>` (code back-reference)
   - Any URL or path pointing to upstream input where the kit artifact should have inlined the content

   For each hit, file an OQ in SRS §8 with category `non-self-contained-reference` citing the file + line + matched phrase. Allowed exceptions:
   - Lines inside `**Synthesized-From:**`, `**Source:**`, `**Source-Hash:**`, `**Source-Last-Pulled:**`, `**Figma-File-URL:**`, `**Figma-File-Version:**`, `**Last-Confirmed:**` (provenance audit annotations)
   - Lines starting with `Linked FRs:`, `Linked Component:`, `Linked SRS:`, `Linked anchor:`, `Refs: ADR-NNNN` (lateral kit references)
   - Lines inside §10 Changelog tables (historical record of ingestion)
   - Lines inside fenced code blocks (illustrative examples, not body-content references)

   The `self-containment-validator.cjs` hook enforces this at write time too — the Phase 1.X grep is a final audit. Inconsistencies block sign-off.

9. **External-integration identification (placeholder authorship).** Per CLAUDE.md §10 strict gate, every external system the product touches must be inventoried in SRS §3.5 with a paired `docs/external-integrations/<system-slug>.md` placeholder before SRS sign-off can complete. BA's job here is identification + placeholder; SA's `external-integration-adequacy` dispatch fills per-operation detail and is the only agent that may set `Adequacy: adequate`.

   **Detection scope.** Walk the SRS body + every `docs/user-stories/<US-ID>.md` + every `docs/frs/<FR-ID>.md` for mentions of:

   - In-org systems by name: `Account/Passport`, `Kafka`, `solution-defaults` table members (see `.claude/skills/solution-defaults/references/defaults-table.md`).
   - External systems by integration phrasing: "integrate with X", "publish to X", "subscribe to X", "validate against X", "call X API", "fetch from X", "webhook from X", "OAuth via X".
   - Schema / endpoint references that imply external calls: `https://*.internal.example.com/`, vendor SDK names, managed-cloud service references (Redis, MySQL, S3, BigQuery, payment processors).
   - Third-party API/service nouns in Pre-conditions, Main Flow, Business Rules, Error Handling rows (e.g., "Stripe webhook", "Twilio SMS", "Firebase Cloud Messaging").

   **Coverage rule.** Strict — every distinct external system gets one row in SRS §3.5 and one placeholder file at `docs/external-integrations/<system-slug>.md`. In-org defaults (Account/Passport, Kafka) are NOT exempt; solution-defaults pre-fills the placeholder but does NOT substitute for it.

   **Placeholder authorship (one per distinct system).** Create `docs/external-integrations/<system-slug>.md` per [`external-integration-template.md`](../../agents/_templates/_artifacts/external-integration-template.md):

   - Fill header: `System name`, `Type` (in-org / third-party / self-hosted-vendor / managed-cloud), `Owner team` + `Owner contact` (from solution-defaults when available; `TODO: <field>` + paired OQ otherwise), `Linked SRS operations` (every US/FR that touches this system).
   - Set `Adequacy: inadequate`.
   - Set `Adequacy-last-validated-by: SA <pending>` and `Adequacy-last-validated-on: <ISO-8601>` (current dispatch time; SA overwrites both during adequacy dispatch).
   - Set `Source-URL`, `Source-Version`, `Source-Last-Pulled` from solution-defaults pre-fill when available; otherwise `TODO: <field>` + paired OQ for PM to supply.
   - Leave §2 Operations, §3 Authentication, §4 NFR, §5 Failure Modes empty for SA to fill.
   - Leave §7 Open Adequacy Issues empty for SA to fill.
   - §8 Changelog gets one initial row: `<ISO-8601> | Initial placeholder created (BA Phase 1.X step 9 identification) | BA`.

   **SRS §3.5 index row authorship.** Add one row per placeholder to SRS §3.5 with: System name | Type | Linked US/FRs | `Adequacy: inadequate` | File path (e.g., `docs/external-integrations/passport.md`).

   **Signal to Orchestrator.** Phase 1.X exits with SRS Status remaining `In-Review` until SA's `external-integration-adequacy` dispatch fills every placeholder + flips every Adequacy to `adequate`. BA's `plan-update.json` `notes:` field lists every system needing SA dispatch, e.g., `notes: "SRS Status: In-Review. External-integration adequacy pending for: passport, kafka, match-host, redis. Dispatch SA in external-integration-adequacy mode."` Orchestrator dispatches SA per `.claude/rules/orchestrator-operating-rules.md` §9 Step 4. SA-returned placeholders trigger BA re-dispatch (Mode D); BA's Phase 2 step 3 verifies the adequacy gate.

   **Hard rules.**
   - **BA never sets `Adequacy: adequate`.** Only SA may, after `external-integration-adequacy` dispatch validates per-operation detail.
   - **BA never authors §2 Operations content.** That's SA's role in adequacy mode. BA only files placeholders.
   - **BA never silently skips an identified external system.** If genuinely unsure whether a mentioned system is external (e.g., "the auth service" could be in-org or a third-party gateway), file the placeholder with `Type: TODO` and an OQ asking PM to confirm.
   - **In-org defaults are NOT exempt.** Solution-defaults pre-fills; never substitutes.

10. **Design-Flow detection (mandatory when SRS has any UI surface).** Determines whether designs are provided up-front (Flow A) or must be authored by agents post-sign-off (Flow B or C). This step runs AFTER step 9 and BEFORE Phase 1.Z.

   **Detect UI presence.** Walk every US in `docs/user-stories/` and every FR in `docs/frs/`. The SRS has UI surfaces if ANY of these are true: any US has `track: fe` or `track: be+fe`; any FR row in SRS §3.3 has a non-empty `Linked Component:` with a UI component; SRS §3.4.1 Design References has any row. If NO UI surfaces detected: set SRS header `Design-Flow: N/A` and skip the rest of step 10.

   **Scan for Figma URLs.** Grep every source artifact you ingested in this dispatch — the upstream input file(s) (Mode A/B), the external source you fetched (Mode C), all files under `docs/requirements/` (Mode F), and any URL fields in `docs/user-stories/` + `docs/frs/`. Use the pattern `https?://(www\.)?figma\.com/(file|design|proto)/`. Collect every unique URL found.

   **Branch on what you found.**

   **Case 10.A — One or more Figma URLs found → Design-Flow A.**

   - Set SRS header `Design-Flow: A`.
   - Record the captured URL(s) in SRS §3.4.1 header as `Figma-File-URL:` (or list if multiple). DO NOT attempt to scan Figma yourself — that is UI/UX Designer's job in `extract` mode (pre-BA) and `map` mode (post-BA).
   - **For each captured URL, parse the `?node-id=` query parameter and record as `Figma-Design-Page-Node-ID:` paired with the URL** in §3.4.1 (per the template's "Figma source headers" sub-section). A Figma URL like `https://figma.com/file/<id>/<name>?node-id=12%3A0` carries `12:0` as the node-id (URL-decoded). Three sub-cases:
     - **URL has `?node-id=<X>`** → record `X` as `Figma-Design-Page-Node-ID`. The UI/UX Designer (when dispatched in `extract` mode) verifies the node is a PAGE; if it's a FRAME or SECTION, the Designer walks UP to the containing page and updates the SRS field with the resolution recorded in the extract artifact. This handles the common case where PMs deep-link to a specific frame they want to highlight.
     - **URL has no `?node-id=`** → halt with `NEEDS_CONTEXT`:
       ```
       Status: NEEDS_CONTEXT
       Reason: Figma URL provided in PRD does not carry a ?node-id= parameter; the design page within the Figma file cannot be determined automatically.
       Question: Which page in the Figma file contains the project's design? Options:
         [a] Name the page (e.g., "Project Design") — BA will halt, the UI/UX Designer extract mode will find the page by name and record its Node ID.
         [b] Provide the Node ID directly (e.g., "12:0") if you know it from Figma's right-click → Copy Link.
         [c] If the Figma file has only ONE non-Foundation page → operator confirms "there is only one design page"; the Designer locates it.
       Recommended: a (most operator-friendly) or b (most precise).
       Justification: A Figma file may contain brainstorm pages, old designs, design-system Foundation pages, etc. Without page-scoping, the kit's Figma-reading operations would walk all of them and either mix in irrelevant frames or miss the project design entirely.
       ```
       On re-dispatch with the operator's answer: record `Figma-Design-Page-Node-ID` accordingly (using the answer directly OR the page-name to be resolved by the Designer at `extract` time).
     - **Multiple Figma files** → each file gets its own paired `Figma-File-URL` + `Figma-Design-Page-Node-ID` row in §3.4.1. Halt with NEEDS_CONTEXT once if ANY URL lacks `?node-id=`; the operator can answer for each file in the same re-dispatch.
   - **Pre-condition for synthesis: design-extracted source corpus.** Before synthesizing US/FR for any UI surface this dispatch is the FIRST dispatch on the Figma file (no `docs/requirements/design-extracted/<figma-file-id>-*.md` exists). Halt here with `NEEDS_CONTEXT`:
     ```
     Status: NEEDS_CONTEXT
     Reason: Figma URL provided in PRD; design-extracted source corpus not yet produced.
     Question: Dispatch UI/UX Designer in `extract` mode against the Figma URL before BA synthesis?
     Recommended: yes — the design carries requirements information (screens, components, exact copy, form fields, flows) BA must read at Phase 1.X. Synthesizing US/FR without the design-extracted file produces incomplete US/FR that re-discovery later as OQs from srs-source-validator.
     Alternative: proceed without extract — only when the Figma file is empty / placeholder (set SRS §10 Changelog note to record the choice).
     ```
     On re-dispatch with `extract` complete: the design-extracted file is at `docs/requirements/design-extracted/<figma-file-id>-<ISO-date>.md`. BA's synthesis at Phase 1.X reads this file as part of the source corpus, alongside the textual PRD + any `conversational-additions/`.
   - In the `plan-update.json` `notes:` field for the eventual post-extract continuation, signal the Orchestrator: `notes: "SRS Status: In-Review. Design-Flow A. Extract complete (or skipped). After Phase 2 sign-off prep, dispatch UI/UX Designer in map mode against <url>."`
   - **SRS Status remains `In-Review`.** Phase 1.X exits without flipping to Signed-off. The Orchestrator dispatches UI/UX Designer in `map` mode per `.claude/rules/orchestrator-operating-rules.md` §9 AFTER BA Phase 2 prep work completes. The designer produces `docs/uiux/figma-mappings/v<srs-version>.md` and pins Node IDs in §3.4.1. BA's Phase 2 step 3.5 verifies the mapping qualifies before sign-off.
   - Do NOT file OQs for unmapped surfaces here — that's the mapping artifact's job. BA Phase 2 step 3.5 will read the mapping artifact and surface its gaps as OQs only if the mapping returned `Mapping-Status: gaps`.

   **Case 10.B — No Figma URL found, UI surfaces exist → halt with NEEDS_CONTEXT (Flow B vs C).**

   - SRS header `Design-Flow:` stays unset for now.
   - **HALT and return `NEEDS_CONTEXT`** to the Orchestrator. The user must pick Flow B or Flow C before sign-off can proceed. Do NOT silently default — the choice has downstream consequences for FE dispatch timing and the design lifecycle's human-in-the-loop steps.

   ```
   Status: NEEDS_CONTEXT
   Reason: SRS has UI surfaces but no Figma URL was provided. Design-Flow must be chosen before sign-off.
   Question: How should designs be produced for this project?
   Options:
     [b] Design-Flow B — agent designs fully. After sign-off, UI/UX Designer dispatches in `create` mode and authors every UI surface in Figma. Designated Design Approver confirms each. Faster; relies on agent design judgment.
     [c] Design-Flow C — agent designs initial; human modifies in Figma. After sign-off, UI/UX Designer creates initial drafts, human edits in Figma, `incorporate` mode absorbs the edits. Slower; preserves human design authority on every surface.
   Recommended: c
   Confidence: medium
   Justification: When no Figma exists, the safest pattern is hybrid — agent does the structural draft, human polishes for brand/affordance/accessibility. Choose [b] only when speed dominates and the agent's design judgment is acceptable for this surface.
   ```

   On re-dispatch with the user's choice: set SRS header `Design-Flow: B` or `Design-Flow: C`. Continue to Phase 1.Z and Phase 2 — sign-off can proceed normally; the design lifecycle is post-sign-off per `.claude/rules/parallel-execution.md` §4.

   **Case 10.C — No UI surfaces.**

   Set SRS header `Design-Flow: N/A`. Skip the rest of step 10. Phase 2 sign-off skips the design-mapping gate.

   **Hard rules for step 10.**
   - **No Figma URL = sign-off blocked until user picks Flow B or C.** Don't auto-default.
   - **Design-Flow A means BA never calls `create` mode.** Creation is reserved for Flow B/C user-confirmed dispatches. If `map` returns `Mapping-Status: gaps`, the resolution is PM-side (add screens to Figma OR reduce SRS scope) — NOT auto-`create`.
   - **The `Design-Flow:` header value is immutable per SRS version.** Changing it (e.g., partway through implementation the user wants Flow C instead of B) is an iteration trigger; Phase 1.Z handles it.

10b. **Design-Guideline selection (mandatory when SRS has any UI surface).** Runs immediately after step 10 — the two header fields (`Design-Flow:`, `Design-Guideline:`) are paired and set in the same Phase 1.X pass. Determines which Foundation preset the UI/UX Designer applies in `create` / `import` / `revise` / `incorporate` modes; downstream-load-bearing for FE Dev's design contract and QA-Author's visual spec.

   **Skip when `Design-Flow: N/A`.** No UI surface → set `Design-Guideline: N/A` and exit this step.

   **Enumerate available presets.** List the immediate child folders under `.claude/skills/design-system-author/references/presets/` excluding `_template/` and `README.md`. Each child folder is a valid preset slug. Read each preset's `preset.md` § "When to use" to know what the preset is for.

   **Branch on what you find.**

   **Case 10b.A — SRS source mentioned a preset slug → use it.** Grep the upstream artifact(s) you ingested for a `Design-Guideline:`, `Design Preset:`, `Foundation:` or similar declaration. If a value matches an available preset slug exactly → set SRS header `Design-Guideline: <slug>` and proceed (no NEEDS_CONTEXT needed).

   **Case 10b.B — Brand-default match found → use it.** Some upstream contexts imply a default without naming it (e.g., the SRS is for an admin-tooling project → `modern-saas-admin` is the natural default). When the project description matches a preset's `preset.md` § "When to use" unambiguously AND there's no contradicting signal, set the header to the matching preset slug. Document the match reasoning in `## Changelog` so the choice is auditable.

   **Case 10b.C — Ambiguous or no signal → halt with NEEDS_CONTEXT.**

   ```
   Status: NEEDS_CONTEXT
   Reason: SRS has UI surfaces; Design-Guideline preset must be chosen.
   Question: Which design preset should the UI/UX Designer apply as the Foundation?
   Options:
     [<slug-1>] <preset-1 display name> — <preset.md § When to use, one-line summary>
     [<slug-2>] <preset-2 display name> — <one-line>
     [none] No preset — Designer authors Foundation from design-system-author SKILL.md defaults. Use ONLY when no preset is a reasonable starting point AND the project has bandwidth to author tokens from scratch.
   Recommended: <slug closest to the project context based on SRS §3.1 domain + §3.5 integration set>
   Confidence: <high | medium | low>
   Justification: <one-line tying the recommendation to a specific SRS signal>
   ```

   Build the options list dynamically from the enumeration above — do NOT hardcode preset slugs. The list of available presets evolves over time (new presets added; deprecated ones removed); the dispatch must reflect on-disk state.

   On re-dispatch with the user's choice: set SRS header `Design-Guideline: <slug>` (or `none`). Continue to Phase 1.Z.

   **Hard rules for step 10b.**

   - **Guideline selection is paired with Flow selection.** When step 10 halts on Flow B/C choice and step 10b would also halt, batch both questions in a single NEEDS_CONTEXT to minimize round-trips.
   - **`Design-Guideline:` is immutable per SRS version.** Token values flow downstream to FE Dev / QA-Author / DevOps bundle-grep; changing the guideline mid-project is an iteration trigger (Phase 1.Z handles it) and requires a Foundation-page refactor in Figma.
   - **`none` is the explicit opt-out.** A blank or `TBD` value at sign-off blocks Phase 2 sign-off — be deliberate. Picking `none` is fine when there's a reason; leaving the field unset is not.
   - **Preset existence at the chosen slug is required at sign-off.** If the user picks a slug that doesn't exist on disk, Phase 2 step 3.5 (mapping gate sibling) refuses sign-off until either the preset is created OR the user picks an existing slug.

10c. **Frontend-Framework selection (mandatory when SRS has frontend source or UI surfaces).** Runs after `Design-Flow:` / `Design-Guideline:` selection. This field is the source of truth FE Dev uses to pick the matching `fe-framework-coding-standard` reference; FE Dev must not infer a different framework locally from preference or ad-hoc package discovery.

   **Supported canonical values.** `React Native`, `ReactJS`, `Flutter`, `Vue.js`, `Angular`, `Next.js`, `multiple`, `N/A`.

   **Skip when there is no frontend.** If step 10 detected no UI surfaces AND §3.4.5 has no frontend root/app, set SRS header `Frontend-Framework: N/A` and exit this step.

   **Scan sources.**
   - For authored / greenfield modes (A/B/C/D/F), grep the upstream artifacts you ingested for explicit framework declarations: `Frontend-Framework:`, `frontend framework`, `FE framework`, `build with <framework>`, `React Native`, `ReactJS`, `React`, `Flutter`, `Vue`, `Angular`, `Next.js`, `NextJS`, `Expo`.
   - For brownfield Mode E (`Source: extracted`), read the Codebase Archaeologist's `## Frontend Framework Evidence` section when present, the Service / Module Inventory `Stack` column, `docs/architecture.md` C2/C3 container stack fields, and any manifest/build evidence Mode E captured (`package.json`, `next.config.*`, `angular.json`, `pubspec.yaml`, Expo config, `vite.config.*`, `.vue`, `.dart`, `ios/`, `android/`).
   - Normalize synonyms to canonical values: `NextJS` / `next` -> `Next.js`; `React` + `react-dom` without Next.js -> `ReactJS`; `Expo` / `react-native` -> `React Native`; `Vue` -> `Vue.js`; `@angular/*` -> `Angular`; `flutter` -> `Flutter`.

   **Branch on the evidence.**

   - **Single supported framework found.** Set `Frontend-Framework: <canonical>`. Ensure every §3.4.2 `Framework / Renderer` UI row for frontend surfaces uses the same canonical value unless it is a non-FE renderer explicitly outside FE Dev scope. Ensure every §3.4.5 frontend row uses the same `Framework / Runtime` value.
   - **Multiple supported frameworks found with clear app/surface boundaries.** Set `Frontend-Framework: multiple`. In §3.4.2, each UI surface row must name the correct canonical framework. In §3.4.5, each frontend app row must name the correct canonical framework in `Framework / Runtime`. Document the boundary in the SRS Changelog, e.g. `frontend/web = Next.js; frontend/mobile = React Native`.
   - **Multiple framework signals in one app boundary.** Halt with `NEEDS_CONTEXT`; do not guess whether it is migration residue, build tooling, or an actual multi-framework app.
   - **No supported framework found in authored / greenfield modes.** Halt with `NEEDS_CONTEXT`; the user must choose the frontend framework before sign-off. Do not default.
   - **No supported framework found in brownfield Mode E.** Halt with `NEEDS_CONTEXT` and cite the files/paths inspected. Brownfield must either declare an unsupported framework explicitly for a future skill addition/ADR or identify the actual supported framework before governance sign-off.
   - **Unsupported framework found.** Add an OQ with category `frontend-framework-unsupported` and block sign-off until either (a) the project chooses one supported framework, or (b) the kit gains a matching FE coding-standard skill and the header schema is extended.

   **NEEDS_CONTEXT prompt for greenfield / authored ambiguity.**

   ```
   Status: NEEDS_CONTEXT
   Reason: SRS has frontend/UI scope but no supported Frontend-Framework is declared.
   Question: Which framework should FE Dev use for this project?
   Options:
     [react-native] React Native — mobile app surfaces, Expo or native iOS/Android bridge.
     [reactjs] ReactJS — client-rendered web app without Next.js app framework.
     [flutter] Flutter — Dart widget-based mobile/web app.
     [vuejs] Vue.js — Vue SFC app.
     [angular] Angular — Angular CLI / @angular app.
     [nextjs] Next.js — React app using Next.js routing/rendering.
   Recommended: <one option based on explicit SRS platform/surface signals, or "no safe recommendation">
   Confidence: <high | medium | low>
   Justification: FE Dev skill selection, UI testing conventions, source layout, and implementation patterns depend on this field.
   ```

   On re-dispatch with the user's choice: set `Frontend-Framework: <canonical>`, update §3.4.2 / §3.4.5 as needed, and continue.

   **Hard rules for step 10c.**
   - **The SRS, not FE Dev, chooses the framework.** FE Dev reads this field and selects the matching skill reference. Source-code detection at implementation time is only a consistency check.
   - **`Frontend-Framework:` is immutable per SRS version.** Changing it after sign-off is an iteration trigger and usually an architecture/design/test migration.
   - **`multiple` is allowed only with explicit per-surface/per-app mapping.** A bare `multiple` header without §3.4.2 and §3.4.5 rows blocks sign-off.

10d. **Backend-Track and Backend-Framework selection (mandatory when SRS has backend source or server-side operations).** Runs after frontend framework selection. These fields are the source of truth BE Dev uses to pick the matching `be-framework-coding-standard` reference; BE Dev must not infer a different backend stack locally from preference or ad-hoc manifest discovery.

   **Supported Backend-Track values.** `backend-web`, `backend-service`, `multiple`, `N/A`.
   - `backend-web` = web-facing HTTP API, public/internal REST API, BFF, API gateway, or backend directly serving frontend/web clients.
   - `backend-service` = microservice, domain service, worker, scheduler, event consumer, gRPC/internal service, or service-mesh runtime component.

   **Supported Backend-Framework values.** `TypeScript with Express`, `TypeScript with NestJS`, `Python with FastAPI`, `Java with Spring Boot`, `.NET Core C#`, `Pure Golang`, `Java Core`, `Golang with Gin`, `Golang with Fiber`, `Golang with Echo`, `Golang with Kratos`, `multiple`, `N/A`.

   **Skip when there is no backend.** If the SRS has no server-side operation, no API/message surface, and §3.4.5 has no backend root/service, set `Backend-Track: N/A` and `Backend-Framework: N/A`, then exit this step.

   **Scan sources.**
   - For authored / greenfield modes (A/B/C/D/F), grep upstream artifacts for explicit backend declarations: `Backend-Track:`, `Backend-Framework:`, `backend web`, `BFF`, `API gateway`, `microservice`, `worker`, `consumer`, `scheduler`, `Express`, `NestJS`, `FastAPI`, `Spring Boot`, `.NET Core`, `C#`, `Golang`, `Gin`, `Fiber`, `Echo`, `Kratos`, `Java Core`.
   - For brownfield Mode E (`Source: extracted`), read the Codebase Archaeologist's `## Backend Framework Evidence` section when present, the Service / Module Inventory `Stack` column, `docs/architecture.md` C2/C3 container stack fields, public API/event/worker evidence, and manifests/build files captured by Mode E.
   - Normalize synonyms to canonical values:
     - `express` + TypeScript/tsconfig without Nest -> `TypeScript with Express`.
     - `@nestjs/*`, `nest-cli.json`, Nest modules/controllers/providers -> `TypeScript with NestJS`.
     - `fastapi`, `uvicorn`, `FastAPI()` -> `Python with FastAPI`.
     - `spring-boot-starter`, `@SpringBootApplication` -> `Java with Spring Boot`.
     - `.csproj` / `Program.cs` / ASP.NET Core / `Microsoft.AspNetCore` -> `.NET Core C#`.
     - Go `net/http` / `http.ServeMux` with no Gin/Fiber/Echo/Kratos -> `Pure Golang`.
     - Java runtime without Spring Boot framework -> `Java Core`.
     - `github.com/gin-gonic/gin` -> `Golang with Gin`.
     - `github.com/gofiber/fiber` -> `Golang with Fiber`.
     - `github.com/labstack/echo` -> `Golang with Echo`.
     - `github.com/go-kratos/kratos` -> `Golang with Kratos`.

   **Branch on track evidence.**

   - **Single backend track found.** Set `Backend-Track: <backend-web | backend-service>`. Ensure every backend row in §3.4.5 uses the same `Backend Track` value unless a separate service boundary clearly uses a different backend role.
   - **Multiple backend tracks found with clear service boundaries.** Set `Backend-Track: multiple`. In §3.4.5, every backend row must name the correct `Backend Track`. Document the boundary in the SRS Changelog, e.g. `backend/api = backend-web; backend/sync-worker = backend-service`.
   - **Conflicting track signals in one backend boundary.** Halt with `NEEDS_CONTEXT`; do not guess whether the code is a BFF, domain service, migration residue, or mixed service.

   **Branch on framework evidence.**

   - **Single supported framework found.** Set `Backend-Framework: <canonical>`. Ensure every §3.4.5 backend row uses the same `Framework / Runtime` value unless a separate service boundary clearly uses a different framework.
   - **Multiple supported frameworks found with clear service boundaries.** Set `Backend-Framework: multiple`. In §3.4.5, each backend service row must name the correct canonical framework. Document the boundary in the SRS Changelog, e.g. `backend/api = TypeScript with NestJS; backend/ingester = Golang with Kratos`.
   - **Multiple framework signals in one backend boundary.** Halt with `NEEDS_CONTEXT`; do not guess whether it is migration residue, shared tooling, or an actual multi-framework service.
   - **No supported framework found in authored / greenfield modes.** Halt with `NEEDS_CONTEXT`; the user must choose the backend framework before sign-off. Do not default.
   - **No supported framework found in brownfield Mode E.** Halt with `NEEDS_CONTEXT` and cite the files/paths inspected. Brownfield must either declare an unsupported framework explicitly for a future skill addition/ADR or identify the actual supported framework before governance sign-off.
   - **Unsupported framework found.** Add an OQ with category `backend-framework-unsupported` and block sign-off until either (a) the project chooses one supported framework, or (b) the kit gains a matching BE coding-standard reference and the header schema is extended.

   **NEEDS_CONTEXT prompt for greenfield / authored ambiguity.**

   ```
   Status: NEEDS_CONTEXT
   Reason: SRS has backend/server-side scope but Backend-Track and/or Backend-Framework is not declared.
   Question: Which backend track and framework should BE Dev use for this project?
   Backend-Track Options:
     [backend-web] Backend web — web-facing API, BFF, API gateway, or backend directly serving frontend/web clients.
     [backend-service] Backend service — microservice, worker, scheduler, consumer, gRPC/internal domain service.
   Backend-Framework Options:
     [typescript-express] TypeScript with Express
     [typescript-nestjs] TypeScript with NestJS
     [python-fastapi] Python with FastAPI
     [java-spring-boot] Java with Spring Boot
     [dotnet-core-csharp] .NET Core C#
     [pure-golang] Pure Golang
     [java-core] Java Core
     [golang-gin] Golang with Gin
     [golang-fiber] Golang with Fiber
     [golang-echo] Golang with Echo
     [golang-kratos] Golang with Kratos
   Recommended: <track + framework based on explicit SRS API/service signals, or "no safe recommendation">
   Confidence: <high | medium | low>
   Justification: BE Dev skill selection, source layout, API contracts, runtime lifecycle, tests, and deployment expectations depend on these fields.
   ```

   On re-dispatch with the user's choice: set `Backend-Track: <canonical>`, set `Backend-Framework: <canonical>`, update §3.4.5 backend rows as needed, and continue.

   **Hard rules for step 10d.**
   - **The SRS, not BE Dev, chooses the backend track and framework.** BE Dev reads these fields and selects the matching skill reference. Source-code detection at implementation time is only a consistency check.
   - **`Backend-Track:` and `Backend-Framework:` are immutable per SRS version.** Changing either after sign-off is an iteration trigger and usually an architecture/test/deploy migration.
   - **`multiple` is allowed only with explicit per-service mapping.** A bare `multiple` header without §3.4.5 backend rows blocks sign-off.

### Phase 1.Z — Delta Detection (Iteration Trigger)

After Phase 1.X completes, if the repo carries evidence of a previously-signed-off SRS, this phase decides whether the current dispatch is a **first-time ingest** (no prior sign-off) or an **iteration** (SRS content has changed since a prior `Signed-off` state).

#### Detection

Run BOTH checks:

1. **Version field bump.** Compare `Version:` in the incoming SRS header against the most-recent `Signed-off` entry in SRS §10 Changelog. If the version bumped (e.g., `1.0` → `1.1` or `1.0` → `2.0`), this is an iteration trigger.
2. **Source-Hash mismatch (Mode C only).** When `Source: <external-url>` is non-`inline`, compare current `Source-Hash` against the freshly-pulled content hash. Mismatch is an iteration trigger.

Either trigger fires Phase 1.Z's halt.

#### Manual confirmation gate

When an iteration trigger fires, **halt and return `NEEDS_CONTEXT`** to the Orchestrator. Do NOT proceed silently — even if the version bump or hash mismatch is obvious. The user must confirm.

```
Status: NEEDS_CONTEXT
Reason: SRS changed since last Signed-off. This is an iteration trigger.
Question: Detected new SRS version <new-version> (was <old-version>) [or: Source-Hash mismatch on <source-url>]. Confirm if you want to update the project's requirements to the new version.
Options:
  [a] Yes, proceed with iteration — BA produces a diff, magnitude check runs, then surgical re-dispatch follows.
  [b] No, keep current state — discard the incoming SRS content; project stays at <old-version>.
  [c] Show me the diff first, then ask again — BA produces the diff at `docs/srs-diffs/<old>-to-<new>.md` without committing any other change; user reviews before deciding.
Recommended: c
Confidence: high
```

#### After user picks

- **Option [a] — proceed:** Phase 1.Z continues into "Diff Production" below, then Phase 2 sign-off. When a diff is produced, the Orchestrator later re-dispatches BA for iteration planning — load the [`ba-iteration-planning`](../ba-iteration-planning/SKILL.md) skill for Phase 4.
- **Option [b] — keep current:** Revert all Phase 1 changes in your worktree, file an open-issue (`State: deferred`) noting that an incoming SRS version was rejected by user, halt. The project stays at its current `Signed-off` state.
- **Option [c] — diff first:** Produce only `docs/srs-diffs/<old>-to-<new>.md` (see Diff Production below). Halt with the diff as the only output. Re-dispatch with `[a]` or `[b]` after the user reviews.

#### Diff Production (Option [a] or [c])

Produce `docs/srs-diffs/<old-version>-to-<new-version>.md` with **field-level** granularity (not line-level — git already gives you line-level):

```markdown
# SRS diff — v1.0 → v1.1

- Generated: <ISO-8601>
- From: SRS v1.0 (Signed-off <date>)
- To: SRS v1.1 (incoming, Status: In-Review)

## User Stories (SRS §3.2)

### Added
- US-NNN: <Title> — <one-line Description>

### Modified
- US-NNN: <fields changed — Pre-conditions, Main Flow steps, Business Rules, Post-conditions>
  - BR-2 changed: <old text> → <new text>
  - PC-1 added
  - MF-3 wording adjusted (semantically unchanged)

### Removed
- US-NNN: <Title> — <reason from SRS §10 Changelog if available>

### Unchanged
- N user stories (US-IDs: ...)

## FRS (SRS §3.3)

(Same structure: Added / Modified / Removed / Unchanged)

## NRS (SRS §4)

- <metric>: <old target> → <new target> (delta: <ratio>, e.g., "P95 latency: 1000ms → 200ms — 5× tighter")

## Security & Compliance (SRS §4.1)

- Sub-categories added / modified / removed

## Domain Specification (SRS §3.1)

- Changes to Bounded Context / Aggregate Root / Entities / Value Objects / Ubiquitous Language Mapping
- (Any change here is a domain rewrite — magnitude check will flag it)

## Cross-impact summary

- Tasks in master plan affected (count + IDs)
- Currently in-flight tasks affected (status `in-progress` or `ready-for-deploy`)
- Currently `done` tasks affected
```

Don't write more than this. Specifically, do NOT propose how to handle each delta — that's Phase 4's job.

### Phase 2 — Sign-off Gate

1. Identify gaps, ambiguities, conflicts across the augmented SRS.
2. **Acceptance Scenarios cross-consistency check (automated procedure).** For each US in `docs/user-stories/` and each FR in `docs/frs/`, walk the 5-point cross-consistency rule (per `.claude/skills/user-story-author/` § Cross-consistency rule):

   1. **Scenario presence:** every US and FR has a `## Acceptance Scenarios` section with at least one happy-path scenario in Given/When/Then form. Missing = mandatory-field gap → file OQ in SRS §8 with category `acceptance-scenarios-missing`.
   2. **Main Flow ↔ Scenario coverage:** every Main Flow step is exercised by at least one Acceptance Scenario's `When` + `Then` chain. Main Flow steps without scenario coverage = inconsistency → file OQ with category `scenario-coverage-gap`.
   3. **Business Rules ↔ Scenario coverage:** every Business Rule either carries a `Test:` sub-field OR is exercised by at least one Acceptance Scenario. Rules without coverage = inconsistency → file OQ.
   4. **Business Rules ↔ Scenario contradictions:** for each Business Rule, verify that no scenario's `Then` clause contradicts the rule statement (e.g., Rule says "viewer count monotonic in window"; a scenario says `Then` count decremented mid-window = contradiction). Contradiction = inconsistency → file OQ with category `scenario-rule-contradiction`.
   5. **Pre-conditions / Post-conditions ↔ Scenario coverage:** every US Pre-condition appears as a `Given` line in at least one scenario; every US Post-condition appears as a `Then` line in at least one happy-path scenario. Uncovered = inconsistency → file OQ.

   This check is procedural — BA walks through the 5 points for each US/FR. The kit's hook `acceptance-scenarios-validator.cjs` enforces point 1 (presence) deterministically; points 2–5 are LLM-level checks BA performs at Phase 2 time.

3. **External-integration adequacy verification (strict gate).** Per CLAUDE.md §10 hard rule, every external system the product touches must reach `Adequacy: adequate` before SRS signs off. Walk every row in SRS §3.5 and the paired file at `docs/external-integrations/<system-slug>.md`:

   1. **Pairing check.** Every SRS §3.5 row has a file at the named path; every file under `docs/external-integrations/` has a §3.5 row. Orphans → file OQ with category `external-integration-pairing-orphan`.
   2. **Adequacy check.** Read each integration file's `Adequacy:` header field. The only sign-off-allowable value is `adequate`. Any `inadequate` or `deferred` value blocks sign-off:
      - `inadequate` → walk the file's §7 Open Adequacy Issues table; for each row, file a SRS §8 OQ with category `external-integration-adequacy-gap` citing the system + operation + missing field + owner. Status remains `In-Review`.
      - `deferred` → file a SRS §8 OQ with category `external-integration-adequacy-deferred` citing the system + reason + target phase. Status remains `In-Review`. (Strict gate means deferred does NOT pass sign-off; the field exists for tracking only.)
      - missing `Adequacy:` field entirely → file a SRS §8 OQ with category `external-integration-adequacy-missing-field` and treat as `inadequate`.
   3. **Adequacy-validated-by check.** Every `Adequacy: adequate` file must carry `Adequacy-last-validated-by: SA <name>` and `Adequacy-last-validated-on: <ISO-8601 ≤ 30 days old>`. Older than 30 days → re-dispatch SA in `external-integration-adequacy` mode before sign-off (stale validation). File OQ with category `external-integration-adequacy-stale` citing the system.

   This check is procedural — BA reads each integration file and applies the three sub-checks. The kit's hook `external-integration-adequacy-validator.cjs` enforces the Adequacy gate deterministically at SRS Write time (refuses Status=Signed-off when any integration is non-adequate); Phase 2 step 3 is the LLM-level audit complement.

3.5. **Design-Flow gate (strict — for Flow A only).** Per CLAUDE.md §10 hard rule, when SRS header has `Design-Flow: A`, the Figma-SRS mapping must qualify before sign-off:

   1. **Mapping artifact present.** `docs/uiux/figma-mappings/v<srs-version>.md` exists. Missing → file OQ with category `design-flow-mapping-missing` and signal Orchestrator to dispatch UI/UX Designer in `map` mode.
   2. **Mapping-Status check.** Read the artifact's `Mapping-Status:` header field. Sign-off-allowable values: `qualified` or `orphans-only`. Any `gaps` value blocks sign-off:
      - `gaps` → walk the artifact's "SRS surfaces without Figma match (BLOCKING)" section; for each row, file a SRS §8 OQ with category `design-flow-gap-surface` citing the US/FR + the resolution options (PM adds the screen to Figma, OR SRS removes the requirement). Status remains `In-Review`.
      - `orphans-only` → walk the artifact's "Figma frames without SRS match" section; for each orphan, file a SRS §8 OQ with category `design-flow-orphan` for PM disposition. Status MAY proceed to Signed-off if PM disposition resolves each orphan (accept as out-of-scope OR add as new US).
   3. **Fuzzy-match confirmation.** Read the artifact's "Decisions awaiting human confirmation" section. For each fuzzy match awaiting confirmation: file a SRS §8 OQ with category `design-flow-fuzzy-match-unconfirmed`. Status remains `In-Review` until each is confirmed by the Approver.
   4. **Variant-coverage gaps (NON-blocking).** Read "SRS surfaces with partial variant coverage" section. File OQs with category `design-flow-variant-gap` per US/FR. These are tracked but do NOT block sign-off — the FE dispatch handles variant gaps at task time.

   This check is procedural — BA reads the mapping artifact and applies the four sub-checks. Step 3.5 is SKIPPED when `Design-Flow:` is `B`, `C`, or `N/A`. For Flow B/C, the post-sign-off design lifecycle (`.claude/rules/parallel-execution.md` §4) handles design qualification.

3.6. **Design-Guideline preset gate (strict — runs whenever SRS has any UI surface).** Per CLAUDE.md §10 hard rule, when SRS header `Design-Guideline:` is set to a preset slug:

   1. **Preset existence.** Verify `.claude/skills/design-system-author/references/presets/<slug>/` exists on disk AND contains all required files (`preset.md`, `tokens.json`, `typography.md`, `components.md`, `layout-grid.md`). Missing folder OR missing required file → file OQ with category `design-guideline-preset-missing` and block sign-off; the user must either (a) create the preset OR (b) change `Design-Guideline:` to an existing slug OR (c) set `none` (opt-out).

   2. **Header completeness.** If `Design-Guideline:` is `TBD` or empty AND SRS has UI surfaces → file OQ with category `design-guideline-undeclared` and block sign-off. Phase 1.X step 10b should have set this; reaching Phase 2 with the field unset signals a Phase 1.X step-10b failure that the user must resolve.

   3. **`none` opt-out.** Value `none` is permitted (Designer authors Foundation from SKILL.md defaults). Document the rationale in `## Changelog` so the choice is auditable. No OQ filed.

   This check is procedural — Step 3.6 is SKIPPED when `Design-Guideline:` is `N/A` (no UI surface). The kit does not currently ship a write-time hook for this gate; the Phase 2 BA check is the authoritative gate.

3.7. **Frontend-Framework gate (strict — runs whenever SRS has frontend source or UI surfaces).** Per the SRS header contract, FE Dev must be able to choose its framework skill from SRS without guessing:

   1. **Header completeness.** If `Frontend-Framework:` is `TBD`, empty, or missing AND the SRS has UI surfaces or §3.4.5 frontend rows, file OQ with category `frontend-framework-undeclared` and block sign-off. Phase 1.X step 10c should have set this.
   2. **Supported value check.** Allowed values are `React Native`, `ReactJS`, `Flutter`, `Vue.js`, `Angular`, `Next.js`, `multiple`, `N/A`. Any other value files an OQ with category `frontend-framework-unsupported` and blocks sign-off until the schema/skill set is extended or a supported framework is chosen.
   3. **`N/A` consistency.** If `Frontend-Framework: N/A` but SRS has UI surfaces or §3.4.5 frontend rows, file OQ category `frontend-framework-na-conflict`.
   4. **Single-framework consistency.** If the header is one supported framework, verify §3.4.2 frontend UI rows and §3.4.5 frontend rows use that canonical framework where applicable. Conflicting rows become OQs category `frontend-framework-row-mismatch`.
   5. **Multiple-framework consistency.** If `Frontend-Framework: multiple`, verify every frontend UI row in §3.4.2 and every frontend app row in §3.4.5 names one supported canonical framework. Missing or unsupported row values become OQs category `frontend-framework-multiple-incomplete`.

   This check is procedural. The kit does not currently ship a write-time hook for this gate; BA Phase 2 is authoritative.

4. Write each gap, ambiguity, conflict, or cross-consistency inconsistency as a unique entry under `## Open Questions` (`OQ-NNN`, …) with explicit category tag where applicable.
5. If `## Open Questions` non-empty → Status = `In-Review`. Stop.
6. If empty (or all moved to `## Resolved Questions`) → set Status to `Ready-for-Sign-off`, update `Last-Updated`. **Leave `Signed-off-by:` empty** — BA cannot self-sign-off per CLAUDE.md §2 + §10. The Orchestrator dispatches `srs-validator` next (Orchestrator §9). The validator independently verifies coverage against `docs/requirements/` and either flips Status → `Signed-off` (`qualified` verdict) or appends new OQs and reverts Status → `In-Review` (`unqualified` verdict). BA's `plan-update.json` `notes:` field signals: `notes: "SRS Status: Ready-for-Sign-off. Dispatch srs-source-validator (first sign-off gate). On its qualified verdict, srs-feasibility-validator (second gate) follows automatically."`
