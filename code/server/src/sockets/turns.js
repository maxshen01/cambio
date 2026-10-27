// Adapts validated ordinary turns to private draws and ordered public resolution events.
import { drawCard, discardDrawnCard, swapDrawnCard, toDrawnCardView } from '../game/turns.js';
import { PLAYER_ROOM } from './rooms.js';
import { logSocket } from './log.js';

/** Register ordinary deck actions through the shared error boundary.
 * @param {import('./types.js').LobbyServer} io
 * @param {import('./types.js').LobbySocket} socket
 * @param {import('../game/types.js').GameState} state
 * @param {import('./types.js').LobbyBoundary} run
 * @param {() => number} [random]
 */
export function registerTurns(io, socket, state, run, random = Math.random) {
  socket.on('drawCard', payload => run(socket, 'drawCard', () => {
    const player = drawCard(state, socket.id, payload, random);
    for (const recipient of state.players) {
      io.sockets.sockets.get(recipient.id)?.emit('cardDrawn', toDrawnCardView(player, recipient.id));
    }
    logSocket('info', socket.id, 'drawCard', 'accepted', { source: 'deck' });
  }));

  /** Publish resolution immediately; animations never gate server progression. */
  function publishResolution() {
    const top = state.discardPile.cards.at(-1);
    io.to(PLAYER_ROOM).emit('discardPileUpdated', { top: top ? { cardId: top.cardId } : null });
    io.to(PLAYER_ROOM).emit('turnChanged', { playerId: /** @type {string} */ (state.turn) });
  }
  socket.on('discardDrawnCard', () => run(socket, 'discardDrawnCard', () => {
    discardDrawnCard(state, socket.id, random);
    publishResolution();
    logSocket('info', socket.id, 'discardDrawnCard', 'accepted');
  }));
  socket.on('swapDrawnCard', payload => run(socket, 'swapDrawnCard', () => {
    const notice = swapDrawnCard(state, socket.id, payload, random);
    io.to(PLAYER_ROOM).emit('cardSwapped', notice);
    publishResolution();
    logSocket('info', socket.id, 'swapDrawnCard', 'accepted', { handSlotId: notice.target.handSlotId });
  }));
}
