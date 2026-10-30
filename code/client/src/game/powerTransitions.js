// Power display stages and private peek buffers; baseline hand cards remain unchanged.
/** @typedef {import('./gameClientState.js').GameClientState} GameClientState */

/** Fresh fields erase every retained peek identity when resolution ends or a round resets. */
export function clearedPowerState() {
  return { resolvingPower: false, powerPrompt: null,
    powerPeekTargets: /** @type {import('../../../shared/protocol.js').CardView[]} */ ([]), pendingPowerAction: null };
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
  return { ...state, ...clearedPowerState(), resolvingPower: true, turnPending: false, error: null };
}

/** Only the current drawer receives a self-peek choice.
 * @param {GameClientState} state @param {import('../../../shared/protocol.js').PowerAvailable} notice
 * @returns {GameClientState}
 */
export function offerPower(state, notice) {
  if (!hasPendingDeckCard(state) || !state.resolvingPower || state.powerPrompt
    || state.turnPlayerId !== state.identity?.playerId || notice.power !== 'selfPeek') return state;
  return { ...state, powerPrompt: { power: 'selfPeek', stage: 'awaitingChoice' }, error: null };
}

/** A reveal changes only the existing held card; it is not another draw or movement.
 * @param {GameClientState} state @param {import('../../../shared/protocol.js').PowerCardRevealed} card
 * @returns {GameClientState}
 */
export function revealPowerCard(state, card) {
  if (!hasPendingDeckCard(state) || !state.resolvingPower || card.playerId !== state.turnPlayerId) return state;
  return { ...state, drawnCard: { playerId: card.playerId, source: 'deck', faceUp: true, cardId: card.cardId } };
}

/** Copy only authorized temporary faces, separate from baseline hand visibility.
 * @param {GameClientState} state @param {import('../../../shared/protocol.js').PowerPeekResult} notice
 * @returns {GameClientState}
 */
export function receivePowerPeek(state, notice) {
  if (!hasPendingDeckCard(state) || !state.resolvingPower || !state.drawnCard?.faceUp
    || state.powerPeekTargets.length || notice.targets.length !== 1) return state;
  const owner = state.turnPlayerId === state.identity?.playerId;
  if (owner && state.powerPrompt?.stage !== 'awaitingChoice') return state;
  const target = notice.targets[0];
  if (target.playerId !== state.turnPlayerId || !state.cards.some(card =>
    card.playerId === target.playerId && card.handSlotId === target.handSlotId)) return state;
  const powerPeekTargets = notice.targets.map(({ playerId, handSlotId, ...face }) =>
    owner && face.faceUp
      ? { playerId, handSlotId, faceUp: /** @type {const} */ (true), cardId: face.cardId }
      : { playerId, handSlotId, faceUp: /** @type {const} */ (false) });
  return { ...state, powerPeekTargets,
    powerPrompt: owner ? { power: 'selfPeek', stage: 'awaitingPeekDone' } : null,
    turnPending: false, pendingPowerAction: null, error: null };
}
