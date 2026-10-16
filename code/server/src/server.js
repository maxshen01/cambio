// Creates the HTTP and Socket.IO server for the shared game room.

import { createServer as createHttpServer } from 'node:http';
import { Server } from 'socket.io';
import { createGameState } from './game/state.js';
import { registerJoinRoom } from './sockets/joinRoom.js';

/** Build one shared room; injecting state keeps socket tests isolated. */
export function createServer({ gameState = createGameState() } = {}) {
  const httpServer = createHttpServer();
  const io = new Server(httpServer);
  io.on('connection', socket => {
    registerJoinRoom(io, socket, gameState);
  });

  return { httpServer, io, gameState };
}
