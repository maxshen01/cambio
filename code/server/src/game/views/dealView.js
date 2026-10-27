// Builds the opening card view authorized for one recipient.
/** @typedef {import('../types.js').GameState} GameState */

/** Build a separate public payload without copying hidden card metadata.
 * @param {GameState} state
 * @param {string} recipientId
 * @returns {import('../../../../shared/lobbyTypes.js').DealComplete}
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
