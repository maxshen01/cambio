// Validates outgoing player requests and acquires immediate locks before React rerenders.
import { useCallback } from 'react';
import { checkDisplayName } from '../../../shared/displayName.js';
import { logClientEvent } from '../socket/log.js';
import { selectGameClient } from './gameSelectors.js';

/** Commands share the same session locks used by incoming confirmations and cleanup.
 * @param {{ socket: import('./sessionControl.js').GameSocket,
 * dispatch: import('./sessionControl.js').ClientDispatch,
 * session: import('./sessionControl.js').SessionRef }} options
 */
export function useGameActions({ socket, dispatch, session }) {
  const control = session.current;
  const current = () => selectGameClient(control.state);
  const notifyNameChanged = useCallback(() => dispatch({ type: 'nameEdited' }), [dispatch]);

  /** Retry initial failures on the same socket, without automatic reconnection. */
  function retryConnection() {
    if (!current().permissions.canRetry || control.connecting || control.lost) return;
    control.connecting = true;
    dispatch({ type: 'connectionRetryStarted' });
    logClientEvent('connect', 'retry');
    socket.connect();
  }

  /** @param {string} displayName */
  function joinLobby(displayName) {
    const checked = checkDisplayName(displayName);
    if (!current().permissions.canJoin || !socket.connected || control.joinPending || control.lost
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
    const { view, permissions } = current();
    const state = control.state;
    if (!permissions.canReady || !socket.connected || control.readyPlayerId || control.lost) return;
    const localPlayer = view.localPlayer;
    if (!localPlayer) return;
    const event = state.stage === 'lobby' && localPlayer.isReady ? 'unready' : 'ready';
    control.readyPlayerId = localPlayer.playerId;
    dispatch({ type: 'readyRequested' });
    socket.emit(event, {});
    logClientEvent(event, 'sent');
  }

  /** Share one lock across ordinary and power requests, using the latest session state.
   * @param {keyof import('./gameSelectors.js').GamePermissions} permission
   * @param {import('./gameClientState.js').PowerAction | null} [powerAction]
   */
  function beginTurnRequest(permission, powerAction = null) {
    if (!current().permissions[permission] || !socket.connected || control.socket !== socket
      || control.turnPending || control.lost || !control.active) return false;
    control.turnPending = true;
    dispatch(powerAction ? { type: 'powerActionRequested', action: powerAction } : { type: 'turnActionRequested' });
    return true;
  }
  function drawFromDeck() {
    if (!beginTurnRequest('canDraw')) return;
    socket.emit('drawCard', { source: 'deck' });
    logClientEvent('drawCard', 'sent');
  }
  function drawFromDiscard() {
    if (!beginTurnRequest('canDrawDiscard')) return;
    socket.emit('drawCard', { source: 'discard' });
    logClientEvent('drawCard', 'sent', { source: 'discard' });
  }
  function discardDrawnCard() {
    if (!beginTurnRequest('canDiscardDrawn')) return;
    socket.emit('discardDrawnCard', {});
    logClientEvent('discardDrawnCard', 'sent');
  }
  /** @param {import('../../../shared/protocol.js').HandSlotId} handSlotId */
  function replaceHandCard(handSlotId) {
    const state = control.state;
    if (!state.identity || !state.cards.some(card => card.playerId === state.identity?.playerId && card.handSlotId === handSlotId)
      || !beginTurnRequest('canReplace')) return;
    socket.emit('swapDrawnCard', { target: { playerId: state.identity.playerId, handSlotId } });
    logClientEvent('swapDrawnCard', 'sent');
  }

  /** Activate first; the public reveal confirms when target selection may begin. */
  function usePower() {
    if (!beginTurnRequest('canUsePower', 'usePower')) return;
    socket.emit('usePower', {});
    logClientEvent('usePower', 'sent');
  }

  /** Check current occupancy and power-specific ownership before locking the request.
   * @param {import('../../../shared/protocol.js').HandSlotRef} target
   */
  function choosePowerTargets(target) {
    const state = control.state;
    if (!state.identity || !target || !state.powerPrompt
      || (state.powerPrompt.power === 'selfPeek' ? target.playerId !== state.identity.playerId : target.playerId === state.identity.playerId)
      || !state.cards.some(card => card.playerId === target.playerId && card.handSlotId === target.handSlotId)
      || !beginTurnRequest('canChoosePowerTargets', 'choosePowerTargets')) return;
    socket.emit('choosePowerTargets', { peekTarget: { playerId: target.playerId, handSlotId: target.handSlotId } });
    logClientEvent('choosePowerTargets', 'sent');
  }
  function skipPower() {
    if (!beginTurnRequest('canSkipPower', 'skipPower')) return;
    socket.emit('skipPower', {});
    logClientEvent('skipPower', 'sent');
  }
  function finishPowerPeek() {
    if (!beginTurnRequest('canFinishPowerPeek', 'finishPowerPeek')) return;
    socket.emit('finishPowerPeek', {});
    logClientEvent('finishPowerPeek', 'sent');
  }

  return { joinLobby, notifyNameChanged, toggleReady, retryConnection,
    drawFromDeck, drawFromDiscard, discardDrawnCard, replaceHandCard, usePower, choosePowerTargets, skipPower, finishPowerPeek };
}
