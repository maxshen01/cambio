// Server-confirmed setup and ordinary turns; private faces and pending requests clear on loss.
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
 * @property {'lobby' | 'memorization' | 'active'} stage
 * @property {string | null} turnPlayerId
 * @property {import('../../../shared/lobbyTypes.js').DrawnCardView | null} drawnCard
 * @property {import('../../../shared/lobbyTypes.js').DiscardView | null} discardTop
 * @property {boolean} turnPending
 * @property {boolean} awaitingTurn
 * @property {number} movementId
 * @property {{ id: number, kind: 'draw' | 'discard' | 'swap', target?: import('../../../shared/lobbyTypes.js').HandSlotRef } | null} movement
 * @property {import('../../../shared/lobbyTypes.js').CardView[]} cards
 * @property {boolean} pending
 * @property {boolean} readyPending
 * @property {number} nameRevision
 * @property {number | null} submittedNameRevision
 * @property {DisplayError | null} error
 * @typedef {{ type: 'connected' | 'failed' | 'lost' | 'retry' | 'nameChanged' | 'joinStarted' | 'readyStarted' | 'turnStarted' }
 * | { type: 'joined', identity: Identity }
 * | { type: 'players', players: PlayerSummary[] }
 * | { type: 'departure', players: PlayerSummary[] }
 * | { type: 'deal', cards: import('../../../shared/lobbyTypes.js').CardView[] }
 * | { type: 'readyMark', playerId: string, isReady: boolean }
 * | { type: 'turn', playerId: string }
 * | { type: 'drawn', card: import('../../../shared/lobbyTypes.js').DrawnCardView }
 * | { type: 'pile', top: import('../../../shared/lobbyTypes.js').DiscardView | null }
 * | { type: 'swapped', notice: import('../../../shared/lobbyTypes.js').DrawnSwapNotice }
 * | { type: 'error', error: LobbyError }} LobbyAction
 */

