// Power definitions and actions; socket notifications and recipient views are separate.
import { DomainError } from '../domainError.js';
import { requireTurnPlayer, finishTurn } from './lifecycle.js';
/**
 * @typedef {import('../types.js').GameState} GameState
 * @typedef {import('../types.js').Power} Power
 * @typedef {import('../types.js').PowerStage} PowerStage
 * @typedef {{ differentPlayers: boolean }} SwapPolicy
 * @typedef {{ payload: 'peekTarget' | 'peekTargets', count: 1 | 2, ownership: 'self' | 'opponent' | 'any' }} PeekPolicy
 * @typedef {{ initialAction: 'peek', peek: PeekPolicy, swap: SwapPolicy | null }
 *   | { initialAction: 'swap', swap: SwapPolicy }} PowerDefinition
 */

/** Shared by Jack and the optional post-peek swaps. @type {SwapPolicy} */
const swapPolicy = { differentPlayers: true };

/** All power-specific behavior lives here. A peek with a swap policy offers that swap
 * after Done; a peek without one finishes the turn. Wire payload forms stay explicit.
 * @type {Readonly<Record<Power, PowerDefinition>>}
 */
const powerDefinitions = {
  selfPeek: {
    initialAction: 'peek',
    peek: { payload: 'peekTarget', count: 1, ownership: 'self' },
    swap: null,
  },
  opponentPeek: {
    initialAction: 'peek',
    peek: { payload: 'peekTarget', count: 1, ownership: 'opponent' },
    swap: null,
  },
  blindSwap: { initialAction: 'swap', swap: swapPolicy },
  onePeekSwap: {
    initialAction: 'peek',
    peek: { payload: 'peekTargets', count: 1, ownership: 'any' },
    swap: swapPolicy,
  },
  twoPeekSwap: {
    initialAction: 'peek',
    peek: { payload: 'peekTargets', count: 2, ownership: 'any' },
    swap: swapPolicy,
  },
};

/** Public reveal expected during each pending power stage.
 * @type {Readonly<Record<PowerStage, boolean>>}
 */
const revealedAtStage = {
  awaitingChoice: false,
  awaitingTargets: true,
  awaitingPeekDone: true,
  awaitingSwap: true,
};

/** Validate ownership before power availability, preserving public error precedence.
 * @param {GameState} state @param {string} id
 */
function requireHeldPower(state, id) {
  const player = requireTurnPlayer(state, id);
  const card = player.drawnCard;
  if (state.phase !== 'active' || player.drawnFrom !== 'deck' || !card?.power) {
    throw new DomainError('POWER_NOT_AVAILABLE', 'This power action is not available right now.');
  }
  return { player, card, power: card.power, definition: powerDefinitions[card.power] };
}

/** Starting resolution has no pending power context and keeps the card private.
 * @param {GameState} state @param {string} id
 */
function requirePowerStart(state, id) {
  const held = requireHeldPower(state, id);
  const awaitingResolution = state.turnStep === 'awaitingDrawnCardResolution';
  const noPendingPower = state.pendingPower === null;
  if (!awaitingResolution || !noPendingPower || held.player.drawnCardRevealed !== false) {
    throw new DomainError('POWER_NOT_AVAILABLE', 'This power action is not available right now.');
  }
  return held;
}

/** Validate an existing resolution against the action's explicitly allowed stages.
 * @param {GameState} state @param {string} id @param {PowerStage[]} allowedStages
 */
function requirePendingPower(state, id, allowedStages) {
  const held = requireHeldPower(state, id);
  const pending = state.pendingPower;
  const stage = pending?.stage ?? null;
  const resolvingHeldPower = state.turnStep === 'resolvingPower' && pending?.power === held.card.power;
  const allowedStage = stage !== null && allowedStages.includes(stage);
  const expectedReveal = stage !== null && revealedAtStage[stage];
  if (!resolvingHeldPower || !allowedStage || held.player.drawnCardRevealed !== expectedReveal) {
    throw new DomainError('POWER_NOT_AVAILABLE', 'This power action is not available right now.');
  }
  return held;
}

