// Round aborts retain connected identities and seats while clearing all gameplay state.
import { resetSetup } from './state.js';

/** @param {import('./types.js').GameState} state */
export function isLiveGame(state) {
  return state.phase === 'active' || state.phase === 'finalRound';
}

/** Remove departed seats and reset survivors in the same authoritative state object.
 * @param {import('./types.js').GameState} state
 */
export function resetAbortedGame(state) {
  resetSetup(state, state.players.filter(player => player.connected));
}
