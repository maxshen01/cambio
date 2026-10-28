# Development

Shared setup, commands, diagnostics, and documentation maintenance for Cambio. Package commands below run from the named package directory in PowerShell; use `npm.cmd` on Windows.

## Stack and setup

The server uses Node.js, JavaScript, and Socket.IO. The client uses React, Vite, CSS, and socket.io-client. State is in memory; there is no database, stored player account, or persistent statistics. Hosting can be a simple service such as Render or Fly.io; hosting complexity is not a product priority.

Install Node.js and npm compatible with the dependencies' declared engines and the scripts in [client package.json](client/package.json) and [server package.json](server/package.json). The repository does not pin a Node version. Server commands require Node's `--env-file` support and test-file glob support. Install each package's dependencies separately:

```powershell
cd code/server
npm.cmd install
```

```powershell
cd code/client
npm.cmd install
```

Paths in these two examples start at the repository root; use separate terminals or return to the root before the second example. The package lockfiles record dependency versions. The server tests explicitly depend on socket.io-client as a development dependency.

Create `code/server/.env` locally if it is missing; an empty file is sufficient for defaults. It is ignored by Git. The server's start script reads it with `--env-file=.env`; running without that file fails before startup. Do not copy real environment values or secrets into documentation.

## Running locally

In `code/server`:

```powershell
npm.cmd start
```

In a second terminal in `code/client`:

```powershell
npm.cmd run dev
```

The server defaults to port 3000. Open the URL Vite prints, normally `http://localhost:5173`; each tab creates a separate Socket.IO connection. Enter a name and choose **Join lobby**. The Vite proxy forwards `/socket.io` to `http://localhost:3000` with WebSocket support. If you change the server port, adjust the proxy target in [vite.config.js](client/vite.config.js) as well; there is no separate server-URL environment variable in the current client.

### Environment and diagnostics

| Variable | Package | Meaning |
| --- | --- | --- |
| `PORT` | Server | Listening port; defaults to 3000. |
| `SOCKET_DEBUG` | Server | Set to `1` to enable routine Socket.IO diagnostics. |
| `VITE_SOCKET_DEBUG` | Client | Set to `1` when starting Vite to enable client event diagnostics. |

In `code/server`:

```powershell
$env:SOCKET_DEBUG='1'
npm.cmd start
```

In `code/client`:

```powershell
$env:VITE_SOCKET_DEBUG='1'
npm.cmd run dev
```

Server diagnostic lines include a timestamp, socket ID, event name, outcome, and small metadata. Client console diagnostics include event names, outcomes, seat IDs, and player counts. Use the existing [server logger](server/src/sockets/log.js) and [client logger](client/src/socket/log.js); omit display names, incoming payload contents, and full event payloads. Unexpected server errors are logged even when routine diagnostics are off. No server log file is created.

### Socket.IO inspection with Postman

Create a **Socket.IO** request to `ws://localhost:3000` (or your configured port). Set the event name to `joinRoom`, send `{"displayName":"Alice"}` as its JSON argument, enable **Ack**, and listen for `playerJoined` and `error`. A blank event name sends `message`, which diagnostics report as `unhandled`.

