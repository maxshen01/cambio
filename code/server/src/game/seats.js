// Stable seats define allocation and clockwise order independently of insertion order.
/** @typedef {import('./types.js').Player} Player */
/** @type {ReadonlyArray<Player['seatId']>} */
export const SEATS = Object.freeze([1, 2, 3, 4]);

/** Return a sorted copy without rearranging state. @param {Player[]} players */
export function playersInSeatOrder(players) {
  return [...players].sort((first, second) => first.seatId - second.seatId);
}

/** Allocate the lowest vacant seat. @param {Player[]} players */
export function findAvailableSeat(players) {
  const occupied = new Set(players.map(player => player.seatId));
  return SEATS.find(seat => !occupied.has(seat));
}

/** Advance clockwise, wrapping to the first occupied seat.
 * @param {Player[]} players @param {string} playerId
 */
export function nextPlayerInSeatOrder(players, playerId) {
  const ordered = playersInSeatOrder(players);
  return ordered[(ordered.findIndex(player => player.id === playerId) + 1) % ordered.length];
}
