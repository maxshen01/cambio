// Uses the same stable seating rotation for the lobby and game board.
const positions = ['bottom', 'left', 'top', 'right'];

/** Keep the local seat at the bottom and vacant seats in their assigned positions.
 * @param {number} seatId @param {number} localSeatId
 */
export function getSeatPosition(seatId, localSeatId) {
  return positions[(seatId - localSeatId + 4) % 4];
}
