// Mutable connection guards and request locks; these must update before a React render.
/** @typedef {import('socket.io-client').Socket<import('../../../shared/protocol.js').ServerEvents, import('../../../shared/protocol.js').ClientEvents>} GameSocket */
/** @typedef {import('react').Dispatch<import('./gameClientState.js').GameClientAction>} ClientDispatch */
/** @typedef {{ generation: number, active: boolean, lost: boolean, connecting: boolean,
 * joinPending: boolean, readyPlayerId: string | null, turnPending: boolean }} SessionControl */
/** @typedef {import('react').RefObject<SessionControl>} SessionRef */

/** The composition hook retains one control object for its entire mounted session.
 * @returns {SessionControl}
 */
export function createSessionControl() {
  return { generation: 0, active: false, lost: false, connecting: false,
    joinPending: false, readyPlayerId: null, turnPending: false };
}

/** Confirmations, rejections, and resets release action locks, independently of connection attempts.
 * @param {SessionControl} control
 */
export function clearActionRequests(control) {
  control.joinPending = false;
  control.readyPlayerId = null;
  control.turnPending = false;
}