/** @param {boolean} connected @returns {LobbyState} */
export function initialLobbyState(connected) {
  return {
    connection: connected ? 'connected' : 'connecting', identity: null, players: [], stage: 'lobby', cards: [], turnPlayerId: null,
    drawnCard: null, discardTop: null, turnPending: false, awaitingTurn: false, movement: null, movementId: 0,
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
      return { ...state, connection: 'failed', pending: false, readyPending: false, turnPending: false,
        error: { code: 'CONNECTION_FAILED', message: 'Unable to connect to the server.' } };
    case 'lost':
      return { ...state, connection: 'lost', identity: null, players: [], pending: false,
        readyPending: false, submittedNameRevision: null, stage: 'lobby', cards: [], turnPlayerId: null,
        drawnCard: null, discardTop: null, turnPending: false, awaitingTurn: false, movement: null,
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
    case 'departure':
      return state.connection === 'connected'
        ? { ...state, players: action.players, stage: 'lobby', cards: [], turnPlayerId: null, pending: false, readyPending: false,
          drawnCard: null, discardTop: null, turnPending: false, awaitingTurn: false, movement: null, error: null } : state;
    case 'deal':
      if (state.connection !== 'connected' || !state.identity || state.players.length !== 4
        || !state.players.some(player => player.playerId === state.identity?.playerId)) return state;
      return { ...state, stage: 'memorization', turnPlayerId: null, pending: false, readyPending: false, error: null,
        drawnCard: null, discardTop: null, turnPending: false, awaitingTurn: false, movement: null,
        players: state.players.map(player => ({ ...player, isReady: false })),
        cards: action.cards.map(card => {
          const ref = { playerId: card.playerId, handSlotId: card.handSlotId };
          return card.faceUp && card.playerId === state.identity?.playerId && [2, 4].includes(card.handSlotId)
            ? { ...ref, faceUp: true, cardId: card.cardId } : { ...ref, faceUp: false };
        }) };
    case 'turn':
      if (state.connection !== 'connected' || !state.identity || state.stage === 'lobby'
        || !state.players.some(player => player.playerId === action.playerId)) return state;
      return { ...state, stage: 'active', turnPlayerId: action.playerId, readyPending: false, error: null,
        drawnCard: null, turnPending: false, awaitingTurn: false,
        cards: state.cards.map(card => ({ playerId: card.playerId, handSlotId: card.handSlotId, faceUp: false })) };
    case 'turnStarted':
      return { ...state, turnPending: true, error: null };
    case 'drawn': {
      if (state.connection !== 'connected' || state.stage !== 'active' || action.card.playerId !== state.turnPlayerId) return state;
      const card = action.card;
      // Only the deck drawer is authorized to retain a face in this implementation step.
      const drawnCard = card.faceUp && card.playerId === state.identity?.playerId
        ? { playerId: card.playerId, faceUp: /** @type {const} */ (true), cardId: card.cardId }
        : { playerId: card.playerId, faceUp: /** @type {const} */ (false) };
      return { ...state, drawnCard, turnPending: false, awaitingTurn: false, error: null,
        movementId: state.movementId + 1, movement: { id: state.movementId + 1, kind: 'draw' } };
    }
    case 'pile':
      if (state.connection !== 'connected' || state.stage !== 'active') return state;
      return { ...state, discardTop: action.top ? { cardId: action.top.cardId } : null,
        drawnCard: null, awaitingTurn: true,
        movementId: state.movementId + 1,
        movement: state.movement?.kind === 'swap' ? { ...state.movement, id: state.movementId + 1 }
          : { id: state.movementId + 1, kind: 'discard' } };
    case 'swapped': {
      if (state.connection !== 'connected' || state.stage !== 'active') return state;
      const target = action.notice.target;
      return { ...state, drawnCard: null, awaitingTurn: true,
        cards: state.cards.map(card => card.playerId === target.playerId && card.handSlotId === target.handSlotId
          ? { playerId: card.playerId, handSlotId: card.handSlotId, faceUp: false } : card),
        movementId: state.movementId + 1,
        movement: { id: state.movementId + 1, kind: 'swap', target: { ...target } } };
    }
    case 'readyStarted':
      return { ...state, readyPending: true, error: null };
    case 'readyMark':
      if (state.connection !== 'connected') return state;
      if (state.stage === 'memorization' && !action.isReady) return state;
      return { ...state,
        players: state.players.map(player => player.playerId === action.playerId
          ? { ...player, isReady: action.isReady } : player),
        readyPending: action.playerId === state.identity?.playerId ? false : state.readyPending,
        cards: state.stage === 'memorization' && action.isReady && action.playerId === state.identity?.playerId
          ? state.cards.map(card => card.playerId === action.playerId
            ? { playerId: card.playerId, handSlotId: card.handSlotId, faceUp: false } : card) : state.cards };
    case 'error': {
      if (state.connection !== 'connected') return state;
      const stale = action.error.code === 'INVALID_NAME' && state.pending
        && state.submittedNameRevision !== state.nameRevision;
      return { ...state, pending: false, readyPending: false, turnPending: false, error: stale ? state.error : action.error };
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
  const ownTurn = connected && joined && state.stage === 'active' && state.turnPlayerId === state.identity?.playerId
    && !state.turnPending && !state.awaitingTurn;
  return {
    connected, connectionLost: state.connection === 'lost', localPlayer, joined, allReady,
    canJoin: connected && !state.pending && !state.identity,
    canReady: connected && joined && !state.readyPending && state.stage !== 'active'
      && (state.stage === 'memorization' ? !localPlayer?.isReady : (!localPlayer?.isReady || !allReady)),
    canRetry: state.connection === 'failed',
    canDraw: ownTurn && !state.drawnCard,
    canResolve: ownTurn && state.drawnCard?.playerId === state.identity?.playerId,
  };
}
