// Self/opponent-peek UI acceptance with real client state/actions and controlled socket responses.
import { StrictMode } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { App } from '../../src/App.jsx';
import { FakeSocket } from '../helpers/fakeSocket.js';
import { activatePowerClient, startPower, revealPeek, players, cards } from '../helpers/powerClient.js';
import { CARD_BACK_IMAGE, CARD_IMAGES } from '../../../shared/cardCatalog.js';

async function board(localId = 'p1', power = 'selfPeek') {
  const socket = new FakeSocket();
  render(<StrictMode><App socket={socket} /></StrictMode>);
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox'), 'Player');
  await user.click(screen.getByRole('button', { name: 'Join lobby' }));
  act(() => activatePowerClient(socket, localId));
  await screen.findByRole('img', { name: /Drawn card for Player 1/ });
  act(() => startPower(socket, localId, power));
  return { socket, user };
}
const powerRequests = socket => socket.emissions.filter(entry => ['usePower', 'choosePowerTargets', 'skipPower', 'finishPowerPeek'].includes(entry.event));
const own = () => within(screen.getByRole('listitem', { name: 'Seat 1' }));
const slot = id => own().getByRole('img', { name: `Slot ${id}, face down` }).closest('[data-slot]');
const activate = socket => act(() => socket.receive('powerCardRevealed', { playerId: 'p1', faceUp: true, cardId: 7 }));
const held = () => screen.getByRole('img', { name: 'Drawn card for Player 1, face up' });

async function offeredBoard() {
  const socket = new FakeSocket();
  render(<StrictMode><App socket={socket} /></StrictMode>);
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox'), 'Player');
  await user.click(screen.getByRole('button', { name: 'Join lobby' }));
  act(() => {
    activatePowerClient(socket);
    socket.receive('powerAvailable', { power: 'selfPeek' });
  });
  expect(await screen.findByRole('button', { name: 'Use', exact: true })).toBeEnabled();
  return { socket, user };
}

it('offers a drawn power before resolution, activates from the card, and immediately submits a target', async () => {
  const { socket, user } = await offeredBoard();
  expect(own().getByRole('button', { name: 'Replace slot 1 with drawn card' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: 'Use drawn card power' }));
  expect(powerRequests(socket)).toEqual([{ event: 'usePower', payload: {}, ack: undefined }]);
  act(() => {
    socket.receive('powerResolutionStarted', { playerId: 'p1' });
    activate(socket);
  });
  expect(screen.queryByRole('button', { name: 'Confirm selection' })).not.toBeInTheDocument();
  const target = own().getByRole('button', { name: 'Peek at slot 2' });
  fireEvent.click(target); fireEvent.click(target);
  expect(powerRequests(socket)[1]).toMatchObject({ event: 'choosePowerTargets', payload: { peekTarget: { playerId: 'p1', handSlotId: 2 } } });
  expect(powerRequests(socket)).toHaveLength(2);
});

it.each(['skip', 'replace'])('offers a power while allowing %s before activation', async action => {
  const { socket, user } = await offeredBoard();
  if (action === 'skip') await user.click(screen.getByRole('button', { name: "Don't use" }));
  else await user.click(own().getByRole('button', { name: 'Replace slot 1 with drawn card' }));
  expect(socket.emissions.filter(entry => ['usePower', 'discardDrawnCard'].includes(entry.event))).toEqual([]);
  const event = action === 'skip' ? 'skipPower' : 'swapDrawnCard';
  const payload = action === 'skip' ? {} : { target: { playerId: 'p1', handSlotId: 1 } };
  expect(socket.emissions.filter(entry => entry.event === event)).toMatchObject([{ event, payload }]);
  expect(screen.getByRole('button', { name: 'Use', exact: true })).toBeDisabled();
  act(() => socket.receive('error', { code: 'POWER_NOT_AVAILABLE', message: 'Retry choice' }));
  expect(screen.getByRole('button', { name: 'Use', exact: true })).toBeEnabled();
  expect(own().getByRole('button', { name: 'Replace slot 1 with drawn card' })).toBeEnabled();
});

