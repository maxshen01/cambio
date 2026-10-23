// Adapts undealt-lobby readiness actions to public server-confirmed marks.
import { readyPlayer, unreadyPlayer } from '../game/lobby.js';
import { PLAYER_ROOM } from './rooms.js';
import { logSocket } from './log.js';

/** Register readiness actions, which intentionally have no acknowledgement.
 * @param {import('./types.js').LobbyServer} io
 * @param {import('./types.js').LobbySocket} socket
 * @param {import('../game/types.js').GameState} gameState
 * @param {import('./types.js').LobbyBoundary} run
 */
export function registerReady(io, socket, gameState, run) {
  /** @param {'ready' | 'unready'} event */
  function changeReady(event) {
    run(socket, event, () => {
      const changed = (event === 'ready' ? readyPlayer : unreadyPlayer)(gameState, socket.id);
      if (!changed) {
        logSocket('info', socket.id, event, 'duplicate');
        return;
      }
      io.to(PLAYER_ROOM).emit(event === 'ready' ? 'playerReady' : 'playerUnready', { playerId: socket.id });
      logSocket('info', socket.id, event, 'accepted', {
        readyCount: gameState.players.filter(player => player.isReady).length,
      });
    });
  }
  socket.on('ready', () => changeReady('ready'));
  socket.on('unready', () => changeReady('unready'));
}
