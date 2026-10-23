# Server directory structure

```text
server/
|-- src/                Server application code
|   |-- game/           Game rules and data models
|   `-- sockets/        Connection code
|-- test/               Unit and integration tests
|-- package.json        Package configuration and scripts
`-- package-lock.json   Locked dependencies
```

Place server implementation code in `src/`. Keep game rules and data models in `src/game/`, and all connection code in `src/sockets/`. Put unit and integration tests in `test/`.

Run server tests with `npm.cmd test` from this directory; the package script uses Node's test runner.

For useful Socket.IO diagnostics, use the existing `src/sockets/log.js` helper and the `SOCKET_DEBUG=1` switch. Log event names, outcomes, and small metadata without incoming payload contents. Unexpected server errors are logged even when diagnostics are off.

All command line inputs will be returned back in bash.
