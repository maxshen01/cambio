// Handles setup departures and ordered departure/abort notifications during live play.
import { removeLobbyPlayer } from '../../game/lobby.js';
import { toLobbyView } from '../../game/views/lobbyView.js';
import { PLAYER_ROOM } from '../rooms.js';
import { logSocket } from '../log.js';
import { isLiveGame } from '../../game/recovery.js';
import { abortGame } from '../abort.js';

/** Register departure cleanup for setup and live play.
 * @param {import('../types.js').GameServer} io
 * @param {import('../types.js').GameSocket} socket
 * @param {import('../../game/types.js').GameState} gameState
 * @param {import('../types.js').GameBoundary} run
 */
export function registerDisconnect(io, socket, gameState, run) {
  socket.on('disconnect', reason => run(socket, 'disconnect', () => {
    logSocket('info', socket.id, 'disconnect', 'disconnected', { reason });
    if (isLiveGame(gameState)) {
      const player = gameState.players.find(player => player.id === socket.id);
      if (!player || !player.connected) return;
      player.connected = false;
      io.to(PLAYER_ROOM).emit('playerDisconnected', toLobbyView(gameState));
      abortGame(io, gameState, { reason: 'PLAYER_DISCONNECTED', playerId: player.id });
      logSocket('info', socket.id, 'gameAborted', 'broadcast', { reason: 'PLAYER_DISCONNECTED' });
      return;
    }
    if (!removeLobbyPlayer(gameState, socket.id)) return;

    const lobbyView = toLobbyView(gameState);
    io.to(PLAYER_ROOM).emit('playerDisconnected', lobbyView);
    logSocket('info', socket.id, 'playerDisconnected', 'broadcast', {
      playerCount: lobbyView.players.length,
    });
  }));
}
