# Cambio server

From this directory, start the server with `npm.cmd start` in PowerShell. It listens on port `3000` unless `PORT` is set.

To show Socket.IO diagnostics in the terminal, run:

```powershell
$env:SOCKET_DEBUG='1'; npm.cmd start
```

Each diagnostic line includes a timestamp, socket ID, event name, and outcome. Incoming payload contents are not logged. Unexpected server errors are printed even when diagnostics are off. No log file is created.

In Postman, create a **Socket.IO** request to `ws://localhost:3000`. Set the event name to `joinRoom`, send `{"displayName":"Alice"}` as its JSON argument, enable **Ack**, and listen for `playerJoined` and `error`. If the event name is left blank, Postman sends `message`; the terminal will show it as `unhandled`.

After joining, send `ready` with `{}` and no Ack. The server sends `playerReady` with the new player's ID to seated clients. A ready player may send `unready` with `{}` and no Ack while fewer than four are ready; the server broadcasts `playerUnready` with that player's ID. Four ready players remain in the undealt lobby with unready locked until a departure lowers the ready count. Dealing and memorization readiness are deferred.

Unexpected exceptions in lobby actions or departure handling are logged, then the shared room is reset to a fresh empty state and all current clients (including unseated connections) are disconnected. Forced cleanup emits no partial departure views. The HTTP server keeps listening and fresh connections can join. Expected validation errors remain requester-only and leave the room unchanged. No lobby fault introduces a `SERVER_ERROR` action error or a `gameAborted` event.

Clients can retry an initial connection failure. Automatic reconnection is disabled; once a connection is lost, reload the page to join again.

Install dependencies with `npm.cmd install`. Run the automated checks with `npm.cmd test` and `npm.cmd run typecheck`. TypeScript checks JavaScript application source and shared public payload definitions with strict `checkJs` and no emitted files; authoritative game-state types remain server-only. Tests use an explicit `socket.io-client` development dependency and bounded connection, acknowledgement, and event waits.

## Focused tests

Run these commands from `code/server` in PowerShell:

| Command | Selection |
| --- | --- |
| `npm.cmd test` | Every server test, including assets |
| `npm.cmd run test:lobby` | Joining, display names, seats, and lobby readiness |
| `npm.cmd run test:setup` | Dealing, memorization, and departure/redeal behavior |
| `npm.cmd run test:cards` | Deck rules and artwork integrity |
| `npm.cmd run test:recovery` | Unexpected handler faults and room reset |
| `npm.cmd run test:fast` | Isolated rule tests; no sockets or asset checks |
| `npm.cmd run test:integration` | Composed server and real-socket tests |
| `npm.cmd run test:assets` | Public artwork compared with design originals |

Tests live in `test/<feature>/`. Use `.unit.test.js` for isolated logic, `.integration.test.js` for composed server or real-socket behavior, and `.asset.test.js` for asset integrity. Helpers live in `test/helpers/` and are excluded from discovery. A scenario spanning multiple features belongs to the behavior it primarily verifies; the setup suite retains the lobby-to-private-deal transition.

Select one file or one test by name directly:

```powershell
node --test --test-reporter ./test/helpers/reporter.js test/setup/deal.unit.test.js
node --test --test-reporter ./test/helpers/reporter.js --test-name-pattern="recipient views" test/setup/deal.unit.test.js
node --test --test-reporter ./test/helpers/reporter.js "test/setup/**/*.unit.test.js"
```

The small TAP reporter preserves Node's output and makes empty file or name selections fail; Node otherwise accepts an empty selection on the current runtime. Test failures also return a nonzero exit code. Keep runner options before file paths. Use the direct commands for name filtering: appending Node options to an npm test script places them after its file pattern, where this runtime ignores them. The third example combines a feature with a test level.

`test/helpers/room.js` provides a fresh server per test, optional injected game state, bounded socket waits, and teardown. `dealtHarness` exercises the real setup transition. When adding powers, create `test/powers/` with its own fixtures that inject the required game state rather than replaying lobby scenarios, and add a matching feature script. Retain representative tests for transitions between features.

Use focused tests during development. Before merging, run the full suites and type checks in **both** packages and the client production build; changes to shared state or socket handling need broader checks even when they begin in one feature.

The implemented scope is the undealt lobby. Dealing, memorization, gameplay, active-game aborts, results, and reconnection/resume remain deferred; the full event contract is not yet implemented.
