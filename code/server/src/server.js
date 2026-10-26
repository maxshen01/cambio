// Creates the HTTP and Socket.IO server for the shared game room.

import { createServer as createHttpServer } from "node:http";
import { Server } from "socket.io";
import { createGameState } from "./game/state.js";
import { registerJoinRoom } from "./sockets/joinRoom.js";
import { registerLobbyDisconnect } from "./sockets/disconnect.js";
import { registerReady } from "./sockets/ready.js";
import { logSocket } from "./sockets/log.js";
import { createLobbyBoundary } from "./sockets/boundary.js";

/** Build one shared room; injecting state keeps socket tests isolated.
 * @param {{ gameState?: import('./game/types.js').GameState, random?: () => number }} options
 */
export function createServer({ gameState = createGameState(), random = Math.random } = {}) {
    const httpServer = createHttpServer();
    /** @type {import('./sockets/types.js').LobbyServer} */
    const io = new Server(httpServer);
    const run = createLobbyBoundary(io, gameState);
    io.on("connection", (socket) => {
        logSocket("info", socket.id, "connection", "connected");
        registerJoinRoom(io, socket, gameState, run);
        registerReady(io, socket, gameState, run, random);
        registerLobbyDisconnect(io, socket, gameState, run);

        socket.onAny((eventName, ...args) => {
            const outcome =
                socket.listenerCount(eventName) > 0 ? "received" : "unhandled";
            const hasAck = typeof args.at(-1) === "function";
            logSocket(
                outcome === "unhandled" ? "warn" : "info",
                socket.id,
                eventName,
                outcome,
                { hasAck },
            );
        });
    });

    return { httpServer, io, gameState };
}
