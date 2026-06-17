# Change Synchronization

This file holds CLAUDE.md §7. Section numbers are preserved from the original CLAUDE.md so existing
cross-references in agent templates continue to resolve.

For workflow contract entry-point, see `CLAUDE.md`.

---

## 7. Change Synchronization

When any artifact changes, the Orchestrator must verify and update **all** downstream artifacts before unblocking the
flow. For SRS-level changes that represent an iteration (Version bump or external Source-Hash mismatch), the kit has a structured workflow: BA Phase 1.Z detects the trigger, halts for user confirmation, then BA Phase 4 produces `docs/iteration-plan/<version>.md` which the Orchestrator consumes at §9 Step 3.5. The list below covers the **artifact-level** synchronization rules that apply during and outside iteration:

- SRS changed → revert SRS Status to `Draft`; re-run BA sign-off; re-check architecture, master plan, test cases,
  security section, API contracts
- Architecture changed → revert `docs/architecture.md` `Status` to `Draft`; re-run the architecture-validator gate (SA → architecture-validator → TL) before any TL re-dispatch; then re-check master plan, affected tasks, API contracts
- **API contract changed (frozen → modified)** → halt all dependent FE tasks; promote to blocking issue; resume after
  contract re-frozen
- **Confirmed Figma version changed** → halt the consuming FE task; promote to blocking issue; revert design sub-status
  to `design-revision-needed` and re-run the design lifecycle from step 1
- Test case changed → re-check task DoD

The Orchestrator does not edit role-owned artifacts directly; it dispatches the owning role.
