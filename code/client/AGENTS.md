# Client instructions

Place implementation in `src/`: lobby/join components in `src/lobby/`, socket setup in `src/socket/`. Use React Testing Library/Vitest in `test/<feature>/`; helpers belong in `test/helpers/`.

Follow [test organization and fixtures](../Development.md#test-organization-and-fixtures) when adding tests/features; preserve empty-selection guards and representative transitions. Use [client checks](../Development.md#client-commands) during development and the [pre-merge gate](../Development.md#pre-merge-gate) for implementation changes. Documentation-only changes need reference/requirement checks. Leave browser and visual validation to the user.

Use `src/socket/log.js` for diagnostics; log only event names, outcomes, and small metadata, never display names or full payloads. See [diagnostic switches](../Development.md#environment-and-diagnostics) when needed.

For each change, read the [root README](../../README.md), relevant code/tests, and affected specifications using the [documentation ownership guide](../Development.md#documentation-ownership-and-updates). Update the root README when capabilities, limitations, temporary implementation exceptions, or coverage change. It is the only documentation update required solely for implementation progress. Change `project-managment/` only when intended design changes; implementing an existing requirement does not qualify. Keep affected source comments, JSDoc, and shared public types accurate. Update development/startup instructions only when tooling or startup requirements change.

Report individual check results, unresolved defects, and manual/unverified criteria in chat or authorized GitHub updates. Keep progress checkboxes and chronological logs out of repository documentation. Do not commit or update GitHub without a separate request.

For UI changes, inspect UI Rules; for socket changes, Events Contract and shared public types; for eligibility/privacy, Game Rules. Find specification paths in the ownership guide.
