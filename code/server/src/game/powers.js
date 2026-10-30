// 7/8 self-peek domain rules; socket notifications and recipient projection are separate.
import { DomainError } from './domainError.js';
import { requireTurnPlayer, finishTurn } from './turnLifecycle.js';
/** @typedef {import('./types.js').GameState} GameState */

/** Validate the held card and expected lifecycle stage before any mutation.
 * @param {GameState} state @param {string} id
 * @param {'awaitingChoice' | 'awaitingPeekDone' | null} stage Null starts resolution.
 */
function requireSelfPeek(state, id, stage) {
  const player = requireTurnPlayer(state, id);
  if (state.phase !== 'active' || player.drawnFrom !== 'deck'
    || !player.drawnCard || player.drawnCard.power !== 'selfPeek'
    || state.turnStep !== (stage === null ? 'awaitingDrawnCardResolution' : 'resolvingPower')
    || state.pendingPower !== (stage === null ? null : 'selfPeek')
    || state.pendingPowerStage !== stage
    || player.drawnCardRevealed !== (stage === 'awaitingPeekDone')) {
    throw new DomainError('POWER_NOT_AVAILABLE', 'This power action is not available right now.');
  }
  return { player, card: player.drawnCard };
}

/** Begin a held self-peek without discarding or advancing.
 * @param {GameState} state @param {string} id
 */
export function startPowerResolution(state, id) {
  requireSelfPeek(state, id, null);
  state.turnStep = 'resolvingPower';
  state.pendingPower = 'selfPeek';
  state.pendingPowerStage = 'awaitingChoice';
}

/** Validate an occupied own-hand target, then authorize the held-card reveal and peek.
 * The result is server-only; socket adapters must project it per recipient, never emit it raw.
 * @param {GameState} state @param {string} id @param {unknown} payload
 */
export function usePower(state, id, payload) {
  const { player } = requireSelfPeek(state, id, 'awaitingChoice');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !('peekTarget' in payload)
    || !payload.peekTarget || typeof payload.peekTarget !== 'object' || Array.isArray(payload.peekTarget)) {
    throw new DomainError('INVALID_POWER_ACTION', 'Choose a card to peek at.');
  }
  const target = payload.peekTarget;
  if (!('playerId' in target) || target.playerId !== id || !('handSlotId' in target)) {
    throw new DomainError('INVALID_POWER_TARGET', 'Choose one of your occupied hand slots.');
  }
  const slot = player.hand.find(slot => slot.handSlotId === target.handSlotId);
  if (!slot) throw new DomainError('INVALID_POWER_TARGET', 'Choose one of your occupied hand slots.');
  player.drawnCardRevealed = true;
  state.pendingPowerStage = 'awaitingPeekDone';
  return { target: { playerId: id, handSlotId: slot.handSlotId }, card: slot.card };
}

/** Declining before use completes the turn without an earlier public held-card reveal.
 * @param {GameState} state @param {string} id @param {() => number} [random]
 */
export function skipPower(state, id, random = Math.random) {
  const { player, card } = requireSelfPeek(state, id, 'awaitingChoice');
  finishTurn(state, player, card, random);
}

/** Done ends the persistent peek and discards the held card exactly once.
 * @param {GameState} state @param {string} id @param {() => number} [random]
 */
export function finishPowerPeek(state, id, random = Math.random) {
  const { player, card } = requireSelfPeek(state, id, 'awaitingPeekDone');
  finishTurn(state, player, card, random);
}
