---
name: c4-author
description: How to author C4 model (https://c4model.com) diagrams at levels C1-C3 in docs/architecture.md using C4-PlantUML notation. Consult when SA is producing architecture in design or extract mode.
agents: [sa]
sdlc_phase: planning
owner: Platform Eng
status: active
---

# C4 Author

## When to use

You are the SA, authoring `docs/architecture.md` per [`architecture-template.md`](../../agents/_templates/_artifacts/architecture-template.md). The template prescribes the kit's adoption of the **C4 model** at levels C1 (Context), C2 (Containers), and C3 (Components). This skill gives you the notation conventions, per-level intent, and common pitfalls.

C4 level 4 (Code) is NOT in SA's scope. BE/FE Dev own it as an optional artifact per `be-dev.md` / `fe-dev.md`. This skill does not cover C4 Code.

## What each level captures (and what each level is NOT)

| Level | Captures | Does NOT capture |
|---|---|---|
| **C1 Context** | The system as ONE box. External actors (humans). External systems (other deployed software, in-org or third-party). High-level interactions ("validates session", "publishes events"). | Internal structure. Don't decompose the system in C1. |
| **C2 Containers** | Deployable / runnable units inside the system boundary. Each container is something you'd start independently — a web app, a service, a database, a queue, a worker process, a file store. | Code-level structure. A container is not a class. |
| **C3 Components** | Major structural building blocks INSIDE one container. Logical groupings of related code — modules, packages, sets-of-classes. One C3 diagram per non-trivial container. | Individual classes or functions. If you find yourself drawing a class diagram, you're at C4 (out of scope). |

The most common pitfall: conflating C2 and C3. A microservice is ALWAYS a C2 container (it's deployable). The handlers / domain services / infrastructure adapters INSIDE it are C3 components.

## Notation — C4-PlantUML macros

The kit uses [C4-PlantUML](https://github.com/plantuml-stdlib/C4-PlantUML) — a PlantUML library that adds C4-specific shapes and conventions. This matches the kit's existing PlantUML usage in `frs-template.md` sequence diagrams (same rendering pipeline; same markdown-reader support).

Three include directives, one per level:

```plantuml
@startuml MyDiagram
!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Context.puml
... (C1 macros: Person, System, System_Ext, Rel)
@enduml
```

```plantuml
@startuml MyDiagram
!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Container.puml
... (C2 macros: Person, Container, ContainerDb, ContainerQueue, System_Ext, Rel, System_Boundary)
@enduml
```

```plantuml
@startuml MyDiagram
!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Component.puml
... (C3 macros: Container_Boundary, Component, ComponentDb, Rel)
@enduml
```

For offline-first projects, the team may pin a vendored copy of C4-PlantUML in the repo (`tools/c4-plantuml/`) and adjust the `!include` paths. Document that decision in an ADR if you deviate from the public CDN.

## Procedure

For each architecture authoring (`design` or `extract` mode):

1. **C1 first.** Draw the box for "the system" by name. Add Person() for each human role from SRS §5. Add System_Ext() for each external system the SRS names (Account/Passport, Kafka, payment provider, third-party APIs, etc.). Connect them with Rel() — one arrow per interaction, labeled with the interaction's intent ("validates session", not "GET /session").
2. **External actors and systems table** — every entity in C1 gets a row citing where it came from (SRS §5 role name, `solution-defaults` for in-org systems, ADR for project-specific decisions).
3. **C2 next.** Draw System_Boundary() around the system. Inside, add one Container() per deployable unit. Use ContainerDb() for databases, ContainerQueue() for queues. External systems re-appear as System_Ext().
4. **Containers table** — every container row has Technology (stack), Responsibility (one sentence), Persistence (stateless / persistent / managed). Don't restate the diagram in prose; the table is the authoritative reference.
5. **C3 per non-trivial container.** For each container with more than one major component, add a C3 sub-section. Container_Boundary() around the container; Component() per logical building block. Components-table includes `Linked FRs` for traceability.
6. **C3 omission rule.** For containers that are genuinely single-component (managed datastores, stateless workers with one main loop), explicitly note `*C3 omitted: <reason>*` rather than drawing a one-component diagram. The omission is part of the architecture — it documents the team's intent.
7. **Cross-cutting concerns** at the container level — auth, observability, error handling, retry, rate limiting, secrets. Don't repeat per-component; cite per-container variations when relevant.
8. **NRS posture, failure modes, open risks, ADR refs** per the template's lower sections.

## Worked example — Spectator feature

The `architecture-template.md` carries a complete Spectator-feature example covering C1 → C2 → C3 (Spectator API only; Stream Gateway and the two databases are single-component containers and use the omission rule). Read the template alongside this skill — the example shows every notation decision in context.

Key choices to notice in the example:

- **C2 distinguishes Spectator API from Stream Gateway** even though they're both Node.js. Different deployable units, different runtime concerns (Stream Gateway holds long-lived WebSocket connections; API doesn't). Two containers, not one.
- **C2's Session Store is `ContainerDb` (Redis)** even though Redis is also a pub/sub channel. The `Db` macro signals "data lives here"; the pub/sub usage is documented in the relations.
- **C3 for Spectator API shows 5 components** (Join Handler / Session Manager / Visibility Checker / Auth Adapter / Event Emitter) — that's a reasonable C3 granularity. Don't decompose to 30 components; C3 is logical-grouping level, not class level.
- **C3 omitted for Stream Gateway, Session Store, Match Visibility DB** with explicit one-line justifications. Single-component containers stay terse.

## Common pitfalls

- **Drawing one C3 component per file.** C3 is not file-level. It's logical-grouping level. If you have 10 files in `services/cart/`, the C3 component "Cart Service" is what they collectively form — not one per file.
- **C2 containing C3-level detail.** Containers in C2 are the deployable units; their internal handlers, services, and adapters are C3. A common mistake is putting "AuthHandler" or "DBService" in C2 — those are C3 components.
- **External systems in C3.** External systems (Account/Passport, Kafka, third-party APIs) re-appear in C3 diagrams the same way they appeared in C2 — as `System_Ext()`. They don't become components.
- **Rel() arrows with no label.** Every relation needs a one-line intent label ("Validates session", "Publishes events"). Unlabeled arrows are a kit-quality miss.
- **Mixing notation conventions across levels.** Pick C4-PlantUML and stick to it. Don't mix in `[]` boxes or Mermaid syntax mid-diagram.
- **Drawing C4 (Code) when you meant C3.** If your diagram has individual class names or function names, you've slipped to C4 — that's BE/FE Dev's optional territory, not SA's.

## Hard rules

- **C1 is MANDATORY** for every architecture doc. Every system has a boundary.
- **C2 is MANDATORY** for every architecture doc. Every system has at least one container.
- **C3 is MANDATORY for every container with more than one major component**. Single-component containers (managed datastores, single-loop workers) may omit C3 with an explicit `*C3 omitted: <reason>*` note.
- **C3 components MUST carry `Linked FRs`** for traceability back to `docs/frs/<FR-ID>.md`. A C3 component with no Linked FRs is either over-decomposed (split too fine) or missing an FR that should exist.
- **Use C4-PlantUML macros**, not freeform PlantUML shapes. The macros encode the C4 visual conventions; freeform shapes lose those conventions.
- **Notation is fixed at C4-PlantUML** for the kit's default. Deviation (structurizr DSL, Mermaid C4-ish, etc.) requires an ADR documenting why.
- **C4 (Code) is OUT OF SCOPE for SA.** If a stakeholder asks for code-level diagrams, redirect to `be-dev.md` / `fe-dev.md` C4 sections (optional Dev-owned territory).

## References

- [c4model.com](https://c4model.com) — Simon Brown's authoritative reference; stable external link
- [C4-PlantUML on GitHub](https://github.com/plantuml-stdlib/C4-PlantUML) — the macro library
- `.claude/agents/_templates/_artifacts/architecture-template.md` — the kit's canonical structure that uses this skill
- `.claude/skills/sa-architecture-design/` — SA design-mode C4 producer
- `.claude/skills/sa-brownfield-extract/` — SA extract-mode C4 producer
- `.claude/agents/_templates/_artifacts/frs-template.md` — `Linked Component:` field that back-references C3 components
- `.claude/agents/_templates/be-dev.md` / `fe-dev.md` — Dev-side C4 (Code) handling (optional)
