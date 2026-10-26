# Client instructions

Place implementation in `src/`: lobby/join components in `src/lobby/`, socket setup in `src/socket/`. Use React Testing Library/Vitest in `test/<feature>/`; helpers belong in `test/helpers/`.

Follow [test organization and fixtures](../Development.md#test-organization-and-fixtures) when adding tests/features; preserve empty-selection guards and representative transitions. Use [client checks](../Development.md#client-commands) during development and the [pre-merge gate](../Development.md#pre-merge-gate) for implementation changes. Documentation-only changes need reference/requirement checks. Leave browser and visual validation to the user.

Use `src/socket/log.js` for diagnostics; log only event names, outcomes, and small metadata, never display names or full payloads. See [diagnostic switches](../Development.md#environment-and-diagnostics) when needed.

For each change, consult relevant entries in the [documentation ownership guide](../Development.md#documentation-ownership-and-updates), including cross-package effects. Inspect affected specifications; update only changed facts and link canonical definitions. Specifications describe intent; source/tests establish implementation. Keep affected JSDoc/shared types accurate.

Report checks, defects, and unverified criteria in chat. Do not add repository status tracking, commit, or update GitHub without a separate request.

For UI changes, inspect UI Rules; for socket changes, Events Contract and shared public types; for eligibility/privacy, Game Rules. Find specification paths in the ownership guide.
