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

/** Only the current drawer receives a supported power choice.
 * @param {GameClientState} state @param {import('../../../shared/protocol.js').PowerAvailable} notice
 * @returns {GameClientState}
 */
export function offerPower(state, notice) {
  if (!hasPendingDeckCard(state) || !state.resolvingPower || state.powerPrompt
    || state.turnPlayerId !== state.identity?.playerId
    || !['selfPeek', 'opponentPeek', 'blindSwap', 'onePeekSwap', 'twoPeekSwap'].includes(notice.power)) return state;
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
  if (owner && (state.powerPrompt?.stage !== 'awaitingTargets' || state.powerPrompt.power === 'blindSwap')) return state;
  if (owner && notice.targets.length !== (state.powerPrompt?.power === 'twoPeekSwap' ? 2 : 1)) return state;
  if (notice.targets.length === 2 && notice.targets[0].playerId === notice.targets[1].playerId
    && notice.targets[0].handSlotId === notice.targets[1].handSlotId) return state;
  for (const target of notice.targets) {
    if (owner && (state.powerPrompt?.power === 'selfPeek' && target.playerId !== state.turnPlayerId
      || state.powerPrompt?.power === 'opponentPeek' && target.playerId === state.turnPlayerId)) return state;
    if (!state.cards.some(card => card.playerId === target.playerId && card.handSlotId === target.handSlotId)) return state;
  }
  const powerPeekTargets = notice.targets.map(({ playerId, handSlotId, ...face }) =>
    owner && face.faceUp
      ? { playerId, handSlotId, faceUp: /** @type {const} */ (true), cardId: face.cardId }
      : { playerId, handSlotId, faceUp: /** @type {const} */ (false) });
  return { ...state, powerPeekTargets,
    powerPrompt: owner && state.powerPrompt ? { power: state.powerPrompt.power, stage: 'awaitingPeekDone' } : null,
    turnPending: false, pendingPowerAction: null, error: null };
}
