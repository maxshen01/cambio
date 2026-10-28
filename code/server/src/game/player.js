// Owns player construction and reset boundaries for mutable round state.
/** @typedef {import('./types.js').Player} Player */

/** Create an independent player from validated identity and an allocated seat.
 * @param {{ id: string, displayName: string, seatId: Player['seatId'] }} identity
 * @returns {Player}
 */
export function createPlayer({ id, displayName, seatId }) {
  return { id, displayName, seatId, connected: true, ...roundDefaults() };
}

/** Fresh round fields, shared by construction and reset. */
function roundDefaults() {
  return { hand: /** @type {Player['hand']} */ ([]), isReady: false,
    ...drawDefaults(), score: 0, calledCambio: false };
}

/** Pending-card fields always clear together. */
function drawDefaults() {
  return { drawnCard: null, drawnFrom: null, drawnCardRevealed: false };
}

/** Clear pending-card ownership and visibility together. @param {Player} player */
export function clearDrawnCard(player) {
  Object.assign(player, drawDefaults());
}

/** Preserve identity and connection while clearing all round fields. @param {Player} player */
export function resetPlayerForRound(player) {
  Object.assign(player, roundDefaults());
}