/** Begin a held power without discarding or advancing.
 * @param {GameState} state @param {string} id
 */
export function startPowerResolution(state, id) {
  const { power } = requirePowerStart(state, id);
  state.turnStep = 'resolvingPower';
  state.pendingPower = { power, stage: 'awaitingChoice' };
}

/** Activate an offered or already-started power; report whether public resolution starts now.
 * @param {GameState} state @param {string} id
 */
export function usePower(state, id) {
  const started = state.turnStep === 'awaitingDrawnCardResolution';
  const { player, power } = started ? requirePowerStart(state, id) : requirePendingPower(state, id, ['awaitingChoice']);
  state.turnStep = 'resolvingPower';
  state.pendingPower = { power, stage: 'awaitingTargets' };
  player.drawnCardRevealed = true;
  return started;
}

/** Validate targets, then authorize a private peek or complete an immediate swap.
 * Results are server-only; socket adapters must project them per recipient.
 * @param {GameState} state @param {string} id @param {unknown} payload
 * @param {() => number} [random]
 */
export function choosePowerTargets(state, id, payload, random = Math.random) {
  const { player, card, power, definition } = requirePendingPower(state, id, ['awaitingTargets']);
  if (definition.initialAction === 'swap') {
    const pair = validateSwapPair(state, payload, definition.swap);
    const result = exchangePair(pair);
    finishTurn(state, player, card, random);
    return result;
  }
  const targets = validatePeekTargets(state, id, payload, definition.peek);
  state.pendingPower = { power, stage: 'awaitingPeekDone' };
  return { kind: /** @type {const} */ ('peek'), targets };
}

/** Parse the single-slot wire form before resolving any target.
 * @param {unknown} payload
 */
function singlePeekTarget(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !('peekTarget' in payload)
    || !payload.peekTarget || typeof payload.peekTarget !== 'object' || Array.isArray(payload.peekTarget)) {
    throw new DomainError('INVALID_POWER_ACTION', 'Choose a card to peek at.');
  }
  return [payload.peekTarget];
}

/** Parse the list wire form and validate count before resolving any target.
 * @param {unknown} payload @param {PeekPolicy['count']} count
 */
function multiplePeekTargets(payload, count) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || !('peekTargets' in payload) || !Array.isArray(payload.peekTargets)) {
    throw new DomainError('INVALID_POWER_ACTION', 'Choose cards to peek at.');
  }
  if (payload.peekTargets.length !== count) {
    throw new DomainError('INVALID_TARGET_COUNT', `Choose exactly ${count} peek targets.`);
  }
  return payload.peekTargets;
}

/** Resolve every peek target and its ownership before changing the stage.
 * @param {GameState} state @param {string} id @param {unknown} payload @param {PeekPolicy} policy
 */
function validatePeekTargets(state, id, payload, policy) {
  const refs = policy.payload === 'peekTarget' ? singlePeekTarget(payload) : multiplePeekTargets(payload, policy.count);
  const message = policy.payload === 'peekTarget'
    ? 'Choose an occupied slot allowed by this power.' : 'Choose occupied hand slots.';
  const targets = refs.map(target => {
    const { slot, target: ref } = occupiedSlot(state, target, message);
    const ownTarget = ref.playerId === id;
    if ((policy.ownership === 'self' && !ownTarget) || (policy.ownership === 'opponent' && ownTarget)) {
      throw new DomainError('INVALID_POWER_TARGET', message);
    }
    return { target: ref, card: slot.card };
  });
  if (targets.length === 2 && targets[0].target.playerId === targets[1].target.playerId
    && targets[0].target.handSlotId === targets[1].target.handSlotId) {
    throw new DomainError('INVALID_TARGET_COUNT', 'Choose two distinct peek targets.');
  }
  return targets;
}

