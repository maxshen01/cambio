// Brief event-driven card movements; presentation never waits before applying game events.
import { useLayoutEffect } from 'react';

/** Measure and move a destination image in its hand's rotated coordinates.
 * @param {Element | null} from @param {Element | null} to
 */
function moveCard(from, to) {
  const image = to?.querySelector('.setup-card');
  if (!from || !to || !(image instanceof HTMLElement) || typeof image.animate !== 'function') return null;
  const source = from.getBoundingClientRect();
  const destination = to.getBoundingClientRect();
  const dx = source.left + source.width / 2 - destination.left - destination.width / 2;
  const dy = source.top + source.height / 2 - destination.top - destination.height / 2;
  const seat = to.closest('.setup-player');
  const angle = seat?.classList.contains('setup-player--top') ? Math.PI
    : seat?.classList.contains('setup-player--left') ? Math.PI / 2
      : seat?.classList.contains('setup-player--right') ? -Math.PI / 2 : 0;
  const x = dx * Math.cos(angle) + dy * Math.sin(angle);
  const y = -dx * Math.sin(angle) + dy * Math.cos(angle);
  return image.animate([
    { transform: `translate(${x}px, ${y}px)` }, { transform: 'translate(0, 0)' },
  ], { duration: 180, easing: 'ease-out' });
}

/** Animate the current card images between measured board locations, without retaining faces.
 * @param {import('react').RefObject<HTMLElement | null>} board
 * @param {import('../game/gameClientState.js').GameClientState['movement']} movement
 * @param {boolean} artworkReady
 * @param {boolean} [powerDiscarded] Animate completion independently so hand movements are preserved.
 */
export function useCardMovements(board, movement, artworkReady, powerDiscarded = false) {
  useLayoutEffect(() => {
    const root = board.current;
    if (!root || !movement || !artworkReady || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    /** @type {Animation[]} */
    const animations = [];
    /** @param {Element | null} from @param {Element | null} to */
    function move(from, to) {
      const animation = moveCard(from, to);
      if (animation) animations.push(animation);
    }
    const drawn = root.querySelector('.setup-drawn');
    const discard = root.querySelector('.setup-discard');
    /** @param {import('../../../shared/protocol.js').HandSlotRef} target */
    const handSlot = target => [...root.querySelectorAll('.setup-hand__slot')].find(element =>
      element instanceof HTMLElement && element.dataset.playerId === target.playerId
        && element.dataset.slot === String(target.handSlotId)) ?? null;
    if (movement.kind === 'draw') move(movement.source === 'discard' ? discard : root.querySelector('.setup-deck'), drawn);
    else if (movement.kind === 'discard') move(drawn, discard);
    else if (movement.kind === 'powerSwap') {
      const first = handSlot(movement.first);
      const second = handSlot(movement.second);
      move(first, second);
      move(second, first);
    }
    else {
      const target = movement.target;
      const slot = handSlot(target);
      move(drawn, slot);
      move(slot, discard);
    }
    return () => { animations.forEach(animation => animation.cancel()); };
  }, [board, movement, artworkReady]);
  useLayoutEffect(() => {
    const root = board.current;
    if (!root || movement?.kind !== 'powerSwap' || !powerDiscarded || !artworkReady
      || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const animation = moveCard(root.querySelector('.setup-drawn'), root.querySelector('.setup-discard'));
    return () => animation?.cancel();
  }, [board, movement, artworkReady, powerDiscarded]);
}
