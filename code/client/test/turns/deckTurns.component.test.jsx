// Exercises deck controls, private display state, request guards, and socket lifetimes.
import { StrictMode } from 'react';
import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { App } from '../../src/App.jsx';
import { useGameClient } from '../../src/game/useGameClient.js';
import { FakeSocket } from '../helpers/fakeSocket.js';
import { CARD_IMAGES, CARD_BACK_IMAGE } from '../../../shared/cardCatalog.js';

const players = [1, 2, 3, 4].map(seatId => ({ playerId: `p${seatId}`, seatId, displayName: `Player ${seatId}`, isReady: true, connected: true }));
const cards = players.flatMap(player => [1, 2, 3, 4].map(handSlotId => ({ playerId: player.playerId, handSlotId, faceUp: false })));
function activate(socket) {
  socket.emissions[0].ack({ playerId: 'p1', seatId: 1 });
  socket.receive('playerJoined', { players });
  socket.receive('dealComplete', { cards });
  socket.receive('turnChanged', { playerId: 'p1' });
}
function hook() {
  const socket = new FakeSocket();
  const view = renderHook(() => useGameClient(socket), { wrapper: StrictMode });
  act(() => view.result.current.actions.joinLobby('Player 1'));
  act(() => activate(socket));
  return { socket, ...view };
}

it('guards same-render requests, retains a rejected board, and resolves only from events', () => {
  const { socket, result } = hook();
  act(() => { result.current.actions.drawFromDeck(); result.current.actions.drawFromDeck(); });
  expect(socket.emissions.filter(entry => entry.event === 'drawCard')).toHaveLength(1);
  expect(result.current).toMatchObject({ state: { turnPending: true, drawnCard: null }, permissions: { canDraw: false } });
  act(() => socket.receive('error', { code: 'DECK_EMPTY', message: 'Empty' }));
  expect(result.current).toMatchObject({ state: { turnPending: false, drawnCard: null }, permissions: { canDraw: true } });
  act(() => result.current.actions.drawFromDeck());
  act(() => socket.receive('cardDrawn', { playerId: 'p1', faceUp: true, cardId: 7 }));
  expect(result.current).toMatchObject({ state: { drawnCard: { cardId: 7 } }, permissions: { canDraw: false, canResolve: true } });
  act(() => { result.current.actions.replaceHandCard(1); result.current.actions.discardDrawnCard(); result.current.actions.replaceHandCard(2); });
  expect(socket.emissions.filter(entry => entry.event === 'swapDrawnCard')).toEqual([
    { event: 'swapDrawnCard', payload: { target: { playerId: 'p1', handSlotId: 1 } }, ack: undefined },
  ]);
  act(() => socket.receive('error', { code: 'INVALID_TARGET', message: 'Try again' }));
  expect(result.current.state.drawnCard.cardId).toBe(7);
  expect(result.current.permissions.canResolve).toBe(true);
  act(() => result.current.actions.discardDrawnCard());
  act(() => socket.receive('discardPileUpdated', { top: { cardId: 7 } }));
  expect(result.current).toMatchObject({ state: { drawnCard: null, discardTop: { cardId: 7 } }, permissions: { canDraw: false, canResolve: false } });
  act(() => socket.receive('turnChanged', { playerId: 'p2' }));
  expect(result.current).toMatchObject({ state: { turnPending: false, turnPlayerId: 'p2' }, permissions: { canDraw: false } });
  expect(result.current.state.cards.every(card => !('cardId' in card))).toBe(true);
});

it('sanitizes hidden/opponent faces, keeps discard updates separate, and cleans late listeners', () => {
  const { socket, result, unmount } = hook();
  act(() => socket.receive('turnChanged', { playerId: 'p2' }));
  act(() => socket.receive('cardDrawn', { playerId: 'p2', faceUp: true, cardId: 7 }));
  expect(result.current.state.drawnCard).toEqual({ playerId: 'p2', faceUp: false });
  expect(result.current.permissions.canResolve).toBe(false);
  act(() => socket.receive('cardSwapped', { kind: 'drawn', target: { playerId: 'p2', handSlotId: 2 } }));
  expect(result.current.state.drawnCard).toBeNull();
  expect(result.current.state.cards.find(card => card.playerId === 'p2' && card.handSlotId === 2)).toEqual({ playerId: 'p2', handSlotId: 2, faceUp: false });
  const late = ['cardDrawn', 'discardPileUpdated', 'cardSwapped'].map(event => [...socket.listeners.get(event)][0]);
  act(() => socket.disconnect());
  act(() => { late[0]({ playerId: 'p1', faceUp: true, cardId: 7 }); late[1]({ top: { cardId: 7 } }); });
  expect(result.current).toMatchObject({ state: { drawnCard: null, discardTop: null, turnPending: false, movement: null } });
  unmount();
  for (const listeners of socket.listeners.values()) expect(listeners.size).toBe(0);
  act(() => late[2]({ kind: 'drawn', target: { playerId: 'p1', handSlotId: 1 } }));
});

it('offers clickable deck/discard/own-slot controls with private shared cards and immediate movement', async () => {
  const animate = vi.fn(() => ({ cancel: vi.fn() }));
  const previous = Element.prototype.animate;
  Element.prototype.animate = animate;
  try {
    const socket = new FakeSocket();
    render(<App socket={socket} />);
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox'), 'Player 1');
    await user.click(screen.getByRole('button', { name: 'Join lobby' }));
    act(() => activate(socket));
    const deck = await screen.findByRole('button', { name: 'Draw from deck' });
    expect(deck).toBeEnabled();
    await user.click(deck);
    expect(deck).toBeDisabled();
    act(() => socket.receive('cardDrawn', { playerId: 'p1', faceUp: true, cardId: 7 }));
    expect(screen.getByRole('img', { name: 'Drawn card for Player 1, face up' })).toHaveAttribute('src', CARD_IMAGES[7]);
    expect(screen.getByRole('button', { name: 'Discard drawn card' })).toBeEnabled();
    const own = within(screen.getByRole('listitem', { name: 'Seat 1' }));
    const opponent = within(screen.getByRole('listitem', { name: 'Seat 2' }));
    expect(opponent.queryByRole('button', { name: /Replace/ })).not.toBeInTheDocument();
    const before = socket.emissions.length;
    fireEvent.click(own.getByRole('button', { name: 'Replace slot 1 with drawn card' }));
    fireEvent.click(own.getByRole('button', { name: 'Replace slot 2 with drawn card' }));
    expect(socket.emissions).toHaveLength(before + 1);
    act(() => {
      socket.receive('cardSwapped', { kind: 'drawn', target: { playerId: 'p1', handSlotId: 1 } });
      socket.receive('discardPileUpdated', { top: { cardId: 4 } });
      socket.receive('turnChanged', { playerId: 'p2' });
    });
    expect(own.getByRole('img', { name: 'Slot 1, face down' })).toHaveAttribute('src', CARD_BACK_IMAGE);
    expect(screen.queryByRole('button', { name: 'Discard drawn card' })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Discard pile' })).toHaveAttribute('src', CARD_IMAGES[4]);
    expect(screen.getByRole('button', { name: 'Draw from discard' })).toBeDisabled();
    expect(screen.getByRole('listitem', { name: 'Seat 2' })).toHaveAttribute('aria-current', 'true');
    expect(animate).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Ready Up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Call Cambio' })).toBeDisabled();
  } finally {
    if (previous) Element.prototype.animate = previous;
    else delete Element.prototype.animate;
  }
});
