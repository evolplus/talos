---
name: intent-archaeology
description: "Trace the why behind a code-observable fact through git history, PR descriptions, and linked tickets before escalating it to a human. Use at brownfield Stage 1b, and whenever SA brownfield extract or BA Mode E is about to tag an item Confidence: inferred. Produces docs/archaeology-reports/<slug>.intent.md — the evidence that shrinks the Stage 4 human confirmation gate."
agents: [codebase-archaeologist, sa, ba]
sdlc_phase: planning
owner: Platform Eng
status: active
---

# Intent Archaeology (brownfield Stage 1b)

## Use

Use when about to write `Confidence: inferred` or `TODO: <team must confirm>` against something observable in code but unexplained by it.

`.claude/rules/brownfield-onboarding.md` §12 names three things code cannot reveal alone — value, intent-vs-accident, and tribal knowledge. Two of the three are frequently in the commit that introduced the line, the PR that merged it, or the ticket it referenced. The code is silent; the history usually is not.

This matters for one reason: the Stage 4 human gate is the binding constraint on brownfield adoption. It consumes senior attention and does not scale with codebase size. Every item resolved here is an item nobody has to be interviewed about, and it converts the expensive question ("explain this to us") into a cheap one ("does this reason still hold").

## Inputs

- A probe list: items about to be tagged `inferred`, each with a file:line and a searchable literal
- Full git history (not a shallow clone)
- When reachable: the PR/MR host and the issue tracker

## Outputs

- `docs/archaeology-reports/<slug>.intent.md` — one row per probe: item, file:line, probe literal, verdict, verbatim evidence, reference, date, commands run

## Procedure

1. **Build the probe list.** Probe only what would otherwise reach a human: magic constants (timeouts, retry counts, page sizes, thresholds), non-obvious conditional branches, retry/fallback/compensation paths, hard-coded exceptions and allow-lists, idempotency and dedup keys, and public surfaces whose business value is not self-evident.
2. **Verify history depth.** `git rev-parse --is-shallow-repository`. A shallow clone returns "not found" for everything — record the limitation in the header rather than emitting a page of false negatives.
3. **Trace the literal**, in order until something lands: `git log -S'<literal>' --oneline --all -- <path>` (the highest-yield single command in brownfield work); `git log -L <start>,<end>:<path>`; `git blame -L` → `git show --stat --format=full <SHA>`, reading the **full commit body**, not the subject. Use `--follow` where the file has moved; a rename otherwise truncates the trail.
4. **Widen to merge context.** `git log --merges --ancestry-path <SHA>..HEAD | head -1` yields the merge commit and usually the PR number. Fetch the PR description and linked ticket when the host is reachable — the PR is where a reviewer asked "why this way" and someone answered.
5. **Classify the verdict.**

| Verdict | Meaning | Effect on the Stage 4 gate |
|---|---|---|
| `documented` | a commit body, PR, or ticket states the reason | item becomes "confirm this still holds" |
| `circumstantial` | strongly implied — `fix`/`hotfix` typing, an incident reference, an adjacent revert | item reaches the human with a hypothesis attached |
| `accidental` | positive evidence of accident (step 6) | item is proposed for `deprecated`, not `confirmed` |
| `not-found` | history silent or unavailable | escalates unchanged; this is the honest outcome and it is common |

6. **Look for accident markers** — the positive signals that let a team prune rather than enshrine: introduced in a `fix`/`hotfix`/`revert` commit with no test and no follow-up; an adjacent `TODO`/`HACK`/`XXX`/`WORKAROUND` comment, especially naming a system that no longer exists; untouched since introduction while neighbours moved on; an introducing commit that references an incident; a value changed repeatedly in quick succession and then never again — the signature of tuning under pressure, not a chosen SLA.
7. **Record verbatim** with the reference (`<SHA>`, PR number, ticket ID, date). Do not paraphrase into a polished value statement.
8. **Write the report**, including `not-found` rows — a probed-and-silent item is evidence that the interview question is real, which is worth knowing before the interview is booked.

## Hard Rules

- A commit message is not a product owner. `documented` lowers the cost of the human question; it never replaces it. The common failure is a reason that was true in 2021 and quietly stopped being true. Never flip `Source: extracted` to `confirmed` on history evidence alone.
- Verbatim or nothing. A summarized "why" is an inference wearing evidence's clothes, and downstream it is indistinguishable from fabrication.
- `not-found` is a result, not a failure. Suppressing silent probes makes the gate look smaller than it is.
- Never write to the codebase or to kit-canonical artifacts. This skill reads history and writes one audit-trail report.
- Probe selectively. Running this across a whole codebase burns budget on questions nobody was going to ask.
