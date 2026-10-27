// Applies internal actions to one consistent view; network effects live in the hooks.
import {
  applyDeal, beginTurn, clearDisconnectedSession, confirmReadiness,
  receiveDrawnCard, resolveDiscard, resolveSwap, returnToLobby,
} from './gameTransitions.js';

/** Lost sessions cannot be restored by late actions.
 * @param {import('./gameClientState.js').GameClientState} state
 * @param {import('./gameClientState.js').GameClientAction} action
 * @returns {import('./gameClientState.js').GameClientState}
 */
export function gameClientReducer(state, action) {
  if (state.connection === 'lost') return state;
  switch (action.type) {
    case 'connectionEstablished':
      return { ...state, connection: 'connected', error: null };
    case 'connectionFailed':
      return { ...state, connection: 'failed', joinPending: false, readyPending: false, turnPending: false,
        error: { code: 'CONNECTION_FAILED', message: 'Unable to connect to the server.' } };
    case 'connectionLost':
      return clearDisconnectedSession(state);
    case 'connectionRetryStarted':
      return state.connection === 'failed' ? { ...state, connection: 'connecting', error: null } : state;
    case 'nameEdited':
      return { ...state, nameRevision: state.nameRevision + 1,
        error: state.error?.code === 'INVALID_NAME' ? null : state.error };
    case 'joinRequested':
      return { ...state, joinPending: true, submittedNameRevision: state.nameRevision, error: null };
    case 'joinAcknowledged':
      return state.connection === 'connected' && state.joinPending
        ? { ...state, joinPending: false, identity: action.identity } : state;
    case 'playersReceived':
      return state.connection === 'connected' ? { ...state, players: action.players } : state;
    case 'playerDepartureReceived':
      return state.connection === 'connected' ? returnToLobby(state, action.players) : state;
    case 'dealReceived':
      return applyDeal(state, action.cards);
    case 'readinessReceived':
      return confirmReadiness(state, action.playerId, action.isReady);
    case 'turnChanged':
      return beginTurn(state, action.playerId);
    case 'turnActionRequested':
      return { ...state, turnPending: true, error: null };
    case 'drawnCardReceived':
      return receiveDrawnCard(state, action.card);
    case 'discardPileReceived':
      return resolveDiscard(state, action.top);
    case 'cardSwapReceived':
      return resolveSwap(state, action.notice);
    case 'readyRequested':
      return { ...state, readyPending: true, error: null };
    case 'serverErrorReceived': {
      if (state.connection !== 'connected') return state;
      const stale = action.error.code === 'INVALID_NAME' && state.joinPending
        && state.submittedNameRevision !== state.nameRevision;
      return { ...state, joinPending: false, readyPending: false, turnPending: false,
        error: stale ? state.error : action.error };
    }
  }
}
