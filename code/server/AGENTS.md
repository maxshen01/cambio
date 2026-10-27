# Server instructions

Place implementation in `src/`: rules/models in `src/game/`, connection code in `src/sockets/`. Use Node's test runner in `test/<feature>/`; helpers belong in `test/helpers/`.

Follow [test organization and fixtures](../Development.md#test-organization-and-fixtures) when adding tests/features; use independent injected-state fixtures, preserve recursive discovery, empty-selection guards, and representative transitions. Use [server checks](../Development.md#server-commands) during development and the [pre-merge gate](../Development.md#pre-merge-gate) for implementation changes. Documentation-only changes need reference/requirement checks.

Use `src/sockets/log.js` for diagnostics; log only event names, outcomes, and small metadata, never incoming payload contents. Unexpected errors must be logged even with diagnostics off. See [diagnostic switches](../Development.md#environment-and-diagnostics) when needed.

For each change, read the [root README](../../README.md), relevant code/tests, and affected specifications using the [documentation ownership guide](../Development.md#documentation-ownership-and-updates). Update the root README when capabilities, limitations, temporary implementation exceptions, or coverage change. It is the only documentation update required solely for implementation progress. Change `project-managment/` only when intended design changes; implementing an existing requirement does not qualify. Keep affected source comments, JSDoc, and shared public types accurate. Update development/startup instructions only when tooling or startup requirements change.

Report individual check results, unresolved defects, and manual/unverified criteria in chat or authorized GitHub updates. Keep progress checkboxes and chronological logs out of repository documentation. Do not commit or update GitHub without a separate request.

For rule/state changes, inspect Game Rules and Game Data Model; for socket/error/projection changes, Events Contract and shared public types. Also inspect UI Rules if client interactions/presentation change. Find specification paths in the ownership guide.
