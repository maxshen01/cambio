# Cambio client

Run the server from `code/server` with `npm.cmd start`. In another PowerShell terminal, run the client from this directory with `npm.cmd run dev` and open the URL Vite prints (normally `http://localhost:5173`). Each browser tab creates its own Socket.IO connection. Enter a name in the opening dialog and click **Join lobby** to see the shared seats update.

The Vite development server proxies `/socket.io` to `http://localhost:3000`. The name input has no browser autocomplete or spelling suggestions. A rejected-name error clears when you edit the name. **Ready Up** becomes available once your seat appears, even before the lobby fills. It changes to **Unready** after the server marks you ready; either action updates the seat marks only after a server event. Four ready players remain in the lobby with Unready locked until a departure lowers the ready count. Dealing and memorization readiness are deferred.

To log connection and lobby events in the browser console, start the client with:

```powershell
$env:VITE_SOCKET_DEBUG='1'; npm.cmd run dev
```

Logs include event names, outcomes, seat IDs, and player counts. They omit display names and full event payloads.

Run component and real-socket integration tests with `npm.cmd test`. Build the client with `npm.cmd run build`.
