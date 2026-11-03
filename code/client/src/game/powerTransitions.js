// Power display stages and private peek buffers; baseline hand cards remain unchanged.
import { getPowerDefinition, isValidPowerSelection, sameSlot } from './powerPolicy.js';
/** @typedef {import('./gameClientState.js').GameClientState} GameClientState */

/** Fresh fields erase every retained peek identity when resolution ends or a round resets. */
export function clearedPowerState() {
  return { resolvingPower: false, powerPrompt: null,
    powerPeekTargets: /** @type {import('../../../shared/protocol.js').CardView[]} */ ([]), pendingPowerAction: null };
}

/** Done opens an optional swap locally because the protocol has no success event.
 * @param {GameClientState} state @param {import('./gameClientState.js').PowerAction} action
 * @returns {GameClientState}
 */
export function requestPowerAction(state, action) {
  if (action === 'finishPowerPeek' && state.powerPrompt?.stage === 'awaitingPeekDone'
    && getPowerDefinition(state.powerPrompt.power)?.postPeekSwap) {
    return { ...state, powerPrompt: { ...state.powerPrompt, stage: 'awaitingSwap' },
      turnPending: false, pendingPowerAction: action, error: null };
  }
  return { ...state, turnPending: true, pendingPowerAction: action, error: null };
}

/** Release a rejected power request and restore retained peek faces only for Done rollback.
 * General errors and non-power request cleanup remain owned by the main reducer.
 * @param {GameClientState} state @param {import('../../../shared/protocol.js').LobbyError} error
 * @returns {Pick<GameClientState, 'powerPrompt' | 'pendingPowerAction'>}
 */
export function rejectPowerAction(state, error) {
  const restorePeek = state.powerPrompt?.stage === 'awaitingSwap' && state.powerPeekTargets.length > 0
    && (state.pendingPowerAction === 'finishPowerPeek' || error.code === 'POWER_NOT_AVAILABLE');
  return { pendingPowerAction: null,
    powerPrompt: restorePeek && state.powerPrompt ? { ...state.powerPrompt, stage: 'awaitingPeekDone' } : state.powerPrompt };
}

/** A power notice belongs to a live held deck card, never an empty or reset board.
 * @param {GameClientState} state
 */
function hasPendingDeckCard(state) {
  return state.connection === 'connected' && state.stage === 'active' && Boolean(state.identity)
    && state.players.some(player => player.playerId === state.identity?.playerId)
    && !state.awaitingTurn && state.drawnCard?.source === 'deck'
    && state.drawnCard.playerId === state.turnPlayerId
    && state.players.some(player => player.playerId === state.turnPlayerId);
}

/** Public start retains both piles, the held card, and its current visibility.
 * @param {GameClientState} state @param {import('../../../shared/protocol.js').PowerResolutionStarted} notice
 * @returns {GameClientState}
 */
export function startPower(state, notice) {
  if (!hasPendingDeckCard(state) || state.resolvingPower || notice.playerId !== state.turnPlayerId) return state;
  return { ...state, ...clearedPowerState(), powerPrompt: state.powerPrompt,
    resolvingPower: true, turnPending: false, error: null };
}

/** Only the current drawer receives a supported power choice.
 * @param {GameClientState} state @param {import('../../../shared/protocol.js').PowerAvailable} notice
 * @returns {GameClientState}
 */
export function offerPower(state, notice) {
  if (!hasPendingDeckCard(state) || state.powerPrompt
    || state.turnPlayerId !== state.identity?.playerId
    || !getPowerDefinition(notice.power)) return state;
  return { ...state, powerPrompt: { power: notice.power, stage: 'awaitingChoice' }, error: null };
}

/** Activation confirms target selection once; duplicate reveals cannot release later locks.
 * @param {GameClientState} state @param {import('../../../shared/protocol.js').PowerCardRevealed} card
 * @returns {GameClientState}
 */
export function revealPowerCard(state, card) {
  if (!hasPendingDeckCard(state) || !state.resolvingPower || card.playerId !== state.turnPlayerId) return state;
  const owner = state.turnPlayerId === state.identity?.playerId;
  if (owner ? state.powerPrompt?.stage !== 'awaitingChoice' : state.drawnCard?.faceUp) return state;
  return { ...state, drawnCard: { playerId: card.playerId, source: 'deck', faceUp: true, cardId: card.cardId },
    powerPrompt: owner && state.powerPrompt ? { ...state.powerPrompt, stage: 'awaitingTargets' } : null,
    turnPending: false, pendingPowerAction: null, error: null };
}

/** Copy only authorized temporary faces, separate from baseline hand visibility.
 * @param {GameClientState} state @param {import('../../../shared/protocol.js').PowerPeekResult} notice
 * @returns {GameClientState}
 */
export function receivePowerPeek(state, notice) {
  if (!hasPendingDeckCard(state) || !state.resolvingPower || !state.drawnCard?.faceUp
    || state.powerPeekTargets.length || notice.targets.length < 1 || notice.targets.length > 2) return state;
  const owner = state.turnPlayerId === state.identity?.playerId;
  const policy = getPowerDefinition(state.powerPrompt?.power)?.initial;
  if (owner && (state.powerPrompt?.stage !== 'awaitingTargets' || policy?.kind !== 'peek'
    || !isValidPowerSelection(policy, notice.targets, state.cards, state.turnPlayerId ?? ''))) return state;
  // Observers have no private prompt, so validate only public slot references.
  if (!owner && (notice.targets.length === 2 && sameSlot(notice.targets[0], notice.targets[1])
    || notice.targets.some(target => !state.cards.some(card => sameSlot(card, target))))) return state;
  const powerPeekTargets = notice.targets.map(({ playerId, handSlotId, ...face }) =>
    owner && face.faceUp
      ? { playerId, handSlotId, faceUp: /** @type {const} */ (true), cardId: face.cardId }
      : { playerId, handSlotId, faceUp: /** @type {const} */ (false) });
  return { ...state, powerPeekTargets,
    powerPrompt: owner && state.powerPrompt ? { power: state.powerPrompt.power, stage: 'awaitingPeekDone' } : null,
    turnPending: false, pendingPowerAction: null, error: null };
}
