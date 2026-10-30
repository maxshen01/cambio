// Peek and blind-swap rules; socket notifications and recipient projection are separate.
import { DomainError } from './domainError.js';
import { requireTurnPlayer, finishTurn } from './turnLifecycle.js';
/** @typedef {import('./types.js').GameState} GameState */

/** Validate the held card and expected lifecycle stage before any mutation.
 * @param {GameState} state @param {string} id
 * @param {'awaitingChoice' | 'awaitingTargets' | 'awaitingPeekDone' | null} stage Null starts resolution.
 */
function requirePower(state, id, stage) {
  const player = requireTurnPlayer(state, id);
  if (state.phase !== 'active' || player.drawnFrom !== 'deck'
    || !player.drawnCard || !['selfPeek', 'opponentPeek', 'blindSwap'].includes(player.drawnCard.power ?? '')
    || state.turnStep !== (stage === null ? 'awaitingDrawnCardResolution' : 'resolvingPower')
    || state.pendingPower !== (stage === null ? null : player.drawnCard.power)
    || state.pendingPowerStage !== stage
    || player.drawnCardRevealed !== (stage === 'awaitingTargets' || stage === 'awaitingPeekDone')) {
    throw new DomainError('POWER_NOT_AVAILABLE', 'This power action is not available right now.');
  }
  return { player, card: player.drawnCard };
}

/** Begin a supported held power without discarding or advancing.
 * @param {GameState} state @param {string} id
 */
export function startPowerResolution(state, id) {
  const { card } = requirePower(state, id, null);
  state.turnStep = 'resolvingPower';
  state.pendingPower = card.power;
  state.pendingPowerStage = 'awaitingChoice';
}

/** Activate the held power before targets are selected, without applying its effect.
 * @param {GameState} state @param {string} id
 */
export function usePower(state, id) {
  const { player } = requirePower(state, id, 'awaitingChoice');
  player.drawnCardRevealed = true;
  state.pendingPowerStage = 'awaitingTargets';
}

/** Validate all targets before authorizing a private peek or completing a blind swap.
 * The result is server-only; socket adapters must project it per recipient, never emit it raw.
 * @param {GameState} state @param {string} id @param {unknown} payload
 * @param {() => number} [random]
 */
export function choosePowerTargets(state, id, payload, random = Math.random) {
  const { player, card } = requirePower(state, id, 'awaitingTargets');
  if (card.power === 'blindSwap') {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)
      || !('first' in payload) || !('second' in payload)
      || !payload.first || typeof payload.first !== 'object' || Array.isArray(payload.first)
      || !payload.second || typeof payload.second !== 'object' || Array.isArray(payload.second)) {
      throw new DomainError('INVALID_POWER_ACTION', 'Choose two cards to swap.');
    }
    const first = occupiedSwapSlot(state, payload.first);
    const second = occupiedSwapSlot(state, payload.second);
    if (first.target.playerId === second.target.playerId) {
      throw new DomainError('SWAP_NOT_ALLOWED', 'Choose cards belonging to different players.');
    }
    [first.slot.card, second.slot.card] = [second.slot.card, first.slot.card];
    finishTurn(state, player, card, random);
    return { kind: /** @type {const} */ ('swap'), first: first.target, second: second.target };
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !('peekTarget' in payload)
    || !payload.peekTarget || typeof payload.peekTarget !== 'object' || Array.isArray(payload.peekTarget)) {
    throw new DomainError('INVALID_POWER_ACTION', 'Choose a card to peek at.');
  }
  const target = payload.peekTarget;
  const targetPlayer = 'playerId' in target ? state.players.find(player => player.id === target.playerId) : null;
  const ownTarget = targetPlayer?.id === id;
  if (!targetPlayer || !('handSlotId' in target) || (card.power === 'selfPeek' ? !ownTarget : ownTarget)) {
    throw new DomainError('INVALID_POWER_TARGET', 'Choose an occupied slot allowed by this power.');
  }
  const slot = targetPlayer.hand.find(slot => slot.handSlotId === target.handSlotId);
  if (!slot) throw new DomainError('INVALID_POWER_TARGET', 'Choose an occupied slot allowed by this power.');
  state.pendingPowerStage = 'awaitingPeekDone';
  return { kind: /** @type {const} */ ('peek'), target: { playerId: targetPlayer.id, handSlotId: slot.handSlotId }, card: slot.card };
}

/** Resolve current occupancy without exposing or trusting client-supplied faces.
 * @param {GameState} state @param {object} target
 */
function occupiedSwapSlot(state, target) {
  const player = 'playerId' in target ? state.players.find(player => player.id === target.playerId) : null;
  const slot = player && 'handSlotId' in target ? player.hand.find(slot => slot.handSlotId === target.handSlotId) : null;
  if (!player || !slot) throw new DomainError('INVALID_POWER_TARGET', 'Choose occupied hand slots.');
  return { slot, target: { playerId: player.id, handSlotId: slot.handSlotId } };
}

/** Decline before activation or during target selection; any public reveal lasts until discard.
 * @param {GameState} state @param {string} id @param {() => number} [random]
 */
export function skipPower(state, id, random = Math.random) {
  const { player, card } = requirePower(state, id, state.pendingPowerStage === 'awaitingTargets' ? 'awaitingTargets' : 'awaitingChoice');
  finishTurn(state, player, card, random);
}

/** Done ends the persistent peek and discards the held card exactly once.
 * @param {GameState} state @param {string} id @param {() => number} [random]
 */
export function finishPowerPeek(state, id, random = Math.random) {
  const { player, card } = requirePower(state, id, 'awaitingPeekDone');
  if (card.power === 'blindSwap') throw new DomainError('POWER_NOT_AVAILABLE', 'This power has no peek to finish.');
  finishTurn(state, player, card, random);
}
