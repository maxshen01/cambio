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

All command line inputs will be returned back in bash.
