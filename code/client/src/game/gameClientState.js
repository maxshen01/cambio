// Defines client display state and internal actions; authoritative game state stays on the server.
/**
 * @typedef {import('../../../shared/protocol.js').JoinAck} Identity
 * @typedef {import('../../../shared/protocol.js').PlayerSummary} PlayerSummary
 * @typedef {import('../../../shared/protocol.js').LobbyError} LobbyError
 * @typedef {'connecting' | 'connected' | 'failed' | 'lost'} Connection
 * @typedef {{ code: 'CONNECTION_FAILED' | 'CONNECTION_LOST', message: string } | LobbyError} DisplayError
 * @typedef {'usePower' | 'choosePowerTargets' | 'skipPower' | 'finishPowerPeek' | 'choosePowerSwap'} PowerAction
 * @typedef {{ power: 'selfPeek' | 'opponentPeek' | 'blindSwap' | 'onePeekSwap' | 'twoPeekSwap', stage: 'awaitingChoice' | 'awaitingTargets' | 'awaitingPeekDone' | 'awaitingSwap' }} PowerPrompt
 * @typedef {Object} GameClientState
 * @property {Connection} connection
 * @property {Identity | null} identity
 * @property {PlayerSummary[]} players
 * @property {'lobby' | 'memorization' | 'active'} stage
 * @property {string | null} turnPlayerId
 * @property {import('../../../shared/protocol.js').CardDrawnNotice | null} drawnCard
 * @property {import('../../../shared/protocol.js').DiscardView | null} discardTop
 * @property {boolean} turnPending A turn action has been sent and is awaiting its response.
 * @property {boolean} awaitingTurn Resolution arrived; wait for turnChanged before enabling actions.
 * @property {boolean} resolvingPower Public resolution interval, including before the private prompt.
 * @property {PowerPrompt | null} powerPrompt Owner-only choices for the current held power.
 * @property {import('../../../shared/protocol.js').CardView[]} powerPeekTargets Authorized buffer; use the selector for visibility while Done is pending.
 * @property {PowerAction | null} pendingPowerAction
 * @property {number} movementId
 * @property {({ id: number, kind: 'draw', source: 'deck' | 'discard' } | { id: number, kind: 'discard' } | { id: number, kind: 'swap', target: import('../../../shared/protocol.js').HandSlotRef } | { id: number, kind: 'powerSwap', first: import('../../../shared/protocol.js').HandSlotRef, second: import('../../../shared/protocol.js').HandSlotRef }) | null} movement
 * @property {import('../../../shared/protocol.js').CardView[]} cards
 * @property {boolean} joinPending
 * @property {boolean} readyPending
 * @property {number} nameRevision Tracks edits so a late name rejection cannot overwrite newer input feedback.
 * @property {number | null} submittedNameRevision
 * @property {DisplayError | null} error
 * @typedef {{ type: 'connectionEstablished' | 'connectionFailed' | 'connectionLost' | 'connectionRetryStarted' | 'nameEdited' | 'joinRequested' | 'readyRequested' | 'turnActionRequested' }
 * | { type: 'joinAcknowledged', identity: Identity }
 * | { type: 'playersReceived', players: PlayerSummary[] }
 * | { type: 'playerDepartureReceived', players: PlayerSummary[] }
 * | { type: 'gameAborted', notice: import('../../../shared/protocol.js').GameAborted }
 * | { type: 'dealReceived', cards: import('../../../shared/protocol.js').CardView[] }
 * | { type: 'readinessReceived', playerId: string, isReady: boolean }
 * | { type: 'turnChanged', playerId: string }
 * | { type: 'drawnCardReceived', card: import('../../../shared/protocol.js').CardDrawnNotice }
 * | { type: 'discardPileReceived', top: import('../../../shared/protocol.js').DiscardView | null }
 * | { type: 'cardSwapReceived', notice: import('../../../shared/protocol.js').CardSwapNotice }
 * | { type: 'powerResolutionStarted', notice: import('../../../shared/protocol.js').PowerResolutionStarted }
 * | { type: 'powerAvailable', notice: import('../../../shared/protocol.js').PowerAvailable }
 * | { type: 'powerCardRevealed', card: import('../../../shared/protocol.js').PowerCardRevealed }
 * | { type: 'powerPeekResult', notice: import('../../../shared/protocol.js').PowerPeekResult }
 * | { type: 'powerActionRequested', action: PowerAction }
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
    resolvingPower: false,
    powerPrompt: null,
    powerPeekTargets: [],
    pendingPowerAction: null,
    movement: null,
    movementId: 0,
    nameRevision: 0,
    submittedNameRevision: null,
    error: null,
  };
}

