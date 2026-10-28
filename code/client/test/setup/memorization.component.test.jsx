// Covers setup rendering and server-confirmed card privacy across both Ready stages.
import { StrictMode } from 'react';
import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { App } from '../../src/App.jsx';
import { useGameClient } from '../../src/game/useGameClient.js';
import { CARD_IMAGES, CARD_BACK_IMAGE } from '../../../shared/cardCatalog.js';
import { FakeSocket } from '../helpers/fakeSocket.js';

const players = ['Alice', 'Bob', 'Cara', 'Dan'].map((displayName, index) => ({
  playerId: `p${index + 1}`, seatId: index + 1, displayName, connected: true, isReady: true,
}));
function deal(local = 'p3', face = 53) {
  return { cards: players.flatMap(player => [1, 2, 3, 4].map(handSlotId => ({
    playerId: player.playerId, handSlotId,
    ...(player.playerId === local && [2, 4].includes(handSlotId)
      ? { faceUp: true, cardId: handSlotId === 2 ? face : 54 } : { faceUp: false }),
  }))) };
}
function joinHook(socket, result) {
  act(() => result.current.actions.joinLobby('Cara'));
  act(() => {
    socket.emissions[0].ack({ playerId: 'p3', seatId: 3 });
    socket.receive('playerJoined', { players });
  });
}
async function board() {
  const socket = new FakeSocket();
  const view = render(<App socket={socket} />);
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox'), 'Cara');
  await user.click(screen.getByRole('button', { name: 'Join lobby' }));
  act(() => {
    socket.emissions[0].ack({ playerId: 'p3', seatId: 3 });
    socket.receive('playerJoined', { players });
    socket.receive('dealComplete', deal());
  });
  await screen.findByRole('img', { name: 'Deck' });
  return { socket, view, user };
}

it('atomically replaces a deal, resets readiness and pending actions, and owns its display state', () => {
  const socket = new FakeSocket();
  const { result } = renderHook(() => useGameClient(socket));
  joinHook(socket, result);
  act(() => socket.receive('playerUnready', { playerId: 'p3' }));
  act(() => result.current.actions.toggleReady());
  expect(result.current.state.readyPending).toBe(true);
  const payload = deal();
  act(() => socket.receive('dealComplete', payload));
  expect(result.current).toMatchObject({ state: { stage: 'memorization', readyPending: false, joinPending: false, error: null }, permissions: { canReady: true } });
  expect(result.current.state.players.every(player => !player.isReady)).toBe(true);
  expect(result.current.state.cards).toEqual(payload.cards);
  expect(result.current.state.cards).not.toBe(payload.cards);
  payload.cards.forEach((card, index) => expect(result.current.state.cards[index]).not.toBe(card));
  act(() => { result.current.actions.toggleReady(); result.current.actions.toggleReady(); });
  expect(socket.emissions.filter(entry => entry.event === 'ready')).toHaveLength(2);
  expect(result.current.state.readyPending).toBe(true);
  act(() => socket.receive('playerReady', { playerId: 'p3' }));
  expect(result.current.state.cards.every(card => !card.faceUp && !('cardId' in card))).toBe(true);
  expect(payload.cards.filter(card => card.faceUp)).toHaveLength(2);
  act(() => socket.receive('dealComplete', deal('p3', 1)));
  expect(result.current.state.cards).toHaveLength(16);
  expect(result.current.state.cards.filter(card => card.faceUp).map(card => card.cardId)).toEqual([1, 54]);
  expect(result.current.permissions.canReady).toBe(true);
});

