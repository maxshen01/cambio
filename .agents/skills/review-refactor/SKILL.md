---
name: review-refactor
description: Review recently implemented repository code for readability, ease of extension, responsibility boundaries, and redundant code or tests. Present recommendations and wait for the user's selection before implementing refactors. Use for post-implementation cleanup and refactoring reviews, not feature implementation or general bug fixing.
---

# Review code and implement selected refactors

Improve organization and maintainability while preserving behavior. This skill owns both review and implementation; it does not require the `implement-plan` skill or mandatory TDD for structural changes.

## Review first

An initial invocation authorizes a review only, even when phrased as "refactor this code." Present findings and wait for the user to select changes before editing code, tests, configuration, or documentation. If the user has already selected findings in this conversation and requests implementation, continue with that selection without repeating the review or asking for approval again. Respect the environment's Plan mode restrictions.

1. Establish scope from the request, conversation, and relevant recent changes. Inspect Git status and preserve unrelated work. Focus on the implemented area and its immediate dependencies; ask only when material scope ambiguity remains after inspection.
2. Read applicable repository instructions, the root README, relevant specifications, source, callers, and tests. Use current code and tests to establish behavior and specifications to identify intended constraints; report discrepancies rather than silently resolving them during cleanup.
3. Trace ownership and data flow before proposing moves or deletions. Review the criteria below where relevant. Run non-mutating checks when they resolve uncertainty; make no review-stage edits.
4. Present evidence-backed findings grouped into clear improvements and optional opportunities. Give each finding a stable identifier, priority, code location, concrete problem, proposed change, and verification implications or compatibility risk. Match detail to the change; a compact table or list is sufficient.
5. Identify important overlapping coverage that should remain when recommending test removal. Report suspected bugs and intentional behavior changes separately. Request the user's selection and stop before mutations. Explain that this skill requires selection before edits, linking this file and quoting the applicable instruction above.

"No refactor needed" is a valid outcome. Do not manufacture findings or require every review criterion to appear in the response. Do not pursue test-count targets, file-size quotas, or a preferred architecture without a concrete benefit.

## Review criteria

- **Responsibilities and layout:** determine whether functions belong in an existing module, justify a new file or directory, or should be merged with fragmented modules. Evaluate ownership and cohesion, not just file length or reuse count. Avoid unnecessary wrapper modules and barrel exports.
- **Dependencies and interfaces:** inspect circular imports, dependency direction, coupling between layers, misleading names, unclear parameters or return values, and domain operations constructing transport-specific payloads. Preserve intentionally shared contracts.
- **State ownership:** locate duplicated construction defaults, resets, and invariants. Account for mutable references, object identity, state lifetimes, validation order, and atomicity of rejected operations before centralizing logic.
- **Redundant code:** verify callers, registrations, configuration, and alternate execution paths before declaring code unused. Distinguish accidental duplication from intentionally separate behavior; similar syntax alone does not justify an abstraction.
- **Test value:** compare behavior, assertions, fixtures, and failure modes rather than names or counts. Before removing a test, name the surviving coverage for its important assertions and preserve any unique checks. Detailed unit coverage and integration checks for wiring, recipient privacy, and event ordering serve different purposes. Passing tests alone do not prove redundancy.
- **Ease of extension:** identify concrete obstacles to documented upcoming work. Favor small changes that simplify extension without adding speculative frameworks, dependencies, or future-feature scaffolding. Performance tuning and security audits are separate work unless explicitly requested.
- **Compatibility:** preserve observable behavior, public interfaces, error precedence, event order, privacy, and side effects. Distinguish intended contracts from temporary implementation exceptions recorded in the README; do not implement future behavior under the guise of refactoring.

## Implement the selected changes

1. Translate the user's selection into a short implementation checklist. Honor exclusions such as "only the clearest candidates." If a selected change needs a material expansion, explain it and obtain a scope decision; routine import and reference updates are part of the selected refactor.
2. Establish the relevant test baseline before changing code. Record existing failures and separate them from regressions; do not broaden the task to fix unrelated failures.
3. Make the agreed structural changes in small steps. Update callers, imports, source comments, types, and affected documentation. Preserve unique test assertions when consolidating tests. Add a characterization test only when important existing behavior lacks coverage needed to refactor safely; do not add tests merely to mirror moved helpers or increase coverage counts.
4. Keep discovered bugs separate. If a fix is authorized, first add a failing regression test where practical, then make it pass. A behavior-preserving refactor does not require a new failing test.
5. Run focused checks and the repository-required validation appropriate to the affected interfaces. Report changes, individual check results, unresolved defects, and unverified criteria. Do not claim reduced test counts establish equivalent coverage or that green checks prove complete behavioral equivalence.

## Repository conventions

Never launch, attach to, inspect, or control a browser, or check browser availability. Use non-browser tests, including jsdom, typechecks, builds, and API/Socket.IO checks. Leave browser and visual checks to the user and report them as unrun when applicable.

Maintain the root README when capabilities, limitations, temporary exceptions, source links, or coverage change. Change `project-managment/` only for intended design changes, apart from necessary source-link repairs. Keep comments and public types accurate; update development instructions only for actual tooling or startup changes. Put check results and progress reports in chat, not repository documentation.

Do not commit, publish, or update GitHub without a separate user request. Do not modify other skills or add project configuration as a side effect of refactoring.
