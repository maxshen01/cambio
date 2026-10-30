// Self-peek UI acceptance with real client state/actions and controlled socket responses.
import { StrictMode } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { App } from '../../src/App.jsx';
import { FakeSocket } from '../helpers/fakeSocket.js';
import { activatePowerClient, startPower, revealPeek, players, cards } from '../helpers/powerClient.js';
import { CARD_BACK_IMAGE, CARD_IMAGES } from '../../../shared/cardCatalog.js';

async function board(localId = 'p1') {
  const socket = new FakeSocket();
  render(<StrictMode><App socket={socket} /></StrictMode>);
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox'), 'Player');
  await user.click(screen.getByRole('button', { name: 'Join lobby' }));
  act(() => activatePowerClient(socket, localId));
  await screen.findByRole('img', { name: /Drawn card for Player 1/ });
  act(() => startPower(socket, localId));
  return { socket, user };
}
const powerRequests = socket => socket.emissions.filter(entry => ['usePower', 'skipPower', 'finishPowerPeek'].includes(entry.event));
const own = () => within(screen.getByRole('listitem', { name: 'Seat 1' }));
const slot = id => own().getByRole('img', { name: `Slot ${id}, face down` }).closest('[data-slot]');
const held = () => screen.getByRole('img', { name: 'Drawn card for Player 1, face up' });

