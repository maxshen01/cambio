// Shared setup-stage predicates; these do not mutate game state.
/** @typedef {import("./types.js").GameState} GameState */

/** Whether joining and lobby readiness are still available. @param {GameState} state */
export function isUndealtLobby(state) {
  return state.phase === 'deal' && state.players.every(player => player.hand.length === 0);
}

/** Memorization is setup with four complete opening hands, before activation.
 * @param {GameState} state
 */
export function isMemorization(state) {
  return state.phase === 'deal' && state.players.length === 4
    && state.players.every(player => player.hand.length === 4
      && [1, 2, 3, 4].every(id => player.hand.some(slot => slot.handSlotId === id && slot.card != null)));
}

/** Whether four players have ready marks, locking unready before the synchronous deal. @param {GameState} state */
export function isAllReady(state) {
  return state.players.filter(player => player.isReady).length === 4;
}