it('Use waits for public activation and the first legal target submits immediately', async () => {
  const { socket, user } = await board();
  const shared = held();
  expect(shared.closest('.setup-drawn')).toHaveClass('setup-drawn--power');
  await user.click(screen.getByRole('button', { name: 'Use', exact: true }));
  expect(powerRequests(socket)).toEqual([{ event: 'usePower', payload: {}, ack: undefined }]);
  expect(screen.getByRole('button', { name: 'Use', exact: true })).toBeDisabled();
  expect(screen.queryByRole('button', { name: /Peek at slot/ })).not.toBeInTheDocument();
  activate(socket);
  const targets = own().getAllByRole('button', { name: /Peek at slot/ });
  expect(targets).toHaveLength(4);
  expect(targets[0]).toHaveFocus();
  expect(within(screen.getByRole('listitem', { name: 'Seat 2' })).queryByRole('button')).not.toBeInTheDocument();
  fireEvent.click(targets[1]); fireEvent.click(targets[1]); fireEvent.click(targets[2]);
  expect(powerRequests(socket)).toHaveLength(2);
  expect(powerRequests(socket)[1]).toMatchObject({ event: 'choosePowerTargets', payload: { peekTarget: { playerId: 'p1', handSlotId: 2 } } });
  expect(slot(2)).toHaveClass('setup-hand__slot--selected');
  expect(screen.getByRole('button', { name: "Don't use" })).toBeDisabled();
  expect(own().queryByRole('img', { name: /face up/ })).not.toBeInTheDocument();
  act(() => revealPeek(socket));
  expect(own().getByRole('img', { name: 'Slot 2, face up' })).toHaveAttribute('src', CARD_IMAGES[12]);
  expect(screen.getByRole('button', { name: 'Done' })).toHaveFocus();
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

it('restores rejected activation and clears rejected targets without hiding the public power', async () => {
  const { socket, user } = await board();
  await user.click(screen.getByRole('button', { name: 'Use', exact: true }));
  act(() => socket.receive('error', { code: 'POWER_NOT_AVAILABLE', message: 'Retry activation' }));
  expect(screen.getByRole('button', { name: 'Use', exact: true })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: 'Use', exact: true }));
  activate(socket);
  await user.click(own().getByRole('button', { name: 'Peek at slot 2' }));
  act(() => socket.receive('error', { code: 'INVALID_POWER_TARGET', message: 'Choose again' }));
  expect(slot(2)).not.toHaveClass('setup-hand__slot--selected');
  expect(own().getByRole('button', { name: 'Peek at slot 1' })).toBeEnabled();
  expect(held()).toHaveAttribute('src', CARD_IMAGES[7]);
  await user.click(screen.getByRole('button', { name: "Don't use" }));
  act(() => socket.receive('error', { code: 'POWER_NOT_AVAILABLE', message: 'Retry Skip' }));
  expect(screen.getByRole('button', { name: "Don't use" })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: "Don't use" }));
  expect(powerRequests(socket).map(request => request.event)).toEqual(['usePower', 'usePower', 'choosePowerTargets', 'skipPower', 'skipPower']);
  act(() => { socket.receive('discardPileUpdated', { top: { cardId: 7 } }); socket.receive('turnChanged', { playerId: 'p2' }); });
  expect(screen.queryByRole('button', { name: 'Confirm selection' })).not.toBeInTheDocument();
});

it('provides keyboard Use, automatic target submission, and Done', async () => {
  const { socket, user } = await board();
  screen.getByRole('button', { name: 'Use', exact: true }).focus();
  await user.keyboard('{Enter}');
  activate(socket);
  expect(own().getByRole('button', { name: 'Peek at slot 1' })).toHaveFocus();
  await user.keyboard(' ');
  expect(powerRequests(socket)).toHaveLength(2);
  expect(powerRequests(socket)[1].payload.peekTarget.handSlotId).toBe(1);
  act(() => socket.receive('powerPeekResult', { targets: [{ playerId: 'p1', handSlotId: 1, faceUp: true, cardId: 12 }] }));
  expect(screen.getByRole('button', { name: 'Done' })).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(powerRequests(socket).map(request => request.event)).toEqual(['usePower', 'choosePowerTargets', 'finishPowerPeek']);
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

it('opponent selection locks immediately without sharing outlines and retries after rejection', async () => {
  const { socket, user } = await board('p1', 'opponentPeek');
  await user.click(screen.getByRole('button', { name: 'Use', exact: true }));
  activate(socket);
  expect(own().queryByRole('button')).not.toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /Peek at slot/ })).toHaveLength(12);
  const hand = seat => within(screen.getByRole('listitem', { name: 'Seat ' + seat }));
  const targetSlot = seat => hand(seat).getByRole('button', { name: 'Peek at slot 1' }).closest('[data-slot]');
  expect(hand(2).getByRole('button', { name: 'Peek at slot 1' })).toHaveFocus();
  await user.keyboard('{Enter}');
  await user.click(hand(3).getByRole('button', { name: 'Peek at slot 1' }));
  expect(targetSlot(2)).toHaveClass('setup-hand__slot--selected');
  expect(targetSlot(3)).not.toHaveClass('setup-hand__slot--selected');
  expect(targetSlot(4)).not.toHaveClass('setup-hand__slot--selected');
  expect(powerRequests(socket)).toHaveLength(2);
  act(() => socket.receive('error', { code: 'INVALID_POWER_TARGET', message: 'Choose again' }));
  expect(targetSlot(3)).not.toHaveClass('setup-hand__slot--selected');
  await user.click(hand(4).getByRole('button', { name: 'Peek at slot 1' }));
  expect(powerRequests(socket)[2].payload).toEqual({ peekTarget: { playerId: 'p4', handSlotId: 1 } });
  act(() => socket.receive('powerPeekResult', { targets: [{ playerId: 'p4', handSlotId: 1, faceUp: true, cardId: 12 }] }));
  expect(hand(4).getByRole('img', { name: 'Slot 1, face up' })).toHaveAttribute('src', CARD_IMAGES[12]);
  expect(screen.getByRole('button', { name: 'Done' })).toHaveFocus();
});

it('targeted opponent sees only a highlighted back, without a message or power controls', async () => {
  const { socket } = await board('p2', 'opponentPeek');
  act(() => {
    socket.receive('powerCardRevealed', { playerId: 'p1', faceUp: true, cardId: 10 });
    socket.receive('powerPeekResult', { targets: [{ playerId: 'p2', handSlotId: 2, faceUp: false }] });
  });
  const hand = within(screen.getByRole('listitem', { name: 'Seat 2' }));
  const image = hand.getByRole('img', { name: 'Slot 2, face down' });
  expect(image).toHaveAttribute('src', CARD_BACK_IMAGE);
  expect(image.closest('[data-slot]')).toHaveClass('setup-hand__slot--peeked');
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  for (const name of ['Use', "Don't use", 'Done']) expect(screen.queryByRole('button', { name, exact: true })).not.toBeInTheDocument();
  expect(powerRequests(socket)).toEqual([]);
  act(() => socket.receive('discardPileUpdated', { top: { cardId: 10 } }));
  expect(hand.getByRole('img', { name: 'Slot 2, face down' }).closest('[data-slot]')).not.toHaveClass('setup-hand__slot--peeked');
});