it('renders all named hands with stable local rotation, image mappings, and invisible empty space', async () => {
  const { socket } = await board();
  expect(screen.getByRole('heading', { name: 'Cambio' })).toBeVisible();
  expect(screen.getByRole('listitem', { name: 'Seat 3' })).toHaveClass('setup-player--bottom');
  expect(screen.getByRole('listitem', { name: 'Seat 4' })).toHaveClass('setup-player--left');
  expect(screen.getByRole('listitem', { name: 'Seat 1' })).toHaveClass('setup-player--top');
  expect(screen.getByRole('listitem', { name: 'Seat 2' })).toHaveClass('setup-player--right');
  const local = within(screen.getByRole('listitem', { name: 'Seat 3' }));
  expect(local.getByText('Cara')).toBeVisible();
  expect(local.getByRole('img', { name: 'Slot 2, face up' })).toHaveAttribute('src', CARD_IMAGES[53]);
  expect(local.getByRole('img', { name: 'Slot 4, face up' })).toHaveAttribute('src', CARD_IMAGES[54]);
  expect(screen.getAllByRole('img', { name: /face up/ })).toHaveLength(2);
  expect(screen.getAllByRole('img', { name: /face down/ })).toHaveLength(14);
  expect(screen.getByRole('img', { name: 'Deck' })).toHaveAttribute('src', CARD_BACK_IMAGE);
  expect(screen.getAllByRole('img')).toHaveLength(17);
  expect(screen.getByRole('button', { name: 'Call Cambio' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Unready' })).not.toBeInTheDocument();
  for (const seat of screen.getAllByRole('listitem')) {
    const slots = seat.querySelectorAll('.setup-hand__slot');
    expect(slots).toHaveLength(8);
    [...slots].forEach((slot, index) => expect(slot).toHaveStyle({
      gridColumn: String(Math.ceil((index + 1) / 2)), gridRow: String(index % 2 === 0 ? 1 : 2),
    }));
    for (const slot of [...slots].slice(4)) {
      expect(slot).toBeEmptyDOMElement();
      expect(slot).toHaveAttribute('aria-hidden', 'true');
    }
    expect(seat.querySelector('.setup-drawn')).toBeNull();
  }
  const drawnAreas = document.querySelectorAll('.setup-drawn');
  expect(drawnAreas).toHaveLength(1);
  expect(drawnAreas[0].parentElement).toHaveClass('setup-piles');
  expect(drawnAreas[0].previousElementSibling).toHaveClass('setup-discard');
  expect(drawnAreas[0]).toBeEmptyDOMElement();
  expect(drawnAreas[0]).toHaveAttribute('aria-hidden', 'true');
  expect(document.querySelector('.setup-discard')).toBeEmptyDOMElement();
  const emissions = socket.emissions.length;
  screen.getAllByRole('img').forEach(image => fireEvent.click(image));
  expect(socket.emissions).toHaveLength(emissions);
});

it('preserves server-projected opening views and rejects deals without four seated members', () => {
  const socket = new FakeSocket();
  const { result } = renderHook(() => useGameClient(socket));
  joinHook(socket, result);
  const payload = deal();
  act(() => socket.receive('dealComplete', payload));
  expect(result.current.state.cards.filter(card => 'cardId' in card).map(card => [card.playerId, card.handSlotId]))
    .toEqual([['p3', 2], ['p3', 4]]);
  act(() => socket.receive('playerDisconnected', { players: players.slice(1) }));
  act(() => socket.receive('dealComplete', payload));
  expect(result.current).toMatchObject({ state: { stage: 'lobby', cards: [], readyPending: false } });
});

it('keeps faces pending and after rejection, then hides them only on the local confirmation', async () => {
  const { socket, user } = await board();
  const ready = screen.getByRole('button', { name: 'Ready Up' });
  await user.click(ready);
  await user.click(ready);
  expect(socket.emissions.at(-1)).toEqual({ event: 'ready', payload: {}, ack: undefined });
  expect(socket.emissions).toHaveLength(2);
  expect(ready).toBeDisabled();
  expect(screen.getAllByRole('img', { name: /face up/ })).toHaveLength(2);
  act(() => socket.receive('playerReady', { playerId: 'p1' }));
  expect(within(screen.getByRole('listitem', { name: 'Seat 1' })).getByText('Ready')).toBeInTheDocument();
  expect(ready).toBeDisabled();
  expect(screen.getAllByRole('img', { name: /face up/ })).toHaveLength(2);
  act(() => socket.receive('error', { code: 'READY_NOT_AVAILABLE', message: 'Try Ready again.' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Try Ready again.');
  expect(ready).toBeEnabled();
  expect(screen.getAllByRole('img', { name: /face up/ })).toHaveLength(2);
  await user.click(ready);
  act(() => socket.receive('playerReady', { playerId: 'p3' }));
  expect(screen.queryAllByRole('img', { name: /face up/ })).toHaveLength(0);
  expect(screen.getAllByRole('img', { name: /face down/ })).toHaveLength(16);
  expect(ready).toBeDisabled();
  act(() => socket.receive('playerReady', { playerId: 'p3' }));
  act(() => socket.receive('playerUnready', { playerId: 'p3' }));
  expect(ready).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Unready' })).not.toBeInTheDocument();
});

it('clears the board and pending Ready on departure and accepts a replacement deal', async () => {
  const { socket, user } = await board();
  await user.click(screen.getByRole('button', { name: 'Ready Up' }));
  act(() => socket.receive('playerDisconnected', { players: players.filter(player => player.playerId !== 'p2')
    .map(player => ({ ...player, isReady: false })) }));
  expect(screen.getByRole('heading', { name: 'Cambio lobby' })).toBeVisible();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Ready Up' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: 'Ready Up' }));
  expect(socket.emissions.filter(entry => entry.event === 'ready')).toHaveLength(2);
  act(() => {
    socket.receive('playerJoined', { players });
    socket.receive('dealComplete', deal());
  });
  expect(screen.getAllByRole('img')).toHaveLength(17);
  expect(screen.getByRole('button', { name: 'Ready Up' })).toBeEnabled();
});

it('clears private display state on loss, ignores late setup events, and cleans every listener', () => {
  const socket = new FakeSocket();
  const { result, unmount } = renderHook(() => useGameClient(socket), { wrapper: StrictMode });
  joinHook(socket, result);
  act(() => socket.receive('dealComplete', deal()));
  act(() => result.current.actions.toggleReady());
  const lateDeal = [...socket.listeners.get('dealComplete')][0];
  const lateTurn = [...socket.listeners.get('turnChanged')][0];
  act(() => socket.disconnect());
  act(() => {
    lateDeal(deal());
    lateTurn({ playerId: 'p1' });
    socket.receive('playerReady', { playerId: 'p3' });
    socket.receive('playerDisconnected', { players });
  });
  expect(result.current).toMatchObject({ state: { stage: 'lobby', cards: [], identity: null, readyPending: false }, permissions: { canReady: false } });
  unmount();
  for (const listeners of socket.listeners.values()) expect(listeners.size).toBe(0);
  act(() => lateDeal(deal()));
  act(() => lateTurn({ playerId: 'p1' }));
});

it('enters active play from turnChanged, removes all face IDs, and blocks setup requests', () => {
  const socket = new FakeSocket();
  const { result } = renderHook(() => useGameClient(socket));
  joinHook(socket, result);
  act(() => socket.receive('dealComplete', deal()));
  act(() => result.current.actions.toggleReady());
  act(() => socket.receive('turnChanged', { playerId: 'p2' }));
  expect(result.current).toMatchObject({ state: { stage: 'active', turnPlayerId: 'p2', readyPending: false }, permissions: { canReady: false } });
  expect(result.current.state.cards).toHaveLength(16);
  expect(result.current.state.cards.every(card => !card.faceUp && !('cardId' in card))).toBe(true);
  const count = socket.emissions.length;
  act(() => { result.current.actions.toggleReady(); result.current.actions.toggleReady(); });
  expect(socket.emissions).toHaveLength(count);
  act(() => socket.disconnect());
  expect(result.current.state.turnPlayerId).toBeNull();
});

it('marks only the current player and keeps gameplay controls disabled', async () => {
  const { socket, user } = await board();
  act(() => socket.receive('turnChanged', { playerId: 'p2' }));
  expect(screen.getByRole('region', { name: 'Playing board' })).toBeInTheDocument();
  expect(screen.getByRole('listitem', { name: 'Seat 2' })).toHaveAttribute('aria-current', 'true');
  expect(document.querySelectorAll('.setup-player--current')).toHaveLength(1);
  expect(screen.getAllByRole('img', { name: /face down/ })).toHaveLength(16);
  expect(screen.queryByText('Not ready')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Ready Up' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Call Cambio' })).toBeDisabled();
  const count = socket.emissions.length;
  await user.click(screen.getByRole('img', { name: 'Deck' }));
  expect(socket.emissions).toHaveLength(count);
});
