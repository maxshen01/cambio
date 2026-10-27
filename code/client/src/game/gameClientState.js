// Defines client display state and internal actions; authoritative game state stays on the server.
/**
 * @typedef {import('../../../shared/lobbyTypes.js').JoinAck} Identity
 * @typedef {import('../../../shared/lobbyTypes.js').PlayerSummary} PlayerSummary
 * @typedef {import('../../../shared/lobbyTypes.js').LobbyError} LobbyError
 * @typedef {'connecting' | 'connected' | 'failed' | 'lost'} Connection
 * @typedef {{ code: 'CONNECTION_FAILED' | 'CONNECTION_LOST', message: string } | LobbyError} DisplayError
 * @typedef {Object} GameClientState
 * @property {Connection} connection
 * @property {Identity | null} identity
 * @property {PlayerSummary[]} players
 * @property {'lobby' | 'memorization' | 'active'} stage
 * @property {string | null} turnPlayerId
 * @property {import('../../../shared/lobbyTypes.js').CardDrawnNotice | null} drawnCard
 * @property {import('../../../shared/lobbyTypes.js').DiscardView | null} discardTop
 * @property {boolean} turnPending A turn action has been sent and is awaiting its response.
 * @property {boolean} awaitingTurn Resolution arrived; wait for turnChanged before enabling actions.
 * @property {number} movementId
 * @property {({ id: number, kind: 'draw', source: 'deck' | 'discard' } | { id: number, kind: 'discard' } | { id: number, kind: 'swap', target: import('../../../shared/lobbyTypes.js').HandSlotRef }) | null} movement
 * @property {import('../../../shared/lobbyTypes.js').CardView[]} cards
 * @property {boolean} joinPending
 * @property {boolean} readyPending
 * @property {number} nameRevision Tracks edits so a late name rejection cannot overwrite newer input feedback.
 * @property {number | null} submittedNameRevision
 * @property {DisplayError | null} error
 * @typedef {{ type: 'connectionEstablished' | 'connectionFailed' | 'connectionLost' | 'connectionRetryStarted' | 'nameEdited' | 'joinRequested' | 'readyRequested' | 'turnActionRequested' }
 * | { type: 'joinAcknowledged', identity: Identity }
 * | { type: 'playersReceived', players: PlayerSummary[] }
 * | { type: 'playerDepartureReceived', players: PlayerSummary[] }
 * | { type: 'dealReceived', cards: import('../../../shared/lobbyTypes.js').CardView[] }
 * | { type: 'readinessReceived', playerId: string, isReady: boolean }
 * | { type: 'turnChanged', playerId: string }
 * | { type: 'drawnCardReceived', card: import('../../../shared/lobbyTypes.js').CardDrawnNotice }
 * | { type: 'discardPileReceived', top: import('../../../shared/lobbyTypes.js').DiscardView | null }
 * | { type: 'cardSwapReceived', notice: import('../../../shared/lobbyTypes.js').DrawnSwapNotice }
 * | { type: 'serverErrorReceived', error: LobbyError }} GameClientAction
 */

/** @param {boolean} connected @returns {GameClientState} */
export function initialGameClientState(connected) {
  return {
    connection: connected ? 'connected' : 'connecting',
    identity: null,
    players: [],
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
    movementId: 0,
    nameRevision: 0,
    submittedNameRevision: null,
    error: null,
  };
}

