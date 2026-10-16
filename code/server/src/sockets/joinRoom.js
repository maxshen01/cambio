// Registers the joinRoom socket handler and emits public lobby updates.

import { JoinRoomError, joinPlayer } from '../game/state.js';
import { toLobbyView } from '../game/lobbyView.js';

const PLAYER_ROOM = 'players';

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

      if (typeof ack === 'function') {
        ack({ playerId: player.id, seatId: player.seatId });
      }

      const lobbyView = toLobbyView(gameState);
      io.to(PLAYER_ROOM).emit('playerJoined', lobbyView);
    } catch (error) {
      if (!(error instanceof JoinRoomError)) {
        throw error;
      }

      socket.emit('error', { code: error.code, message: error.message });
    }
  });
}
