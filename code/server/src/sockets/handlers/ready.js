// Confirms setup readiness, privately deals, and broadcasts the first active turn.
import { readyPlayer, unreadyPlayer, dealIfReady, startPlayIfReady } from '../../game/setup.js';
import { toDealView } from '../../game/views/dealView.js';
import { PLAYER_ROOM } from '../rooms.js';
import { logSocket } from '../log.js';

/** Register readiness actions, which intentionally have no acknowledgement.
 * @param {import('../types.js').GameServer} io
 * @param {import('../types.js').GameSocket} socket
 * @param {import('../../game/types.js').GameState} gameState
 * @param {import('../types.js').GameBoundary} run
 * @param {() => number} [random]
 */
export function registerReady(io, socket, gameState, run, random = Math.random) {
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
      if (event === 'ready' && dealIfReady(gameState, random)) {
        for (const player of gameState.players) {
          io.sockets.sockets.get(player.id)?.emit('dealComplete', toDealView(gameState, player.id));
        }
        logSocket('info', socket.id, 'dealComplete', 'sent', { playerCount: gameState.players.length });
      } else if (event === 'ready' && startPlayIfReady(gameState, random)) {
        io.to(PLAYER_ROOM).emit('turnChanged', { playerId: /** @type {string} */ (gameState.turn) });
        logSocket('info', socket.id, 'turnChanged', 'sent');
      }
    });
  }
  socket.on('ready', () => changeReady('ready'));
  socket.on('unready', () => changeReady('unready'));
}
