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

it.each([
  ['discard', 'discard'], ['discard', 'deck'], ['deck', 'discard'],
])('locks overlapping %s / %s draw requests before rerender and restores eligible controls on rejection', (first, second) => {
  const { socket, result } = hook();
  expect(result.current.permissions.canDrawDiscard).toBe(false);
  act(() => result.current.actions.drawFromDiscard());
  expect(socket.emissions.filter(entry => entry.event === 'drawCard')).toHaveLength(0);
  act(() => {
    socket.receive('discardPileUpdated', { top: { cardId: 7 } });
    socket.receive('turnChanged', { playerId: 'p1' });
  });
  expect(result.current.permissions.canDrawDiscard).toBe(true);
  const before = result.current.state;
  const draw = source => source === 'discard' ? result.current.actions.drawFromDiscard() : result.current.actions.drawFromDeck();
  act(() => { draw(first); draw(second); result.current.actions.replaceHandCard(1); });
  expect(socket.emissions.filter(entry => entry.event === 'drawCard')).toEqual([
    { event: 'drawCard', payload: { source: first }, ack: undefined },
  ]);
  expect(result.current.permissions).toMatchObject({ canDraw: false, canDrawDiscard: false });
  expect(result.current.state.discardTop).toBe(before.discardTop);
  act(() => socket.receive('error', { code: 'DRAW_NOT_AVAILABLE', message: 'Try again' }));
  expect(result.current.state).toMatchObject({ drawnCard: null, discardTop: { cardId: 7 }, error: { message: 'Try again' } });
  expect(result.current.permissions).toMatchObject({ canDraw: true, canDrawDiscard: true });
  act(() => result.current.actions.drawFromDiscard());
  expect(socket.emissions.filter(entry => entry.event === 'drawCard')).toHaveLength(2);
  act(() => socket.receive('cardDrawn', { playerId: 'p1', source: 'discard', faceUp: true, cardId: 7 }));
  expect(result.current.permissions).toMatchObject({ canDraw: false, canDrawDiscard: false, canReplace: true, canDiscardDrawn: false });
  expect(result.current.state.movement).toMatchObject({ kind: 'draw', source: 'discard' });
});

it('keeps discard drawing unavailable for opponents, an empty pile, and a lost session', () => {
  const { socket, result } = hook();
  act(() => {
    socket.receive('discardPileUpdated', { top: { cardId: 7 } });
    socket.receive('turnChanged', { playerId: 'p2' });
  });
  act(() => result.current.actions.drawFromDiscard());
  expect(result.current.permissions.canDrawDiscard).toBe(false);
  act(() => {
    socket.receive('discardPileUpdated', { top: null });
    socket.receive('turnChanged', { playerId: 'p1' });
  });
  expect(result.current.permissions).toMatchObject({ canDraw: true, canDrawDiscard: false });
  act(() => result.current.actions.drawFromDiscard());
  act(() => socket.disconnect());
  act(() => result.current.actions.drawFromDiscard());
  expect(socket.emissions.filter(entry => entry.event === 'drawCard')).toHaveLength(0);
});

it.each([null, { cardId: 8 }])('retains public discard draws through pile update %j and separates resolution permissions', top => {
  const { socket, result } = hook();
  const notice = { playerId: 'p1', source: 'discard', faceUp: true, cardId: 7 };
  act(() => socket.receive('cardDrawn', notice));
  expect(result.current.state.drawnCard).toEqual(notice);
  expect(result.current.permissions).toMatchObject({ canDraw: false, canReplace: true, canDiscardDrawn: false });
  const movement = result.current.state.movement;
  act(() => socket.receive('discardPileUpdated', { top }));
  expect(result.current.state).toMatchObject({ drawnCard: notice, discardTop: top, awaitingTurn: false });
  expect(result.current.state.movement).toBe(movement);
  act(() => result.current.actions.discardDrawnCard());
  expect(socket.emissions.filter(entry => entry.event === 'discardDrawnCard')).toHaveLength(0);
  act(() => result.current.actions.replaceHandCard(1));
  expect(result.current.permissions).toMatchObject({ canReplace: false, canDiscardDrawn: false });
  act(() => socket.receive('discardPileUpdated', { top }));
  expect(result.current.state.turnPending).toBe(true);
  expect(result.current.state.drawnCard).toEqual(notice);
  act(() => socket.receive('error', { code: 'INVALID_TARGET', message: 'Try again' }));
  expect(result.current.permissions).toMatchObject({ canReplace: true, canDiscardDrawn: false });
  expect(result.current.state.drawnCard).toEqual(notice);
  act(() => socket.receive('cardSwapped', { kind: 'drawn', target: { playerId: 'p1', handSlotId: 1 } }));
  expect(result.current.state).toMatchObject({ drawnCard: null, awaitingTurn: true, movement: { kind: 'swap' } });
  act(() => socket.receive('discardPileUpdated', { top: { cardId: 4 } }));
  expect(result.current.state).toMatchObject({ drawnCard: null, discardTop: { cardId: 4 }, awaitingTurn: true });
});

