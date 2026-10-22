// Frees undealt-lobby seats and sends the public lobby view to survivors.
import { removeLobbyPlayer } from '../game/state.js';
import { toLobbyView } from '../game/lobbyView.js';
import { PLAYER_ROOM } from './joinRoom.js';
import { logSocket } from './log.js';

/** Register cleanup for a seated socket that leaves the undealt lobby. */
export function registerLobbyDisconnect(io, socket, gameState) {
  socket.on('disconnect', reason => {
    logSocket('info', socket.id, 'disconnect', 'disconnected', { reason });
    if (!removeLobbyPlayer(gameState, socket.id)) return;

    const lobbyView = toLobbyView(gameState);
    io.to(PLAYER_ROOM).emit('playerDisconnected', lobbyView);
    logSocket('info', socket.id, 'playerDisconnected', 'broadcast', {
      playerCount: lobbyView.players.length,
    });
  });
}
