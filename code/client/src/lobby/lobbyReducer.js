// Pure lobby transitions and shared UI/request eligibility, independent of socket effects.
/**
 * @typedef {import('../../../shared/lobbyTypes.js').JoinAck} Identity
 * @typedef {import('../../../shared/lobbyTypes.js').PlayerSummary} PlayerSummary
 * @typedef {import('../../../shared/lobbyTypes.js').LobbyError} LobbyError
 * @typedef {'connecting' | 'connected' | 'failed' | 'lost'} Connection
 * @typedef {{ code: 'CONNECTION_FAILED' | 'CONNECTION_LOST', message: string } | LobbyError} DisplayError
 * @typedef {Object} LobbyState
 * @property {Connection} connection
 * @property {Identity | null} identity
 * @property {PlayerSummary[]} players
 * @property {boolean} pending
 * @property {boolean} readyPending
 * @property {number} nameRevision
 * @property {number | null} submittedNameRevision
 * @property {DisplayError | null} error
 * @typedef {{ type: 'connected' | 'failed' | 'lost' | 'retry' | 'nameChanged' | 'joinStarted' | 'readyStarted' }
 * | { type: 'joined', identity: Identity }
 * | { type: 'players', players: PlayerSummary[] }
 * | { type: 'readyMark', playerId: string, isReady: boolean }
 * | { type: 'error', error: LobbyError }} LobbyAction
 */

/** @param {boolean} connected @returns {LobbyState} */
export function initialLobbyState(connected) {
  return {
    connection: connected ? 'connected' : 'connecting', identity: null, players: [],
    pending: false, readyPending: false, nameRevision: 0, submittedNameRevision: null, error: null,
  };
}

/** Lost connections are terminal; late events cannot restore membership.
 * @param {LobbyState} state @param {LobbyAction} action @returns {LobbyState}
 */
export function lobbyReducer(state, action) {
  if (state.connection === 'lost') return state;
  switch (action.type) {
    case 'connected':
      return { ...state, connection: 'connected', error: null };
    case 'failed':
      return { ...state, connection: 'failed', pending: false, readyPending: false,
        error: { code: 'CONNECTION_FAILED', message: 'Unable to connect to the server.' } };
    case 'lost':
      return { ...state, connection: 'lost', identity: null, players: [], pending: false,
        readyPending: false, submittedNameRevision: null,
        error: { code: 'CONNECTION_LOST', message: 'Connection lost. Reload to rejoin.' } };
    case 'retry':
      return state.connection === 'failed' ? { ...state, connection: 'connecting', error: null } : state;
    case 'nameChanged':
      return { ...state, nameRevision: state.nameRevision + 1,
        error: state.error?.code === 'INVALID_NAME' ? null : state.error };
    case 'joinStarted':
      return { ...state, pending: true, submittedNameRevision: state.nameRevision, error: null };
    case 'joined':
      return state.connection === 'connected' && state.pending
        ? { ...state, pending: false, identity: action.identity } : state;
    case 'players':
      return state.connection === 'connected' ? { ...state, players: action.players } : state;
    case 'readyStarted':
      return { ...state, readyPending: true, error: null };
    case 'readyMark':
      if (state.connection !== 'connected') return state;
      return { ...state,
        players: state.players.map(player => player.playerId === action.playerId
          ? { ...player, isReady: action.isReady } : player),
        readyPending: action.playerId === state.identity?.playerId ? false : state.readyPending };
    case 'error': {
      if (state.connection !== 'connected') return state;
      const stale = action.error.code === 'INVALID_NAME' && state.pending
        && state.submittedNameRevision !== state.nameRevision;
      return { ...state, pending: false, readyPending: false, error: stale ? state.error : action.error };
    }
  }
}

/** Single eligibility calculation used by rendering and request guards.
 * @param {LobbyState} state
 */
export function selectLobby(state) {
  const connected = state.connection === 'connected';
  const localPlayer = state.players.find(player => player.playerId === state.identity?.playerId);
  const joined = Boolean(state.identity && localPlayer);
  const allReady = state.players.filter(player => player.isReady).length === 4;
  return {
    connected, connectionLost: state.connection === 'lost', localPlayer, joined, allReady,
    canJoin: connected && !state.pending && !state.identity,
    canReady: connected && joined && !state.readyPending && (!localPlayer?.isReady || !allReady),
    canRetry: state.connection === 'failed',
  };
}
