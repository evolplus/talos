---
name: <kebab-case-name-matching-folder>
description: One-line trigger that another agent will read to decide whether to invoke this skill. Lead with the verb, name the artifact.
agents: [ba]
sdlc_phase: planning
owner: Platform Eng
status: active
---

# <Title>

## When to use

One paragraph. Which role, which phase, what triggers reading this skill. Be concrete about what the agent has on hand at this moment.

## Inputs and outputs

- **Inputs:** the artifacts and context the agent should have before consulting this skill
- **Outputs:** what the agent should be able to produce or decide after consulting it

## Procedure

1. Step one. Concrete, not abstract.
2. Step two. Reference an example in `references/` if it helps.
3. Step three. ...

## Hard rules

- 2–6 absolute do/don'ts. Match the kit's tone — terse, justified.
- Each rule should map to a real failure mode someone has seen.

## References

- `references/<file>.md` — purpose
- CLAUDE.md §X — the workflow rule this supports
- External link — only if stable