it('honors public opponent faces but strips identity from facedown notices', () => {
  const { socket, result } = hook();
  act(() => socket.receive('turnChanged', { playerId: 'p2' }));
  act(() => socket.receive('cardDrawn', { playerId: 'p2', source: 'discard', faceUp: true, cardId: 7 }));
  act(() => socket.receive('discardPileUpdated', { top: null }));
  expect(result.current.state.drawnCard).toEqual({ playerId: 'p2', source: 'discard', faceUp: true, cardId: 7 });
  expect(result.current.permissions).toMatchObject({ canDraw: false, canReplace: false, canDiscardDrawn: false });
  act(() => socket.receive('cardDrawn', { playerId: 'p2', source: 'deck', faceUp: false, cardId: 9 }));
  expect(result.current.state.drawnCard).toEqual({ playerId: 'p2', source: 'deck', faceUp: false });
});

it.each(['turn', 'deal', 'lobby', 'loss'])('clears source and stale draw movement on %s', boundary => {
  const { socket, result } = hook();
  act(() => socket.receive('cardDrawn', { playerId: 'p1', source: 'discard', faceUp: true, cardId: 7 }));
  act(() => {
    if (boundary === 'turn') socket.receive('turnChanged', { playerId: 'p2' });
    else if (boundary === 'deal') socket.receive('dealComplete', { cards });
    else if (boundary === 'lobby') socket.receive('gameAborted', { reason: 'SERVER_ERROR', lobby: { players } });
    else socket.disconnect();
  });
  expect(result.current.state).toMatchObject({ drawnCard: null, movement: null });
  expect(result.current.permissions).toMatchObject({ canReplace: false, canDiscardDrawn: false });
});

it('guards same-render requests, retains a rejected board, and resolves only from events', () => {
  const { socket, result } = hook();
  act(() => { result.current.actions.drawFromDeck(); result.current.actions.drawFromDeck(); });
  expect(socket.emissions.filter(entry => entry.event === 'drawCard')).toHaveLength(1);
  expect(result.current).toMatchObject({ state: { turnPending: true, drawnCard: null }, permissions: { canDraw: false } });
  act(() => socket.receive('error', { code: 'DECK_EMPTY', message: 'Empty' }));
  expect(result.current).toMatchObject({ state: { turnPending: false, drawnCard: null }, permissions: { canDraw: true } });
  act(() => result.current.actions.drawFromDeck());
  act(() => socket.receive('cardDrawn', { playerId: 'p1', source: 'deck', faceUp: true, cardId: 7 }));
  expect(result.current).toMatchObject({ state: { drawnCard: { source: 'deck', cardId: 7 } }, permissions: { canDraw: false, canReplace: true, canDiscardDrawn: true } });
  act(() => { result.current.actions.replaceHandCard(1); result.current.actions.discardDrawnCard(); result.current.actions.replaceHandCard(2); });
  expect(socket.emissions.filter(entry => entry.event === 'swapDrawnCard')).toEqual([
    { event: 'swapDrawnCard', payload: { target: { playerId: 'p1', handSlotId: 1 } }, ack: undefined },
  ]);
  act(() => socket.receive('error', { code: 'INVALID_TARGET', message: 'Try again' }));
  expect(result.current.state.drawnCard.cardId).toBe(7);
  expect(result.current.permissions.canDiscardDrawn).toBe(true);
  act(() => result.current.actions.discardDrawnCard());
  act(() => socket.receive('discardPileUpdated', { top: { cardId: 7 } }));
  expect(result.current).toMatchObject({ state: { drawnCard: null, discardTop: { cardId: 7 } }, permissions: { canDraw: false, canReplace: false, canDiscardDrawn: false } });
  act(() => socket.receive('turnChanged', { playerId: 'p2' }));
  expect(result.current).toMatchObject({ state: { turnPending: false, turnPlayerId: 'p2' }, permissions: { canDraw: false } });
  expect(result.current.state.cards.every(card => !('cardId' in card))).toBe(true);
});

