// Builds the pending drawn-card view authorized for one recipient.
/** Project only the pending card face authorized for this recipient.
 * @param {import('../types.js').Player} player @param {string} recipientId
 * @returns {import('../../../../shared/lobbyTypes.js').DrawnCardView}
 */
export function toDrawnCardView(player, recipientId) {
  if (!player.drawnCard) throw new Error('No pending drawn card to project');
  return player.id === recipientId
    ? { playerId: player.id, faceUp: true, cardId: player.drawnCard.cardId }
    : { playerId: player.id, faceUp: false };
}
