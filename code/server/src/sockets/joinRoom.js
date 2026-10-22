// Registers the joinRoom socket handler and emits public lobby updates.

import { JoinRoomError, joinPlayer } from '../game/state.js';
import { toLobbyView } from '../game/lobbyView.js';
import { logSocket, logUnexpectedSocketError } from './log.js';

export const PLAYER_ROOM = 'players';

/** Handle joins; only seated sockets receive the public lobby broadcast. */
export function registerJoinRoom(io, socket, gameState) {
  socket.on('joinRoom', (payload, ack) => {
    try {
      const joinRequest = {
        id: socket.id,
        displayName: payload?.displayName,
      };
      const player = joinPlayer(gameState, joinRequest);
      socket.join(PLAYER_ROOM);
      logSocket('info', socket.id, 'joinRoom', 'accepted', {
        seatId: player.seatId,
        lobbySize: gameState.players.length,
      });

      if (typeof ack === 'function') {
        ack({ playerId: player.id, seatId: player.seatId });
        logSocket('info', socket.id, 'joinRoom', 'acknowledged', { seatId: player.seatId });
      }

      const lobbyView = toLobbyView(gameState);
      io.to(PLAYER_ROOM).emit('playerJoined', lobbyView);
      logSocket('info', socket.id, 'playerJoined', 'broadcast', { room: PLAYER_ROOM });
    } catch (error) {
      if (!(error instanceof JoinRoomError)) {
        logUnexpectedSocketError(socket.id, 'joinRoom', error);
        throw error;
      }

      logSocket('warn', socket.id, 'joinRoom', 'rejected', { code: error.code });
      socket.emit('error', { code: error.code, message: error.message });
    }
  });
}