After joining, send `ready` with `{}` and no Ack; a lobby player can also send `unready` with `{}` and no Ack when eligible. Use four clients to inspect the deal and separate memorization confirmations. Eligibility, exact responses, recipient privacy, and error mappings belong to [Events Contract](../project-managment/Events%20Contract.md#connection--lobby-events) and [setup events](../project-managment/Events%20Contract.md#setup--deal-events). See the [root README](../README.md) for current implementation capabilities and limitations.

### Connection and fault diagnosis

See the [root README](../README.md) for connection and setup recovery behavior and limitations. Use the diagnostic switches above to inspect event outcomes. Unexpected faults must be logged even when routine diagnostics are disabled; tests inject faults without exposing production debug controls.

## Commands and checks

Use focused checks while developing. Broaden checks for changes affecting shared state, socket handling, public types, or other features. Before merging, run both packages' full suites and type checks plus the client production build. Documentation-only edits require reference/requirement review rather than application tests or builds.

### Client commands

Run from `code/client`; scripts are defined in [package.json](client/package.json).

| Command | Purpose or selection |
| --- | --- |
| `npm.cmd run dev` | Vite development server |
| `npm.cmd test` | Complete client suite |
| `npm.cmd run typecheck` | Strict JavaScript/JSX and shared public type checks; no output files |
| `npm.cmd run build` | Production build |
| `npm.cmd run test:lobby` | Join form, lobby, readiness, and real-socket lobby-to-deal flow |
| `npm.cmd run test:setup` | Memorization, private faces, and departure/redeal behavior |
| `npm.cmd run test:cards` | Artwork loading, caching, failure, and retry |
| `npm.cmd run test:recovery` | Connection failure/loss, retry, stale callbacks, cleanup |
| `npm.cmd run test:fast` | Unit and fake-socket component tests |
| `npm.cmd run test:integration` | React connected to real Socket.IO servers under jsdom |

Select a single file, a test name, or a feature in watch mode:

```powershell
npm.cmd exec -- vitest run test/setup/memorization.component.test.jsx
npm.cmd exec -- vitest run test/setup/memorization.component.test.jsx -t "keeps face IDs"
npm.cmd exec -- vitest test/setup/
```

Combine a level and feature, for example `npm.cmd run test:fast -- test/setup/`. [Vite test configuration](client/vite.config.js) discovers unit, component, and integration suffixes recursively under `test/` and excludes shared helpers by discovery pattern. `passWithNoTests: false` rejects empty file selections; the [selection reporter](client/test/helpers/selectionReporter.js) also rejects name filters that skip every test. The default reporter remains enabled. Test failures and empty selections return nonzero exit codes.

### Server commands

Run from `code/server`; scripts are defined in [package.json](server/package.json).

| Command | Purpose or selection |
| --- | --- |
| `npm.cmd start` | Start the server using the local `.env` file |
| `npm.cmd test` | Complete server suite, including assets |
| `npm.cmd run typecheck` | Strict JavaScript and shared public type checks; no output files |
| `npm.cmd run test:lobby` | Joining, display names, seats, and lobby readiness |
| `npm.cmd run test:setup` | Dealing, memorization, and departure/redeal behavior |
| `npm.cmd run test:cards` | Deck rules and artwork integrity |
| `npm.cmd run test:recovery` | Unexpected handler faults and room reset |
| `npm.cmd run test:fast` | Isolated units; no sockets or asset checks |
| `npm.cmd run test:integration` | Composed server and real-socket tests |
| `npm.cmd run test:assets` | Public artwork compared with design originals |

Select a single file, a test name, or a feature plus test level:

```powershell
node --test --test-reporter ./test/helpers/reporter.js test/setup/deal.unit.test.js
node --test --test-reporter ./test/helpers/reporter.js --test-name-pattern="recipient views" test/setup/deal.unit.test.js
node --test --test-reporter ./test/helpers/reporter.js "test/setup/**/*.unit.test.js"
```

Keep Node runner options **before file paths**. Use the direct commands for name filtering: appending Node options to an npm test script places them after its file pattern, where the current runtime ignores them. Server scripts use recursive file globs. The [TAP reporter](server/test/helpers/reporter.js) preserves Node output and rejects empty file or name selections that Node otherwise accepts on the current runtime; failures return nonzero exit codes.

### Test organization and fixtures

Keep tests in `test/<feature>/`: client `.unit.test.js`, `.component.test.jsx`, and `.integration.test.js(x)`; server `.unit.test.js`, `.integration.test.js`, and `.asset.test.js`. Put helpers in `test/helpers/`, outside discovery. Group cross-feature scenarios under their primary behavior while retaining representative transitions. Keep current scenario-to-test mappings in the [root README](../README.md#source-and-coverage-map). Run server-owned artwork integrity checks with `test:assets`.

The [room harness](server/test/helpers/room.js) creates a fresh server per test, supports injected game state, bounds socket/acknowledgement/event waits, and tears down connections. `dealtHarness` exercises the real setup transition. New features need independent fixtures rather than replaying lobby scenarios. For example, powers belong in `test/powers/` with feature-specific fake sockets or injected state and a matching feature script; retain representative transition tests and avoid empty future suites.

Both type checks use strict TypeScript `checkJs` without emitting files. The [client config](client/tsconfig.json) includes browser JavaScript/JSX and shared public definitions; the [server config](server/tsconfig.json) includes server JavaScript and those shared definitions. Authoritative game-state types remain server-only.

### Pre-merge gate

Run from `code/server`:

```powershell
npm.cmd test
npm.cmd run typecheck
```

Run from `code/client`:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
```

These non-browser checks do not establish visual correctness. [Test Scenarios](../project-managment/Test%20Scenarios.md) defines intended acceptance scenarios and manual checks. Browser playtesting remains manual; no automated browser suite or test for the reserved `gameState` event is required.

## Documentation ownership and updates

Paths in the first column are repository-relative; links resolve from this file.

| Document | Owns; update when these facts change |
| --- | --- |
| [README.md](../README.md) | Current capabilities, limitations, temporary implementation exceptions, and capability-to-source/test mappings |
| [project-managment/MVP.md](../project-managment/MVP.md) | Product goals, audience, scope/exclusions, and release acceptance |
| [project-managment/Game Rules.md](../project-managment/Game%20Rules.md) | Gameplay, card visibility policy, powers, matching, scoring, turns, lifecycle |
| [project-managment/Game Data Model.md](../project-managment/Game%20Data%20Model.md) | State ownership, field meaning, relationships, invariants; keep source JSDoc accurate |
| [project-managment/Events Contract.md](../project-managment/Events%20Contract.md) | Events, payloads, acknowledgements, errors, recipient redaction, ordering; keep shared public types accurate |
| [project-managment/designs/UI Rules.md](../project-managment/designs/UI%20Rules.md) | Layout, controls, accessibility, feedback, animations, screen transitions |
| [project-managment/Test Scenarios.md](../project-managment/Test%20Scenarios.md) | Intended acceptance sequences and manual validation procedures |
| [code/Development.md](Development.md) | Setup, commands, dependencies, environment-variable names, diagnostics, documentation ownership |
| [code/client/README.md](client/README.md) and [code/server/README.md](server/README.md) | Package purpose, minimal startup, entry links |

For every implementation, read the [root README](../README.md), relevant source/tests, and affected specifications. Update the root README when delivered capabilities, limitations, temporary exceptions, or coverage change; it is the only documentation update required solely for implementation progress. Change documents under `project-managment/` only when intended design changes: rules, contracts, state semantics, UI requirements, or acceptance requirements. Implementing an existing requirement does not qualify. Keep design definitions in their canonical home and record temporary implementation exceptions only in the README. MVP changes require deliberate product-scope or acceptance decisions.

Keep affected source comments, JSDoc, and shared public types accurate as part of code changes. Update development and package startup instructions when tooling or startup requirements actually change. Keep individual check results, unresolved defects, manual validation results, checkboxes, and chronological progress logs in chat or authorized GitHub updates rather than the README or design documents. Do not commit or update GitHub without a separate request. Local coding and test-placement constraints remain in [client instructions](client/AGENTS.md) and [server instructions](server/AGENTS.md).
