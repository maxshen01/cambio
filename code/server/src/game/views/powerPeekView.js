// Projects a validated domain peek without leaking the card object or unauthorized faces.
/** @param {Extract<ReturnType<typeof import('../powers.js').choosePowerTargets>, { kind: 'peek' }>} result
 * @param {string} powerUserId @param {string} recipientId
 * @returns {import('../../../../shared/protocol.js').PowerPeekResult}
 */
export function toPowerPeekResult(result, powerUserId, recipientId) {
  return { targets: result.targets.map(({ target: { playerId, handSlotId }, card }) => recipientId === powerUserId
    ? { playerId, handSlotId, faceUp: true, cardId: card.cardId }
    : { playerId, handSlotId, faceUp: false }) };
}