/** Resolve current occupancy without trusting client-supplied card faces.
 * @param {GameState} state @param {unknown} target @param {string} [message]
 */
function occupiedSlot(state, target, message = 'Choose occupied hand slots.') {
  if (!target || typeof target !== 'object' || Array.isArray(target)) {
    throw new DomainError('INVALID_POWER_TARGET', message);
  }
  const player = 'playerId' in target ? state.players.find(player => player.id === target.playerId) : null;
  const slot = player && 'handSlotId' in target ? player.hand.find(slot => slot.handSlotId === target.handSlotId) : null;
  if (!player || !slot) throw new DomainError('INVALID_POWER_TARGET', message);
  return { slot, target: { playerId: player.id, handSlotId: slot.handSlotId } };
}

/** Validate both positions and shared swap policy before exchanging anything.
 * @param {GameState} state @param {unknown} payload @param {SwapPolicy} policy
 */
function validateSwapPair(state, payload, policy) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || !('first' in payload) || !('second' in payload)
    || !payload.first || typeof payload.first !== 'object' || Array.isArray(payload.first)
    || !payload.second || typeof payload.second !== 'object' || Array.isArray(payload.second)) {
    throw new DomainError('INVALID_POWER_ACTION', 'Choose two cards to swap.');
  }
  const first = occupiedSlot(state, payload.first);
  const second = occupiedSlot(state, payload.second);
  if (policy.differentPlayers && first.target.playerId === second.target.playerId) {
    throw new DomainError('SWAP_NOT_ALLOWED', 'Choose cards belonging to different players.');
  }
  return { first, second };
}

/** Exchange a fully validated pair, retaining stable positions and hidden faces.
 * @param {ReturnType<typeof validateSwapPair>} pair
 */
function exchangePair({ first, second }) {
  [first.slot.card, second.slot.card] = [second.slot.card, first.slot.card];
  return { kind: /** @type {const} */ ('swap'), first: first.target, second: second.target };
}

/** Complete a post-peek swap only after Done.
 * @param {GameState} state @param {string} id @param {unknown} payload @param {() => number} [random]
 */
export function choosePowerSwap(state, id, payload, random = Math.random) {
  const { player, card, definition } = requirePendingPower(state, id, ['awaitingSwap']);
  const policy = requirePostPeekSwap(definition);
  const result = exchangePair(validateSwapPair(state, payload, policy));
  finishTurn(state, player, card, random);
  return result;
}

/** Only a peek with a swap policy supports the later swap/skip stage.
 * @param {PowerDefinition} definition
 */
function requirePostPeekSwap(definition) {
  if (definition.initialAction !== 'peek' || !definition.swap) {
    throw new DomainError('POWER_NOT_AVAILABLE', 'This power has no post-peek swap.');
  }
  return definition.swap;
}

/** Decline before activation, during selection, or at the supported post-peek swap.
 * @param {GameState} state @param {string} id @param {() => number} [random]
 */
export function skipPower(state, id, random = Math.random) {
  const { player, card, definition } = state.turnStep === 'awaitingDrawnCardResolution'
    ? requirePowerStart(state, id) : requirePendingPower(state, id, ['awaitingChoice', 'awaitingTargets', 'awaitingSwap']);
  if (state.pendingPower?.stage === 'awaitingSwap') requirePostPeekSwap(definition);
  finishTurn(state, player, card, random);
}

/** Done follows the definition: offer a later swap, or discard and finish.
 * @param {GameState} state @param {string} id @param {() => number} [random]
 */
export function finishPowerPeek(state, id, random = Math.random) {
  const { player, card, power, definition } = requirePendingPower(state, id, ['awaitingPeekDone']);
  if (definition.initialAction !== 'peek') {
    throw new DomainError('POWER_NOT_AVAILABLE', 'This power has no peek to finish.');
  }
  if (definition.swap) {
    state.pendingPower = { power, stage: 'awaitingSwap' };
    return { completed: false };
  }
  finishTurn(state, player, card, random);
  return { completed: true };
}
