// Creates the HTTP and Socket.IO server for the shared game room.

import { createServer as createHttpServer } from "node:http";
import { Server } from "socket.io";
import { createGameState } from "./game/state.js";
import { registerJoinRoom } from "./sockets/joinRoom.js";
import { registerLobbyDisconnect } from "./sockets/disconnect.js";
import { logSocket } from "./sockets/log.js";

/** Build one shared room; injecting state keeps socket tests isolated. */
export function createServer({ gameState = createGameState() } = {}) {
    const httpServer = createHttpServer();
    const io = new Server(httpServer);
    io.on("connection", (socket) => {
        logSocket("info", socket.id, "connection", "connected");
        registerJoinRoom(io, socket, gameState);
        registerLobbyDisconnect(io, socket, gameState);

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
