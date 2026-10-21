# Client directory structure

```text
client/
|-- src/                React application code
|   |-- lobby/          Join flow and lobby components
|   |-- socket/         Socket.IO client connection
|   `-- styles/         Minimal application styles
|-- test/               React component and lobby behavior tests
|-- index.html          Vite HTML entry point
|-- vite.config.js      Development server, proxy, and test configuration
|-- package.json        Package configuration and scripts
`-- package-lock.json   Locked dependencies
```

Place client implementation code in `src/`. Keep the join flow and lobby display in `src/lobby/`, and Socket.IO connection setup in `src/socket/`. Put React tests in `test/` using Vitest and React Testing Library.

Run client tests with `npm.cmd test` and verify production builds with `npm.cmd run build` from this directory.

For useful Socket.IO diagnostics, use the existing `src/socket/log.js` helper and the `VITE_SOCKET_DEBUG=1` switch. Log event names, outcomes, and small metadata such as seat IDs or player counts; omit display names and full event payloads.
