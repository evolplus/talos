# Skills

Skills are reusable knowledge libraries that agents consult during their phase. They are **not** agents and not workflows — they are reference + procedure docs that capture the kind of advice you'd want a senior engineer in the same role to give every time.

The workflow contract lives in `CLAUDE.md` and `.claude/rules/`. Skills layer beneath that: how to do the specific kinds of work each role does well.

## When to add a skill

Add a skill when:

- The same advice would apply across many projects in the same role
- The advice is too detailed for an agent template (which should stay terse)
- A new contributor would otherwise need to ask a senior engineer the same question repeatedly

Don't add a skill when:

- The advice is project-specific (it belongs in SRS or architecture)
- The advice is workflow-level (it belongs in `CLAUDE.md` or `.claude/rules/`)
- The advice is stack-specific *and* the kit hasn't standardized on a stack (defer until the project decides)

## Skill structure

Every skill is a folder under `.claude/skills/<skill-name>/`:

```
<skill-name>/
├── SKILL.md                # frontmatter + procedure + hard rules
└── references/             # (optional) longer examples / templates / regime-specific guides
    └── *.md
```

`SKILL.md` is the entry point. References are pulled in only when the skill needs them — keeps SKILL.md scannable.

## Frontmatter schema

```yaml
---
name: skill-name                          # required, kebab-case, must match folder name
description: One-line trigger description used by Claude Code skill auto-discovery and humans browsing the registry.
agents: [ba, sa, tl, qa-author, be-dev, fe-dev, devops, qa-exec, ui-ux-designer]   # required — which agents consult this skill
sdlc_phase: planning | implementation | qa | deploy | post-release | exploration   # required
owner: <team or person>                   # required for accountability when content goes stale
status: active | deprecated               # required
supersedes: <skill-name>                  # optional, when a skill replaces an older one
---
```

Required fields: `name`, `description`, `agents`, `sdlc_phase`, `owner`, `status`. Other fields are ignored — extend the schema in this README, not silently in your skill file.

## Skill body — recommended sections

```markdown
# <Skill Title>

## When to use
<one paragraph: which agent role, which moment in the SDLC, what trigger>

## Inputs and outputs
<what the agent should have on hand before consulting the skill;
what artifact the skill helps the agent produce>

## Procedure
<numbered steps. Concrete, not abstract. Reference templates / examples in references/>

## Hard rules
<2–6 absolute do/don'ts. Match the kit's tone — terse, justified.>

## References
<links to references/*.md, agent templates, CLAUDE.md sections, and external sources>
```

## Discovery

Two ways an agent finds the right skill:

1. **Registry lookup** — `.claude/skills/registry.md` maps role → skills the role typically consults. Agent templates point here.
2. **Native skill discovery** — Claude Code reads each skill's `description` field and offers it when the description matches the prompt. Frontmatter must remain compatible with this for it to work — that's why `name` and `description` are at the top.

Prefer registry lookup as the deterministic path; auto-discovery is the convenience layer.

## Lifecycle

- Skills marked `status: active` are current.
- Skills marked `status: deprecated` should have a `supersedes` pointer or a deprecation note in their description. Do not delete deprecated skills — they preserve history; agent templates that still reference them keep working.
- Quarterly review by skill owners: confirm the content still reflects current practice. Skills accrete stale advice silently, that's the failure mode to watch.

## Adding a new skill

1. Copy `.claude/skills/_template/SKILL.md` into a new folder `.claude/skills/<your-skill-name>/SKILL.md`.
2. Fill in frontmatter and body.
3. Add a row to `.claude/skills/registry.md` under the relevant role(s).
4. Open a PR. Reviewer checks: schema valid, registry updated, content not duplicating CLAUDE.md / rules.

## Relationship to `_artifacts/`

`.claude/agents/_templates/_artifacts/` (e.g., `srs-ingestion-checklist.md`, `instrumentation-contract.md`) holds **per-task artifact templates** — a BA fills in the ingestion checklist, an SA fills in the instrumentation contract. Those are produced once per task, not consulted as ongoing reference. Skills are different: they're advice the agent reads to do the work better, regardless of which task is in flight.
