// Builds the pending drawn-card view authorized for one recipient.
/** Project the authoritative source and only the face authorized for this recipient.
 * @param {import('../types.js').Player} player @param {string} recipientId
 * @returns {import('../../../../shared/lobbyTypes.js').CardDrawnNotice}
 */
export function toDrawnCardView(player, recipientId) {
  if (!player.drawnCard) throw new Error('No pending drawn card to project');
  const source = player.drawnFrom;
  if (!source) throw new Error('No pending draw source to project');
  return player.drawnFrom === 'discard' || player.id === recipientId
    ? { playerId: player.id, source, faceUp: true, cardId: player.drawnCard.cardId }
    : { playerId: player.id, source, faceUp: false };
}
