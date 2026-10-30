// Projects a validated domain peek without leaking the card object or unauthorized faces.
/** @param {ReturnType<typeof import('../powers.js').choosePowerTargets>} result
 * @param {string} powerUserId @param {string} recipientId
 * @returns {import('../../../../shared/protocol.js').PowerPeekResult}
 */
export function toPowerPeekResult(result, powerUserId, recipientId) {
  const { playerId, handSlotId } = result.target;
  return { targets: [recipientId === powerUserId
    ? { playerId, handSlotId, faceUp: true, cardId: result.card.cardId }
    : { playerId, handSlotId, faceUp: false }] };
}
