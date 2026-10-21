# Cambio server

From this directory, start the server with `npm.cmd start` in PowerShell. It listens on port `3000` unless `PORT` is set.

To show Socket.IO diagnostics in the terminal, run:

```powershell
$env:SOCKET_DEBUG='1'; npm.cmd start
```

Each diagnostic line includes a timestamp, socket ID, event name, and outcome. Incoming payload contents are not logged. Unexpected server errors are printed even when diagnostics are off. No log file is created.

In Postman, create a **Socket.IO** request to `ws://localhost:3000`. Set the event name to `joinRoom`, send `{"displayName":"Alice"}` as its JSON argument, enable **Ack**, and listen for `playerJoined` and `error`. If the event name is left blank, Postman sends `message`; the terminal will show it as `unhandled`.

Run the automated checks with `npm.cmd test`.
