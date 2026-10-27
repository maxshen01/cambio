// Creates an opening deal once all four players are connected and ready.
import { createDeck, shuffleDeck } from './deck.js';
import { isUndealtLobby } from './lobby.js';
import { resetSetup } from './state.js';
/** @typedef {import('./types.js').GameState} GameState */

/** Deal once all four seats are connected and ready; ineligible rooms stay unchanged.
 * Call only after broadcasting the fourth lobby playerReady notice.
 * @param {GameState} state
 * @param {() => number} [random]
 * @returns {boolean}
 */
export function dealIfReady(state, random = Math.random) {
  if (!isUndealtLobby(state) || state.players.length !== 4
    || !state.players.every(player => player.connected && player.isReady)
    || ![1, 2, 3, 4].every(seat => state.players.some(player => player.seatId === seat))) {
    return false;
  }

  const cards = shuffleDeck(createDeck(), random);
  const players = [...state.players].sort((a, b) => a.seatId - b.seatId);
  resetSetup(state, players);
  state.deck.cards = cards;
  /** @type {(1 | 2 | 3 | 4)[]} */
  const slots = [1, 2, 3, 4];
  for (const handSlotId of slots) {
    for (const player of players) {
      const card = cards.pop();
      if (!card) throw new Error('Opening deck exhausted');
      player.hand.push({ handSlotId, card });
    }
  }
  return true;
}
