// Frees setup seats, discards memorization deals, and sends the public lobby view to survivors.
import { removeLobbyPlayer } from '../game/lobby.js';
import { toLobbyView } from '../game/lobbyView.js';
import { PLAYER_ROOM } from './rooms.js';
import { logSocket } from './log.js';

/** Register departure cleanup for both lobby and memorization setup stages.
 * @param {import('./types.js').LobbyServer} io
 * @param {import('./types.js').LobbySocket} socket
 * @param {import('../game/types.js').GameState} gameState
 * @param {import('./types.js').LobbyBoundary} run
 */
export function registerLobbyDisconnect(io, socket, gameState, run) {
  socket.on('disconnect', reason => run(socket, 'disconnect', () => {
    logSocket('info', socket.id, 'disconnect', 'disconnected', { reason });
    if (!removeLobbyPlayer(gameState, socket.id)) return;

    const lobbyView = toLobbyView(gameState);
    io.to(PLAYER_ROOM).emit('playerDisconnected', lobbyView);
    logSocket('info', socket.id, 'playerDisconnected', 'broadcast', {
      playerCount: lobbyView.players.length,
    });
  }));
}
