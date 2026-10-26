# Server directory structure

```text
server/
|-- src/                Server application code
|   |-- game/           Game rules and data models
|   `-- sockets/        Connection code
|-- test/               Feature folders: lobby, setup, cards, recovery; shared helpers
|-- package.json        Package configuration and scripts
`-- package-lock.json   Locked dependencies
```

Place server implementation code in `src/`. Keep game rules and data models in `src/game/`, and all connection code in `src/sockets/`. Put unit and integration tests in `test/`.

Run server tests with `npm.cmd test` from this directory; the package script uses Node's test runner.

Keep tests in `test/<feature>/` with `.unit.test.js`, `.integration.test.js`, or `.asset.test.js` suffixes. Keep helpers in `test/helpers/`, outside test discovery. Group scenarios by their primary behavior; preserve representative cross-feature transitions. The shared room harness accepts injected state so new features can start from independent fixtures without replaying lobby scenarios.

During development use `npm.cmd run test:lobby`, `test:setup`, `test:cards`, or `test:recovery`; use `test:fast` for units, `test:integration` for composed server/socket checks, and `test:assets` for artwork integrity. New feature folders need matching scripts. Preserve recursive discovery and the empty-selection TAP guard. See README.md for single-file/name commands. Before merging, run both packages' complete suites and type checks and the client production build.

For useful Socket.IO diagnostics, use the existing `src/sockets/log.js` helper and the `SOCKET_DEBUG=1` switch. Log event names, outcomes, and small metadata without incoming payload contents. Unexpected server errors are logged even when diagnostics are off.

All command line inputs will be returned back in bash.