it('retains authorized opponent faces, keeps discard updates separate, and cleans late listeners', () => {
  const { socket, result, unmount } = hook();
  act(() => socket.receive('turnChanged', { playerId: 'p2' }));
  act(() => socket.receive('cardDrawn', { playerId: 'p2', source: 'discard', faceUp: true, cardId: 7 }));
  expect(result.current.state.drawnCard).toEqual({ playerId: 'p2', source: 'discard', faceUp: true, cardId: 7 });
  expect(result.current.permissions.canReplace).toBe(false);
  act(() => socket.receive('cardSwapped', { kind: 'drawn', target: { playerId: 'p2', handSlotId: 2 } }));
  expect(result.current.state.drawnCard).toBeNull();
  expect(result.current.state.cards.find(card => card.playerId === 'p2' && card.handSlotId === 2)).toEqual({ playerId: 'p2', handSlotId: 2, faceUp: false });
  const late = ['cardDrawn', 'discardPileUpdated', 'cardSwapped'].map(event => [...socket.listeners.get(event)][0]);
  act(() => socket.disconnect());
  act(() => { late[0]({ playerId: 'p1', source: 'discard', faceUp: true, cardId: 7 }); late[1]({ top: { cardId: 7 } }); });
  expect(result.current).toMatchObject({ state: { drawnCard: null, discardTop: null, turnPending: false, movement: null } });
  unmount();
  for (const listeners of socket.listeners.values()) expect(listeners.size).toBe(0);
  act(() => late[2]({ kind: 'drawn', target: { playerId: 'p1', handSlotId: 1 } }));
});

it('draws from discard with the keyboard, reports rejection without changing the board, and allows replacement only', async () => {
  const socket = new FakeSocket();
  render(<App socket={socket} />);
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox'), 'Player 1');
  await user.click(screen.getByRole('button', { name: 'Join lobby' }));
  act(() => activate(socket));
  await screen.findByRole('button', { name: 'Draw from deck' });
  expect(screen.queryByRole('button', { name: 'Draw from discard' })).not.toBeInTheDocument();
  act(() => {
    socket.receive('discardPileUpdated', { top: { cardId: 7 } });
    socket.receive('turnChanged', { playerId: 'p1' });
  });
  const discard = screen.getByRole('button', { name: 'Draw from discard' });
  expect(discard).toBeEnabled();
  discard.focus();
  await user.keyboard('{Enter}');
  expect(socket.emissions.filter(entry => entry.event === 'drawCard')).toEqual([
    { event: 'drawCard', payload: { source: 'discard' }, ack: undefined },
  ]);
  expect(discard).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Draw from deck' })).toBeDisabled();
  expect(screen.getByRole('img', { name: 'Discard pile' })).toHaveAttribute('src', CARD_IMAGES[7]);
  expect(screen.queryByRole('img', { name: /Drawn card/ })).not.toBeInTheDocument();
  act(() => socket.receive('error', { code: 'DRAW_NOT_AVAILABLE', message: 'Try again' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Try again');
  expect(discard).toBeEnabled();
  await user.click(discard);
  act(() => {
    socket.receive('cardDrawn', { playerId: 'p1', source: 'discard', faceUp: true, cardId: 7 });
    socket.receive('discardPileUpdated', { top: null });
  });
  expect(screen.getByRole('img', { name: 'Drawn card for Player 1, face up' })).toHaveAttribute('src', CARD_IMAGES[7]);
  expect(screen.queryByRole('button', { name: 'Draw from discard' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Discard drawn card' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Replace slot 1 with drawn card' })).toBeEnabled();
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
    act(() => socket.receive('cardDrawn', { playerId: 'p1', source: 'deck', faceUp: true, cardId: 7 }));
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
