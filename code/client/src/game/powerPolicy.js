// Client power rules shared by presentation, selection, and request validation.
/**
 * @typedef {import('../../../shared/protocol.js').PowerAvailable['power']} Power
 * @typedef {import('../../../shared/protocol.js').HandSlotRef} HandSlotRef
 * @typedef {import('./gameClientState.js').PowerPrompt} PowerPrompt
 * @typedef {Readonly<{ kind: 'peek' | 'swap', count: 1 | 2, ownership: 'self' | 'opponent' | 'any' }>} SelectionPolicy
 * @typedef {Readonly<{ initial: SelectionPolicy, postPeekSwap: boolean }>} PowerDefinition
 */

/** Every swap selects two cards from different players. @type {SelectionPolicy} */
const swapPolicy = { kind: 'swap', count: 2, ownership: 'any' };

/** @type {Readonly<Record<Power, PowerDefinition>>} */
const powerDefinitions = {
  selfPeek: { initial: { kind: 'peek', count: 1, ownership: 'self' }, postPeekSwap: false },
  opponentPeek: { initial: { kind: 'peek', count: 1, ownership: 'opponent' }, postPeekSwap: false },
  blindSwap: { initial: swapPolicy, postPeekSwap: false },
  onePeekSwap: { initial: { kind: 'peek', count: 1, ownership: 'any' }, postPeekSwap: true },
  twoPeekSwap: { initial: { kind: 'peek', count: 2, ownership: 'any' }, postPeekSwap: true },
};

/** Unknown powers never inherit another power's rules.
 * @param {string | null | undefined} power
 * @returns {PowerDefinition | null}
 */
export function getPowerDefinition(power) {
  return power && Object.hasOwn(powerDefinitions, power) ? powerDefinitions[/** @type {Power} */ (power)] : null;
}

/** Derive the later swap policy without changing the original peek definition.
 * @param {PowerPrompt | null | undefined} prompt
 * @returns {SelectionPolicy | null}
 */
export function getPowerSelectionPolicy(prompt) {
  const definition = getPowerDefinition(prompt?.power);
  if (!definition) return null;
  return prompt?.stage === 'awaitingSwap' ? (definition.postPeekSwap ? swapPolicy : null) : definition.initial;
}

/** Slot numbers are unique only within one player's hand.
 * @param {HandSlotRef} first @param {HandSlotRef} second
 */
export function sameSlot(first, second) {
  return first.playerId === second.playerId && first.handSlotId === second.handSlotId;
}

/** Ownership controls which hands offer power targets.
 * @param {SelectionPolicy} policy @param {string} playerId @param {string} ownerId
 */
export function allowsPowerTargetOwner(policy, playerId, ownerId) {
  return policy.ownership === 'any' || (policy.ownership === 'self' ? playerId === ownerId : playerId !== ownerId);
}

/** Validate one candidate against current occupancy and ownership.
 * @param {SelectionPolicy} policy @param {HandSlotRef | null | undefined} target
 * @param {HandSlotRef[]} cards @param {string} ownerId
 */
export function isPowerTargetAllowed(policy, target, cards, ownerId) {
  return Boolean(target && allowsPowerTargetOwner(policy, target.playerId, ownerId)
    && cards.some(card => sameSlot(card, target)));
}

/** Complete selections are distinct, occupied, and obey the stage's ownership/swap policy.
 * @param {SelectionPolicy | null} policy @param {HandSlotRef[]} targets
 * @param {HandSlotRef[]} cards @param {string} ownerId
 */
export function isValidPowerSelection(policy, targets, cards, ownerId) {
  if (!policy || targets.length !== policy.count || !targets.every(target => isPowerTargetAllowed(policy, target, cards, ownerId))) return false;
  if (targets.some((target, index) => targets.slice(0, index).some(previous => sameSlot(previous, target)))) return false;
  return policy.kind !== 'swap' || targets[0].playerId !== targets[1].playerId;
}
