// Maps server game state to the public lobby view sent in events.
import { playersInSeatOrder } from '../seats.js';

/** Include only public seat fields in a LobbyView.
 * @param {import('../types.js').GameState} state
 * @returns {import('../../../../shared/protocol.js').LobbyView}
 */
export function toLobbyView(state) {
  const orderedPlayers = playersInSeatOrder(state.players);

  const publicPlayers = orderedPlayers.map(player => {
    return {
      playerId: player.id,
      displayName: player.displayName,
      seatId: player.seatId,
      connected: player.connected,
      isReady: player.isReady,
    };
  });

  return {
    players: publicPlayers,
  };
}
