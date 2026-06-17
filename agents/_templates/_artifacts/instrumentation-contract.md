---
Status: Draft | Frozen
Owner: SA
SRS-Hash: <sha256 of SRS at time of writing>
Last-Updated: <ISO-8601>
---

# Instrumentation Contract

This contract defines what each UI surface must expose to automation in order to satisfy the introspection commitments
made in `docs/SRS.md` under `## UI Introspection Profile`.

It is the testability equivalent of an API contract: a shared commitment between FE Dev / Game Dev and QA-Exec about
what is verifiable.

## Scope

This contract covers the following surfaces (must match the SRS's Surface Profiles where Introspection Level is
**Full** but requires build-time enablement, or where it transitions Partial → Full via instrumentation):

| Surface | Framework | Why Instrumentation Is Required |
|---|---|---|
| <e.g. Mobile companion app> | Flutter | Default Flutter renders to single canvas; Patrol exposes widget tree |
| <e.g. Game client> | Unity | OS sees one rendering surface; AltTester exposes GameObjects |

Surfaces with native default introspection (web DOM, SwiftUI, Compose) do not need entries here unless the project
layers on extra requirements.

---

## Per-Surface Requirements

For each surface, declare:

### Surface: <name>

**Framework:** <e.g. Flutter 3.x>
**Introspection Tooling:** <e.g. Patrol, AltTester, RN testID, axe-mobile>

**Build Configuration**

- Build flag / variant that enables instrumentation: `<e.g. --dart-define=PATROL=true>` /
  `<e.g. ALTTESTER scripting define>`
- Instrumentation must be present in: dev builds, QA builds, staging builds; **must be absent** in production builds
- CI must produce a separate instrumented artifact for QA-Exec consumption

**Identifier Conventions**

Every component type below must carry the listed identifier so QA-Exec can locate it without coordinates or pixel
matching.

| Component Type | Required Identifier | Naming Convention |
|---|---|---|
| Buttons | testID / accessibility ID | `btn-<screen>-<action>` |
| Form fields | testID + accessibility label | `field-<screen>-<name>` |
| Modal / dialog | testID on root | `modal-<purpose>` |
| List items | testID with index | `item-<list>-<index>` |
| Game UI panels (Unity) | GameObject name + tag | `UI/<screen>/<element>` |
| Navigation targets | testID + accessibility role | `nav-<destination>` |

**Property Exposure**

QA-Exec must be able to read, at minimum, these properties per element:

- [ ] Visible / hidden state
- [ ] Enabled / disabled state
- [ ] Bounds (x, y, width, height)
- [ ] Visible text content
- [ ] Current state (selected, focused, expanded, etc. where applicable)

For surfaces requiring tier-2 token verification:

- [ ] Computed color (or pixel-sample fallback at element center)
- [ ] Typography size (declared or computed)
- [ ] Typography family / weight (best-effort; mark `skipped` if framework cannot expose)

**Test Hooks (where applicable)**

- Patrol: native scripts under `integration_test/`, project-level setup
- AltTester: scene loaded with AltTester runner, port + host configured
- React Native: `accessible={true}` enforced on interactive elements
- Custom: <describe>

**Out-of-Scope for Instrumentation**

List anything explicitly *not* introspectable even with instrumentation, so QA-Exec doesn't try and silently fail:

- e.g. Particle effects, animation interpolation states, dynamic 3D camera positions, web view contents inside a
  native shell

---

## Cross-Cutting Requirements

### Build Identification

Every instrumented build must expose, via a known accessibility-readable element on launch, its build metadata:

- Build version
- Commit hash
- Instrumentation flag confirmation

This allows QA-Exec to assert it is testing the right artifact.

### Token Contract Test

For projects with design tokens, ship a hidden / dev-only screen that renders every token (colors, spacing scale,
typography ramp). QA-Exec runs token contract tests against this screen, decoupled from feature screens. Catches token
drift centrally.

Path / route: `<e.g. /__token-contract or special launch flag>`

### Accessibility Floor

If the SRS specifies an accessibility target, this contract must declare the minimum required attributes per
interactive element type to satisfy that target. QA-Exec verifies presence; doesn't audit semantics beyond what the
target specifies.

---

## Sign-Off

This contract transitions Draft → Frozen when:

- [ ] All surfaces from the SRS's `Partial`/`None` rows that committed to instrumentation are covered
- [ ] FE Dev / Game Dev role has reviewed the identifier conventions and confirmed they're achievable in the chosen
  framework
- [ ] QA-Exec has confirmed the property exposure list is sufficient for the planned test cases
- [ ] DevOps has confirmed the build configuration is reproducible in the local environment

A frozen contract changing mid-project is a blocking issue per .claude/rules/change-synchronization.md §7. Same severity as an API contract break.

## Hard Rules

- Production builds must never carry instrumentation. Verify in CI.
- testID / accessibility ID values are part of the contract. Renaming them = contract break.
- If FE Dev cannot satisfy a requirement (framework limitation, perf cost), this contract must be updated by SA, not
  silently violated by Dev.
