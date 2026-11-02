// Local power selections commit on the final valid click, with synchronous burst guards.
import { useEffect, useRef, useState } from 'react';
import { getPowerDefinition, getPowerSelectionPolicy, isPowerTargetAllowed, sameSlot } from '../game/powerPolicy.js';

/** @typedef {import('../../../shared/protocol.js').HandSlotRef} HandSlotRef */

/** Keep draft selection lifecycle separate from board layout and server-owned state.
 * @param {{ prompt: import('../game/gameClientState.js').PowerPrompt | null,
 * cards: import('../../../shared/protocol.js').CardView[], ownerId: string,
 * turnPlayerId: string | null, drawnPlayerId: string | undefined,
 * canChooseTargets: boolean, pendingAction: import('../game/gameClientState.js').PowerAction | null | undefined,
 * onChooseTargets: ((target: HandSlotRef | HandSlotRef[] | import('../../../shared/protocol.js').PlayerSwap) => void) | undefined }} options
 */
export function usePowerSelection({ prompt, cards, ownerId, turnPlayerId, drawnPlayerId,
  canChooseTargets, pendingAction, onChooseTargets }) {
  const [selectedTargets, setSelectedTargets] = useState(/** @type {HandSlotRef[]} */ ([]));
  const selection = useRef(selectedTargets);
  const submitting = useRef(false);
  const policy = getPowerSelectionPolicy(prompt);
  const active = Boolean(policy && (prompt?.stage === 'awaitingTargets' || prompt?.stage === 'awaitingSwap'));

  useEffect(() => {
    selection.current = [];
    setSelectedTargets([]);
    submitting.current = false;
  }, [prompt, turnPlayerId, drawnPlayerId]);
  useEffect(() => {
    if (pendingAction !== 'choosePowerTargets' && pendingAction !== 'choosePowerSwap') {
      selection.current = [];
      setSelectedTargets([]);
      submitting.current = false;
    }
  }, [pendingAction]);

  /** A two-card swap can add only a card from a different hand.
   * @param {string} playerId @param {HandSlotRef[]} targets
   */
  function isHandBlocked(playerId, targets) {
    return policy?.count === 2 && (targets.length === 2
      || policy.kind === 'swap' && targets.some(target => target.playerId === playerId));
  }

  /** Read refs rather than rendered state when multiple clicks arrive in one burst.
   * @param {HandSlotRef} target
   */
  function canSelectTarget(target) {
    if (!active || !policy || !canChooseTargets || submitting.current
      || !isPowerTargetAllowed(policy, target, cards, ownerId)) return false;
    return selection.current.some(previous => sameSlot(previous, target))
      || !isHandBlocked(target.playerId, selection.current);
  }

  /** No socket effects run inside a state updater or effect.
   * @param {HandSlotRef} target
   */
  function selectTarget(target) {
    if (!canSelectTarget(target) || !policy || !onChooseTargets) return;
    const previous = selection.current;
    const next = previous.some(ref => sameSlot(ref, target))
      ? previous.filter(ref => !sameSlot(ref, target)) : [...previous, target];
    selection.current = next;
    setSelectedTargets(next);
    if (next.length !== policy.count) return;
    submitting.current = true;
    onChooseTargets(policy.kind === 'swap' ? { first: next[0], second: next[1] }
      : getPowerDefinition(prompt?.power)?.postPeekSwap ? next : next[0]);
  }

  return {
    active, policy, selectTarget, canSelectTarget,
    /** @param {string} playerId */
    selectedSlotsFor: playerId => active ? selectedTargets.filter(target => target.playerId === playerId).map(target => target.handSlotId) : [],
    /** Selected cards remain available for deselection through PlayerHand. @param {string} playerId */
    isHandBlocked: playerId => isHandBlocked(playerId, selectedTargets),
  };
}
