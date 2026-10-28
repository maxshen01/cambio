# Cambio server

Node.js/Socket.IO server owning the shared room, authoritative card state, and action validation.

See the [root README](../../README.md) for current implementation capabilities, limitations, and coverage.

Complete [environment setup](../Development.md#stack-and-setup), including the local `.env` file. From this directory:

```powershell
npm.cmd install
npm.cmd start
```

The server listens on port 3000 unless `PORT` is set.

See [Development](../Development.md) for diagnostics, Postman inspection, [focused/file/name commands](../Development.md#server-commands), and the [pre-merge gate](../Development.md#pre-merge-gate). Specifications: [Game Rules](../../project-managment/Game%20Rules.md), [Game Data Model](../../project-managment/Game%20Data%20Model.md), and [Events Contract](../../project-managment/Events%20Contract.md). [Test Scenarios](../../project-managment/Test%20Scenarios.md) defines acceptance and manual validation.
