# Server instructions

Place implementation in `src/`: rules/models in `src/game/`, connection code in `src/sockets/`. Use Node's test runner in `test/<feature>/`; helpers belong in `test/helpers/`.

Follow [test organization and fixtures](../Development.md#test-organization-and-fixtures) when adding tests/features; use independent injected-state fixtures, preserve recursive discovery, empty-selection guards, and representative transitions. Use [server checks](../Development.md#server-commands) during development and the [pre-merge gate](../Development.md#pre-merge-gate) for implementation changes. Documentation-only changes need reference/requirement checks.

Use `src/sockets/log.js` for diagnostics; log only event names, outcomes, and small metadata, never incoming payload contents. Unexpected errors must be logged even with diagnostics off. See [diagnostic switches](../Development.md#environment-and-diagnostics) when needed.

For each change, consult relevant entries in the [documentation ownership guide](../Development.md#documentation-ownership-and-updates), including cross-package effects. Inspect affected specifications; update only changed facts and link canonical definitions. Specifications describe intent; source/tests establish implementation. Keep affected JSDoc/shared types accurate.

Report checks, defects, and unverified criteria in chat. Do not add repository status tracking, commit, or update GitHub without a separate request.

For rule/state changes, inspect Game Rules and Game Data Model; for socket/error/projection changes, Events Contract and shared public types. Also inspect UI Rules if client interactions/presentation change. Find specification paths in the ownership guide.
