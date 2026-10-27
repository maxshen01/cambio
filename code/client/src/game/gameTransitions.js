// Pure, atomic transitions for the server-confirmed client view.
/** @typedef {import('./gameClientState.js').GameClientState} GameClientState */
/** @typedef {import('../../../shared/lobbyTypes.js').CardView} CardView */
/** @typedef {import('../../../shared/lobbyTypes.js').PlayerSummary} PlayerSummary */
/** @typedef {import('../../../shared/lobbyTypes.js').CardDrawnNotice} CardDrawnNotice */
/** @typedef {import('../../../shared/lobbyTypes.js').DiscardView} DiscardView */
/** @typedef {import('../../../shared/lobbyTypes.js').DrawnSwapNotice} DrawnSwapNotice */

/** Remove face identities rather than merely hiding their images.
 * @param {CardView[]} cards @returns {CardView[]}
 */
export function hideHandCards(cards) {
  return cards.map(hideHandCard);
}

/** @param {CardView} card @returns {CardView} */
function hideHandCard({ playerId, handSlotId }) {
  return { playerId, handSlotId, faceUp: false };
}

/** Copy the server-projected opening view; authorization belongs to the server.
 * @param {GameClientState} state
 * @param {CardView[]} cards
 * @returns {GameClientState}
 */
export function applyDeal(state, cards) {
  if (state.connection !== 'connected' || !state.identity || state.players.length !== 4
    || !state.players.some(player => player.playerId === state.identity?.playerId)) return state;
  return {
    ...state,
    stage: 'memorization',
    players: state.players.map(player => ({ ...player, isReady: false })),
    cards: cards.map(card => ({ ...card })),
    turnPlayerId: null,
    drawnCard: null,
    discardTop: null,
    joinPending: false,
    readyPending: false,
    turnPending: false,
    awaitingTurn: false,
    movement: null,
    error: null,
  };
}

/** Only a confirmed local Ready removes this recipient's memorization faces.
 * @param {GameClientState} state
 * @param {string} playerId
 * @param {boolean} isReady
 * @returns {GameClientState}
 */
export function confirmReadiness(state, playerId, isReady) {
  if (state.connection !== 'connected') return state;
  if (state.stage === 'memorization' && !isReady) return state;
  const isLocalPlayer = playerId === state.identity?.playerId;
  const hideOpeningFaces = state.stage === 'memorization' && isReady && isLocalPlayer;
  return {
    ...state,
    players: state.players.map(player => player.playerId === playerId
      ? { ...player, isReady } : player),
    readyPending: isLocalPlayer ? false : state.readyPending,
    cards: hideOpeningFaces
      ? state.cards.map(card => card.playerId === playerId ? hideHandCard(card) : card)
      : state.cards,
  };
}

/** Start or advance a turn and discard temporary held and opening faces.
 * @param {GameClientState} state
 * @param {string} playerId
 * @returns {GameClientState}
 */
export function beginTurn(state, playerId) {
  if (state.connection !== 'connected' || !state.identity || state.stage === 'lobby'
    || !state.players.some(player => player.playerId === playerId)) return state;
  return {
    ...state,
    stage: 'active',
    turnPlayerId: playerId,
    cards: hideHandCards(state.cards),
    drawnCard: null,
    readyPending: false,
    turnPending: false,
    awaitingTurn: false,
    movement: state.movement?.kind === 'draw' ? null : state.movement,
    error: null,
  };
}

/** Honor the server's visibility and retain its source with the pending card.
 * @param {GameClientState} state
 * @param {CardDrawnNotice} card
 * @returns {GameClientState}
 */
export function receiveDrawnCard(state, card) {
  if (state.connection !== 'connected' || state.stage !== 'active' || card.playerId !== state.turnPlayerId) return state;
  const drawnCard = card.faceUp
    ? { playerId: card.playerId, source: card.source, faceUp: /** @type {const} */ (true), cardId: card.cardId }
    : { playerId: card.playerId, source: card.source, faceUp: /** @type {const} */ (false) };
  return {
    ...state,
    drawnCard,
    turnPending: false,
    awaitingTurn: false,
    error: null,
    movementId: state.movementId + 1,
    movement: { id: state.movementId + 1, kind: 'draw', source: card.source },
  };
}

/** An exposed-top update preserves a discard draw; completed resolutions await turnChanged.
 * @param {GameClientState} state
 * @param {DiscardView | null} top
 * @returns {GameClientState}
 */
export function resolveDiscard(state, top) {
  if (state.connection !== 'connected' || state.stage !== 'active') return state;
  if (state.drawnCard?.source === 'discard') {
    return { ...state, discardTop: top ? { cardId: top.cardId } : null };
  }
  return {
    ...state,
    discardTop: top ? { cardId: top.cardId } : null,
    drawnCard: null,
    awaitingTurn: true,
    movementId: state.movementId + 1,
    movement: state.movement?.kind === 'swap' ? { ...state.movement, id: state.movementId + 1 }
      : { id: state.movementId + 1, kind: 'discard' },
  };
}

/** Keep the replacement facedown; the following pile event supplies the displaced face.
 * @param {GameClientState} state
 * @param {DrawnSwapNotice} notice
 * @returns {GameClientState}
 */
export function resolveSwap(state, notice) {
  if (state.connection !== 'connected' || state.stage !== 'active') return state;
  const target = notice.target;
  return {
    ...state,
    drawnCard: null,
    awaitingTurn: true,
    cards: state.cards.map(card => card.playerId === target.playerId && card.handSlotId === target.handSlotId
      ? hideHandCard(card) : card),
    movementId: state.movementId + 1,
    movement: { id: state.movementId + 1, kind: 'swap', target: { ...target } },
  };
}

/** A prestart departure clears the deal and retains the server-supplied seats and readiness.
 * @param {GameClientState} state
 * @param {PlayerSummary[]} players
 * @returns {GameClientState}
 */
export function returnToLobby(state, players) {
  return {
    ...state,
    players,
    stage: 'lobby',
    cards: [],
    turnPlayerId: null,
    drawnCard: null,
    discardTop: null,
    joinPending: false,
    readyPending: false,
    turnPending: false,
    awaitingTurn: false,
    movement: null,
    error: null,
  };
}

/** Connection loss is terminal and clears membership and private display state.
 * @param {GameClientState} state
 * @returns {GameClientState}
 */
export function clearDisconnectedSession(state) {
  return {
    ...returnToLobby(state, []),
    connection: 'lost',
    identity: null,
    submittedNameRevision: null,
    error: { code: 'CONNECTION_LOST', message: 'Connection lost. Reload to rejoin.' },
  };
}

