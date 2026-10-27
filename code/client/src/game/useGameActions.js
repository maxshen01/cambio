// Validates outgoing player requests and acquires immediate locks before React rerenders.
import { useCallback } from 'react';
import { checkDisplayName } from '../../../shared/displayName.js';
import { logClientEvent } from '../socket/log.js';

/** Commands share the same session locks used by incoming confirmations and cleanup.
 * @param {{ socket: import('./sessionControl.js').GameSocket,
 * state: import('./gameClientState.js').GameClientState,
 * view: import('./gameSelectors.js').GameView,
 * permissions: import('./gameSelectors.js').GamePermissions,
 * dispatch: import('./sessionControl.js').ClientDispatch,
 * session: import('./sessionControl.js').SessionRef }} options
 */
export function useGameActions({ socket, state, view, permissions, dispatch, session }) {
  const control = session.current;
  const notifyNameChanged = useCallback(() => dispatch({ type: 'nameEdited' }), [dispatch]);

  /** Retry initial failures on the same socket, without automatic reconnection. */
  function retryConnection() {
    if (!permissions.canRetry || control.connecting || control.lost) return;
    control.connecting = true;
    dispatch({ type: 'connectionRetryStarted' });
    logClientEvent('connect', 'retry');
    socket.connect();
  }

  /** @param {string} displayName */
  function joinLobby(displayName) {
    const checked = checkDisplayName(displayName);
    if (!permissions.canJoin || !socket.connected || control.joinPending || control.lost
      || checked.name === null) return;
    control.joinPending = true;
    const generation = control.generation;
    dispatch({ type: 'joinRequested' });
    logClientEvent('joinRoom', 'sent');
    socket.emit('joinRoom', { displayName: checked.name }, identity => {
      if (!control.active || control.lost || !socket.connected
        || control.generation !== generation || !control.joinPending) return;
      dispatch({ type: 'joinAcknowledged', identity });
      logClientEvent('joinRoom', 'acknowledged', { seatId: identity.seatId });
    });
  }

  function toggleReady() {
    if (!permissions.canReady || !socket.connected || control.readyPlayerId || control.lost) return;
    const localPlayer = view.localPlayer;
    if (!localPlayer) return;
    const event = state.stage === 'lobby' && localPlayer.isReady ? 'unready' : 'ready';
    control.readyPlayerId = localPlayer.playerId;
    dispatch({ type: 'readyRequested' });
    socket.emit(event, {});
    logClientEvent(event, 'sent');
  }

  /** Guard before React rerenders so overlapping draw/discard/swap clicks send once.
   * @param {boolean} eligible
   */
  function beginTurnRequest(eligible) {
    if (!eligible || !socket.connected || control.turnPending || control.lost || !control.active) return false;
    control.turnPending = true;
    dispatch({ type: 'turnActionRequested' });
    return true;
  }
  function drawFromDeck() {
    if (!beginTurnRequest(permissions.canDraw)) return;
    socket.emit('drawCard', { source: 'deck' });
    logClientEvent('drawCard', 'sent');
  }
  function discardDrawnCard() {
    if (!beginTurnRequest(permissions.canResolve)) return;
    socket.emit('discardDrawnCard', {});
    logClientEvent('discardDrawnCard', 'sent');
  }
  /** @param {import('../../../shared/lobbyTypes.js').HandSlotId} handSlotId */
  function replaceHandCard(handSlotId) {
    if (!state.identity || !state.cards.some(card => card.playerId === state.identity?.playerId && card.handSlotId === handSlotId)
      || !beginTurnRequest(permissions.canResolve)) return;
    socket.emit('swapDrawnCard', { target: { playerId: state.identity.playerId, handSlotId } });
    logClientEvent('swapDrawnCard', 'sent');
  }

  return { joinLobby, notifyNameChanged, toggleReady, retryConnection,
    drawFromDeck, discardDrawnCard, replaceHandCard };
}
