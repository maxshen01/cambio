// Single-card peek rules; socket notifications and recipient projection are separate.
import { DomainError } from './domainError.js';
import { requireTurnPlayer, finishTurn } from './turnLifecycle.js';
/** @typedef {import('./types.js').GameState} GameState */

/** Validate the held card and expected lifecycle stage before any mutation.
 * @param {GameState} state @param {string} id
 * @param {'awaitingChoice' | 'awaitingTargets' | 'awaitingPeekDone' | null} stage Null starts resolution.
 */
function requirePeek(state, id, stage) {
  const player = requireTurnPlayer(state, id);
  if (state.phase !== 'active' || player.drawnFrom !== 'deck'
    || !player.drawnCard || (player.drawnCard.power !== 'selfPeek' && player.drawnCard.power !== 'opponentPeek')
    || state.turnStep !== (stage === null ? 'awaitingDrawnCardResolution' : 'resolvingPower')
    || state.pendingPower !== (stage === null ? null : player.drawnCard.power)
    || state.pendingPowerStage !== stage
    || player.drawnCardRevealed !== (stage === 'awaitingTargets' || stage === 'awaitingPeekDone')) {
    throw new DomainError('POWER_NOT_AVAILABLE', 'This power action is not available right now.');
  }
  return { player, card: player.drawnCard };
}

/** Begin a held peek without discarding or advancing.
 * @param {GameState} state @param {string} id
 */
export function startPowerResolution(state, id) {
  const { card } = requirePeek(state, id, null);
  state.turnStep = 'resolvingPower';
  state.pendingPower = card.power;
  state.pendingPowerStage = 'awaitingChoice';
}

/** Activate the held power before targets are selected, without applying its effect.
 * @param {GameState} state @param {string} id
 */
export function usePower(state, id) {
  const { player } = requirePeek(state, id, 'awaitingChoice');
  player.drawnCardRevealed = true;
  state.pendingPowerStage = 'awaitingTargets';
}

/** Validate an occupied target before authorizing its private face.
 * The result is server-only; socket adapters must project it per recipient, never emit it raw.
 * @param {GameState} state @param {string} id @param {unknown} payload
 */
export function choosePowerTargets(state, id, payload) {
  const { card } = requirePeek(state, id, 'awaitingTargets');
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
  return { target: { playerId: targetPlayer.id, handSlotId: slot.handSlotId }, card: slot.card };
}

/** Decline before activation or during target selection; any public reveal lasts until discard.
 * @param {GameState} state @param {string} id @param {() => number} [random]
 */
export function skipPower(state, id, random = Math.random) {
  const { player, card } = requirePeek(state, id, state.pendingPowerStage === 'awaitingTargets' ? 'awaitingTargets' : 'awaitingChoice');
  finishTurn(state, player, card, random);
}

/** Done ends the persistent peek and discards the held card exactly once.
 * @param {GameState} state @param {string} id @param {() => number} [random]
 */
export function finishPowerPeek(state, id, random = Math.random) {
  const { player, card } = requirePeek(state, id, 'awaitingPeekDone');
  finishTurn(state, player, card, random);
}
