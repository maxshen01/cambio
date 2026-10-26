# Cambio client

Run the server from `code/server` with `npm.cmd start`. In another PowerShell terminal, run the client from this directory with `npm.cmd run dev` and open the URL Vite prints (normally `http://localhost:5173`). Each browser tab creates its own Socket.IO connection. Enter a name in the opening dialog and click **Join lobby** to see the shared seats update.

The Vite development server proxies `/socket.io` to `http://localhost:3000`. The name input has no browser autocomplete or spelling suggestions. A rejected-name error clears when you edit the name. **Ready Up** becomes available once your seat appears, even before the lobby fills. It changes to **Unready** after the server marks you ready; either action updates the seat marks only after a server event. The fourth ready mark triggers a private opening deal and resets readiness for memorization. Each player sees only their own bottom two card faces until their next Ready confirmation. Four memorization confirmations leave every hand facedown; turn progression is not implemented yet.

The setup board reserves one empty drawn-card area centered below the deck and discard piles, outside all player hands. It has no visible outline, card image, label, or interaction during memorization. Hand slot IDs are `1`–`8`; the shared `DrawnCardView` type identifies its owner without a hand-slot ID. Future drawing and power handlers will populate this area using the recipient-specific visibility rules in the [Events Contract](../../project-managment/Events%20Contract.md).

To log connection and lobby events in the browser console, start the client with:

```powershell
$env:VITE_SOCKET_DEBUG='1'; npm.cmd run dev
```

Logs include event names, outcomes, seat IDs, and player counts. They omit display names and full event payloads.

Connection status distinguishes connecting, connected, failed, and lost. If the backend is unavailable on opening the page, **Retry connection** reuses the socket and preserves your entered name. Retry clears the connection error and remains disabled while connecting. Automatic reconnection is disabled. After an established connection is lost, membership and pending requests are cleared and **Reload to rejoin** is required; late responses cannot restore the previous session. Unexpected server lobby faults reset the entire room and disconnect everyone, using this same reload flow.

Install dependencies with `npm.cmd install`. Run component and real-socket integration tests with `npm.cmd test`, strict JavaScript/JSX checks with `npm.cmd run typecheck`, and the production build with `npm.cmd run build`. The browser type-check configuration includes shared public lobby payload definitions, separate from the server's authoritative state types.

## Focused tests

Run these commands from `code/client` in PowerShell:

| Command | Selection |
| --- | --- |
| `npm.cmd test` | Every client test |
| `npm.cmd run test:lobby` | Join form, lobby views, readiness, and real-socket lobby flow |
| `npm.cmd run test:setup` | Memorization, card privacy, and departure/redeal behavior |
| `npm.cmd run test:cards` | Artwork loading, caching, failure, and retry |
| `npm.cmd run test:recovery` | Connection failure/loss, retry, stale callbacks, and cleanup |
| `npm.cmd run test:fast` | Unit and fake-socket component tests |
| `npm.cmd run test:integration` | React UI connected to a real Socket.IO server |

Tests live in `test/<feature>/`. Use `.unit.test.js` for isolated logic, `.component.test.jsx` for React tests using fake sockets, and `.integration.test.js` or `.integration.test.jsx` for real-socket behavior. Shared setup and fake sockets live in `test/helpers/` and are excluded from discovery. The real-socket lobby scenario also verifies its transition into a private deal; it stays together under lobby behavior. Server-owned artwork integrity checks run with `npm.cmd run test:assets` in `code/server`.

Select one file or one test by name directly, or watch a feature while developing:

```powershell
npm.cmd exec -- vitest run test/setup/memorization.component.test.jsx
npm.cmd exec -- vitest run test/setup/memorization.component.test.jsx -t "keeps face IDs"
npm.cmd exec -- vitest test/setup/
```

Feature and level filters can be combined, for example `npm.cmd run test:fast -- test/setup/`. Test failures and empty selections return a nonzero exit code. A small companion reporter also fails name filters that skip every test; Vitest's default reporter remains enabled.

When adding powers, create `test/powers/`, use feature-specific fake-socket fixtures, add a matching feature script, and retain representative integration scenarios between features. No empty future suites are needed.

Use focused tests during development. Before merging, run the full suites and type checks in **both** packages and `npm.cmd run build` in the client. A change to shared payloads, socket handling, or application state warrants broader checks.

The implemented scope covers the lobby, private dealing, memorization confirmation, and replacement-seat redealing after a memorization departure. Drawing, turn progression, powers, active-game aborts, results, and reconnection/resume remain deferred; the full event contract is not yet implemented.

For manual validation, start the frontend while the backend is stopped and verify failure/retry. Start the backend and retry, then use four tabs to check joining, lobby readiness, private dealing, and memorization confirmation. Verify that the single empty drawn-card area sits below both piles without overlapping hands or controls. Close a tab during memorization and check that the deal clears and a replacement can join and deal again. Stop the backend while joined and confirm that rejoining requires reload. Automated tests inject unexpected handler faults; there is no production debug control.
