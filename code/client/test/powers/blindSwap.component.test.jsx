// Blind selection stays local until confirmation and never reveals exchanged faces.
import { StrictMode } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { App } from '../../src/App.jsx';
import { FakeSocket } from '../helpers/fakeSocket.js';
import { activatePowerClient, startPower } from '../helpers/powerClient.js';

async function board() {
  const socket = new FakeSocket();
  render(<StrictMode><App socket={socket} /></StrictMode>);
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox'), 'Player');
  await user.click(screen.getByRole('button', { name: 'Join lobby' }));
  act(() => activatePowerClient(socket));
  await screen.findByRole('img', { name: /Drawn card for Player 1/ });
  act(() => startPower(socket, 'p1', 'blindSwap'));
  await user.click(screen.getByRole('button', { name: 'Use', exact: true }));
  act(() => socket.receive('powerCardRevealed', { playerId: 'p1', faceUp: true, cardId: 11 }));
  return { socket, user };
}
const hand = seat => within(screen.getByRole('listitem', { name: `Seat ${seat}` }));
const target = (seat, slot = 1) => hand(seat).getByRole('button', { name: `Swap slot ${slot}` });
const confirm = () => screen.getByRole('button', { name: 'Confirm selection' });
const selections = () => document.querySelectorAll('.setup-hand__slot--selected');

it('selects only a different-player pair, supports deselection, and locks confirmation immediately', async () => {
  const { socket, user } = await board();
  expect(target(1)).toHaveFocus();
  expect(confirm()).toBeDisabled();
  await user.keyboard('{Enter}');
  expect(target(1)).toHaveAttribute('aria-pressed', 'true');
  expect(target(1, 2)).toBeDisabled();
  expect(confirm()).toBeDisabled();
  await user.click(target(2));
  expect(selections()).toHaveLength(2);
  expect(confirm()).toBeEnabled();
  expect(target(3)).toBeDisabled();
  await user.click(target(1));
  expect(selections()).toHaveLength(1);
  await user.click(target(3));
  confirm().focus();
  await user.keyboard(' ');
  fireEvent.click(confirm());
  fireEvent.click(target(2));
  expect(socket.emissions.filter(e => e.event === 'choosePowerTargets')).toEqual([
    { event: 'choosePowerTargets', payload: { first: { playerId: 'p2', handSlotId: 1 }, second: { playerId: 'p3', handSlotId: 1 } }, ack: undefined },
  ]);
  expect(selections()).toHaveLength(2);
  expect(confirm()).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();
  act(() => socket.receive('error', { code: 'INVALID_POWER_TARGET', message: 'Choose again' }));
  expect(selections()).toHaveLength(0);
  expect(confirm()).toBeDisabled();
  expect(target(1)).toBeEnabled();
  expect(screen.getByRole('img', { name: /Drawn card for Player 1/ })).toBeVisible();
});

it('retains the held Jack through the swap result, keeps hands hidden, and clears on completion', async () => {
  const { socket, user } = await board();
  await user.click(target(1));
  await user.click(target(2));
  await user.click(confirm());
  act(() => socket.receive('cardSwapped', { kind: 'power', first: { playerId: 'p1', handSlotId: 1 }, second: { playerId: 'p2', handSlotId: 1 } }));
  expect(screen.getByRole('img', { name: /Drawn card for Player 1/ })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Confirm selection' })).not.toBeInTheDocument();
  for (const seat of [1, 2, 3, 4]) expect(hand(seat).queryByRole('img', { name: /face up/ })).not.toBeInTheDocument();
  act(() => socket.receive('discardPileUpdated', { top: { cardId: 11 } }));
  expect(screen.queryByRole('img', { name: /Drawn card/ })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Draw from deck' })).toBeDisabled();
  act(() => socket.receive('turnChanged', { playerId: 'p2' }));
  expect(selections()).toHaveLength(0);
});

it.each(['abort', 'disconnect'])('clears selected cards and ignores late power events after %s', async reason => {
  const { socket, user } = await board();
  await user.click(target(1));
  await user.click(target(2));
  act(() => {
    if (reason === 'abort') socket.receive('gameAborted', { reason: 'SERVER_ERROR', lobby: { players: [] } });
    else socket.receive('disconnect', 'transport close');
    socket.receive('powerAvailable', { power: 'blindSwap' });
    socket.receive('powerCardRevealed', { playerId: 'p1', faceUp: true, cardId: 11 });
  });
  expect(selections()).toHaveLength(0);
  expect(screen.queryByRole('button', { name: 'Confirm selection' })).not.toBeInTheDocument();
  expect(screen.queryByRole('img', { name: /Drawn card/ })).not.toBeInTheDocument();
});
