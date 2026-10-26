# Client directory structure

```text
client/
|-- src/                React application code
|   |-- lobby/          Join flow and lobby components
|   |-- socket/         Socket.IO client connection
|   `-- styles/         Minimal application styles
|-- test/               Feature folders: lobby, setup, cards, recovery; shared helpers
|-- index.html          Vite HTML entry point
|-- vite.config.js      Development server, proxy, and test configuration
|-- package.json        Package configuration and scripts
`-- package-lock.json   Locked dependencies
```

Place client implementation code in `src/`. Keep the join flow and lobby display in `src/lobby/`, and Socket.IO connection setup in `src/socket/`. Put React tests in `test/` using Vitest and React Testing Library.

Run client tests with `npm.cmd test` and verify production builds with `npm.cmd run build` from this directory.

Keep tests in `test/<feature>/`: `.unit.test.js` for isolated logic, `.component.test.jsx` for fake-socket React checks, and `.integration.test.js(x)` for real-socket behavior. Put shared setup and fake sockets in `test/helpers/`, outside test discovery. Group cross-feature scenarios by their primary behavior and keep representative transitions intact.

During development use `npm.cmd run test:lobby`, `test:setup`, `test:cards`, or `test:recovery`; use `test:fast` for units/components and `test:integration` for real sockets. These scripts must fail on empty selections. Add a matching script when a new feature folder is introduced, with fixtures independent of lobby tests. See README.md for file/name selection and watch commands. Before merging, run both packages' complete suites and type checks and the client production build.

For useful Socket.IO diagnostics, use the existing `src/socket/log.js` helper and the `VITE_SOCKET_DEBUG=1` switch. Log event names, outcomes, and small metadata such as seat IDs or player counts; omit display names and full event payloads.