it('Use selects only occupied own slots, sends once after selection, and waits for an authorized face', async () => {
  const { socket, user } = await board();
  expect(screen.getByText('Look at one of your own cards. It stays visible until you choose Done.')).toBeVisible();
  const shared = held();
  expect(shared.closest('.setup-drawn')).toHaveClass('setup-drawn--power');
  expect(screen.getByRole('button', { name: 'Discard drawn card' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Use', exact: true }));
  expect(powerRequests(socket)).toEqual([]);
  expect(screen.getByText('Choose one of your cards.')).toBeVisible();
  const targets = own().getAllByRole('button', { name: /Peek at slot/ });
  expect(targets).toHaveLength(4);
  expect(targets[0]).toHaveFocus();
  expect(own().queryByRole('button', { name: /Peek at slot 5/ })).not.toBeInTheDocument();
  const opponent = within(screen.getByRole('listitem', { name: 'Seat 2' }));
  expect(opponent.queryByRole('button')).not.toBeInTheDocument();
  await user.click(opponent.getByRole('img', { name: 'Slot 1, face down' }));
  expect(powerRequests(socket)).toEqual([]);
  fireEvent.click(targets[1]);
  fireEvent.click(targets[2]);
  expect(powerRequests(socket)).toEqual([{ event: 'usePower', payload: { peekTarget: { playerId: 'p1', handSlotId: 2 } }, ack: undefined }]);
  expect(slot(2)).toHaveClass('setup-hand__slot--selected');
  expect(slot(3)).not.toHaveClass('setup-hand__slot--selected');
  expect(own().queryByRole('img', { name: /face up/ })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: "Don't use" })).toBeDisabled();
  expect(held()).toBe(shared);
  act(() => revealPeek(socket));
  expect(own().getByRole('img', { name: 'Slot 2, face up' })).toHaveAttribute('src', CARD_IMAGES[12]);
  expect(screen.getByRole('button', { name: 'Done' })).toHaveFocus();
  expect(screen.queryByRole('button', { name: "Don't use" })).not.toBeInTheDocument();
  expect(held()).toBe(shared);
});

it('retains the peek without a timer, hides it immediately on Done, and restores it after rejection', async () => {
  const { socket, user } = await board();
  act(() => revealPeek(socket));
  vi.useFakeTimers();
  try {
    act(() => vi.advanceTimersByTime(60000));
    expect(own().getByRole('img', { name: 'Slot 2, face up' })).toHaveAttribute('src', CARD_IMAGES[12]);
  } finally { vi.useRealTimers(); }
  const shared = held();
  await user.click(screen.getByRole('button', { name: 'Done' }));
  expect(own().getByRole('img', { name: 'Slot 2, face down' })).toHaveAttribute('src', CARD_BACK_IMAGE);
  expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
  expect(held()).toBe(shared);
  act(() => socket.receive('error', { code: 'POWER_NOT_AVAILABLE', message: 'Retry Done' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Retry Done');
  expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Done' })).toHaveFocus();
  expect(own().getByRole('img', { name: 'Slot 2, face up' })).toHaveAttribute('src', CARD_IMAGES[12]);
  await user.click(screen.getByRole('button', { name: 'Done' }));
  act(() => socket.receive('discardPileUpdated', { top: { cardId: 7 } }));
  expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();
  expect(screen.queryByText(/Look at one of your own cards/)).not.toBeInTheDocument();
  expect(screen.queryByRole('img', { name: /Drawn card/ })).not.toBeInTheDocument();
  expect(own().getByRole('img', { name: 'Slot 2, face down' })).toHaveAttribute('src', CARD_BACK_IMAGE);
  expect(screen.getByRole('button', { name: 'Draw from deck' })).toBeDisabled();
  act(() => socket.receive('turnChanged', { playerId: 'p2' }));
});

it('clears rejected selections for retry and restores a rejected Skip without discarding', async () => {
  const { socket, user } = await board();
  await user.click(screen.getByRole('button', { name: 'Use', exact: true }));
  await user.click(own().getByRole('button', { name: 'Peek at slot 2' }));
  act(() => socket.receive('error', { code: 'INVALID_POWER_TARGET', message: 'Choose again' }));
  expect(slot(2)).not.toHaveClass('setup-hand__slot--selected');
  expect(own().getByRole('button', { name: 'Peek at slot 1' })).toBeEnabled();
  expect(own().queryByRole('img', { name: /face up/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: "Don't use" }));
  expect(screen.getByRole('button', { name: "Don't use" })).toBeDisabled();
  act(() => socket.receive('error', { code: 'POWER_NOT_AVAILABLE', message: 'Retry Skip' }));
  expect(screen.getByRole('button', { name: "Don't use" })).toBeEnabled();
  expect(held()).toHaveAttribute('src', CARD_IMAGES[7]);
  await user.click(screen.getByRole('button', { name: "Don't use" }));
  expect(powerRequests(socket).map(request => request.event)).toEqual(['usePower', 'skipPower', 'skipPower']);
  act(() => {
    socket.receive('discardPileUpdated', { top: { cardId: 7 } });
    socket.receive('turnChanged', { playerId: 'p2' });
  });
  expect(screen.queryByText(/Choose one of your cards/)).not.toBeInTheDocument();
  expect(screen.queryByRole('img', { name: /Drawn card/ })).not.toBeInTheDocument();
});

it('provides keyboard Use, target selection, and Done', async () => {
  const { socket, user } = await board();
  screen.getByRole('button', { name: 'Use', exact: true }).focus();
  await user.keyboard('{Enter}');
  expect(own().getByRole('button', { name: 'Peek at slot 1' })).toHaveFocus();
  await user.keyboard(' ');
  expect(powerRequests(socket)[0].payload.peekTarget.handSlotId).toBe(1);
  act(() => {
    socket.receive('powerCardRevealed', { playerId: 'p1', faceUp: true, cardId: 7 });
    socket.receive('powerPeekResult', { targets: [{ playerId: 'p1', handSlotId: 1, faceUp: true, cardId: 12 }] });
  });
  expect(screen.getByRole('button', { name: 'Done' })).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(powerRequests(socket).map(request => request.event)).toEqual(['usePower', 'finishPowerPeek']);
});

it('shows an opponent only the public held card and facedown target outline', async () => {
  const { socket } = await board('p2');
  expect(screen.getByRole('img', { name: 'Drawn card for Player 1, face down' })).toHaveAttribute('src', CARD_BACK_IMAGE);
  act(() => revealPeek(socket));
  expect(held()).toHaveAttribute('src', CARD_IMAGES[7]);
  expect(slot(2)).toHaveClass('setup-hand__slot--peeked');
  expect(own().getByRole('img', { name: 'Slot 2, face down' })).toHaveAttribute('src', CARD_BACK_IMAGE);
  for (const name of ['Use', "Don't use", 'Done']) expect(screen.queryByRole('button', { name, exact: true })).not.toBeInTheDocument();
  expect(screen.queryByText(/Look at one of your own cards/)).not.toBeInTheDocument();
  expect(powerRequests(socket)).toEqual([]);
});

it.each(['abort', 'deal', 'loss'])('clears power controls and temporary faces on %s', async boundary => {
  const { socket } = await board();
  act(() => revealPeek(socket));
  expect(own().getByRole('img', { name: 'Slot 2, face up' })).toBeVisible();
  act(() => {
    if (boundary === 'abort') socket.receive('gameAborted', { reason: 'SERVER_ERROR', lobby: { players } });
    else if (boundary === 'deal') socket.receive('dealComplete', { cards });
    else socket.disconnect();
  });
  expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();
  expect(screen.queryByText(/Look at one of your own cards/)).not.toBeInTheDocument();
  expect(screen.queryByRole('img', { name: /face up/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('img', { name: /Drawn card/ })).not.toBeInTheDocument();
});
