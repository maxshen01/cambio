// Verifies source geometry, preserved draw movements, and nonblocking animation cleanup under jsdom.
import { useRef } from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useCardMovements } from '../../src/cards/useCardMovements.js';

const originalAnimate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
let animate;
let cancel;
beforeEach(() => {
  cancel = vi.fn();
  // Never complete: card layout and subsequent events must not wait for this promise.
  animate = vi.fn(() => ({ cancel, finished: new Promise(() => {}) }));
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
    const left = this.classList.contains('setup-deck') ? 10 : this.classList.contains('setup-discard') ? 110 : 50;
    const top = this.classList.contains('setup-drawn') ? 100 : 0;
    return { left, top, width: 40, height: 60 };
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  if (originalAnimate) Object.defineProperty(Element.prototype, 'animate', originalAnimate);
  else delete Element.prototype.animate;
});

function Piles({ movement, top = true, held = true }) {
  const board = useRef(null);
  useCardMovements(board, movement, true);
  return <div ref={board}>
    <div className="setup-deck"><img className="setup-card" alt="Deck" /></div>
    <div className="setup-discard">{top && <img className="setup-card" alt="Discard" />}</div>
    <div className="setup-drawn">{held && <img className="setup-card" alt="Held" />}</div>
  </div>;
}

it.each([['deck', -40], ['discard', 60]])('draws from %s geometry and preserves movement when the pile becomes empty', (source, x) => {
  const movement = { id: 1, kind: 'draw', source };
  const view = render(<Piles movement={movement} />);
  expect(animate).toHaveBeenCalledTimes(1);
  expect(animate).toHaveBeenCalledWith([
    { transform: `translate(${x}px, -100px)` }, { transform: 'translate(0, 0)' },
  ], { duration: 180, easing: 'ease-out' });
  view.rerender(<Piles movement={movement} top={false} />);
  expect(animate).toHaveBeenCalledTimes(1);
  expect(cancel).not.toHaveBeenCalled();
  expect(view.getByAltText('Held')).toBeInTheDocument();
  view.rerender(<Piles movement={null} top={false} held={false} />);
  expect(view.queryByAltText('Held')).not.toBeInTheDocument();
  expect(cancel).toHaveBeenCalledTimes(1);
});

it('uses reserved discard geometry when the sole card is already absent', () => {
  render(<Piles movement={{ id: 1, kind: 'draw', source: 'discard' }} top={false} />);
  expect(animate.mock.calls[0][0][0]).toEqual({ transform: 'translate(60px, -100px)' });
});

it('respects reduced motion while immediately updating the layout', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  const view = render(<Piles movement={{ id: 1, kind: 'draw', source: 'discard' }} top={false} />);
  expect(view.getByAltText('Held')).toBeInTheDocument();
  expect(animate).not.toHaveBeenCalled();
});
