// Brief event-driven card movements; presentation never waits before applying game events.
import { useLayoutEffect } from 'react';

/** Animate the current card images between measured board locations, without retaining faces.
 * @param {import('react').RefObject<HTMLElement | null>} board
 * @param {import('../lobby/lobbyReducer.js').LobbyState['movement']} movement
 * @param {boolean} artworkReady
 */
export function useCardMovements(board, movement, artworkReady) {
  useLayoutEffect(() => {
    const root = board.current;
    if (!root || !movement || !artworkReady || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    /** @type {Animation[]} */
    const animations = [];
    /** Convert screen offsets to the destination hand's rotated coordinates.
     * @param {Element | null} from @param {Element | null} to
     */
    function move(from, to) {
      const image = to?.querySelector('.setup-card');
      if (!from || !to || !(image instanceof HTMLElement) || typeof image.animate !== 'function') return;
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
      animations.push(image.animate([
        { transform: `translate(${x}px, ${y}px)` }, { transform: 'translate(0, 0)' },
      ], { duration: 180, easing: 'ease-out' }));
    }
    const drawn = root.querySelector('.setup-drawn');
    const discard = root.querySelector('.setup-discard');
    if (movement.kind === 'draw') move(root.querySelector('.setup-deck'), drawn);
    else if (movement.kind === 'discard') move(drawn, discard);
    else {
      const target = movement.target;
      const slot = [...root.querySelectorAll('.setup-hand__slot')].find(element =>
        element instanceof HTMLElement && element.dataset.playerId === target?.playerId
          && element.dataset.slot === String(target?.handSlotId));
      move(drawn, slot ?? null);
      move(slot ?? null, discard);
    }
    return () => { animations.forEach(animation => animation.cancel()); };
  }, [board, movement, artworkReady]);
}
