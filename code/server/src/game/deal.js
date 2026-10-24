// Creates an opening deal and projects only the faces authorized for each recipient.
import { createDeck, shuffleDeck } from './deck.js';
import { isUndealtLobby } from './lobby.js';
import { createGameState } from './state.js';
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
  // A fresh room supplies the full reset, while identities and stable seats survive.
  Object.assign(state, createGameState(), { players, deck: { cards } });
  for (const player of players) {
    Object.assign(player, {
      hand: [], isReady: false, drawnCard: null, drawnFrom: null,
      drawnCardRevealed: false, score: 0, calledCambio: false,
    });
  }
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

/** Build a separate public payload without copying hidden card metadata.
 * @param {GameState} state
 * @param {string} recipientId
 * @returns {import('../../../shared/lobbyTypes.js').DealComplete}
 */
export function toDealView(state, recipientId) {
  return {
    cards: [...state.players].sort((a, b) => a.seatId - b.seatId).flatMap(player =>
      [...player.hand].sort((a, b) => a.handSlotId - b.handSlotId).map(slot => {
        const ref = { playerId: player.id, handSlotId: slot.handSlotId };
        if (player.id === recipientId && (slot.handSlotId === 2 || slot.handSlotId === 4)) {
          return { ...ref, faceUp: true, cardId: slot.card.cardId };
        }
        return { ...ref, faceUp: false };
      }),
    ),
  };
}
