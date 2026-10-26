// Starts the first turn once the four players have confirmed memorization.
import { isMemorization } from './lobby.js';

/** Choose the starter once; call after broadcasting the fourth playerReady notice.
 * @param {import('./types.js').GameState} state
 * @param {() => number} [random] Uniform sample in [0, 1).
 * @returns {boolean}
 */
export function startPlayIfReady(state, random = Math.random) {
  if (!isMemorization(state) || !state.players.every(player => player.connected && player.isReady)) return false;
  const players = [...state.players].sort((a, b) => a.seatId - b.seatId);
  const starter = players[Math.floor(random() * players.length)];
  state.phase = 'active';
  state.turn = starter.id;
  state.turnStep = 'awaitingDraw';
  return true;
}
