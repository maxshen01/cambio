// Queen/king controls progress locally after Done while preserving rejection recovery.
import { StrictMode } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { App } from '../../src/App.jsx';
import { FakeSocket } from '../helpers/fakeSocket.js';
import { activatePowerClient, startPower } from '../helpers/powerClient.js';

async function board(power = 'twoPeekSwap') {
  const socket = new FakeSocket();
  const view = render(<StrictMode><App socket={socket} /></StrictMode>);
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox'), 'Player');
  await user.click(screen.getByRole('button', { name: 'Join lobby' }));
  act(() => activatePowerClient(socket));
  await screen.findByRole('img', { name: /Drawn card for Player 1/ });
  act(() => startPower(socket, 'p1', power));
  await user.click(screen.getByRole('button', { name: 'Use', exact: true }));
  act(() => socket.receive('powerCardRevealed', { playerId: 'p1', faceUp: true, cardId: power === 'twoPeekSwap' ? 13 : 12 }));
  return { socket, user, ...view };
}
const hand = seat => within(screen.getByRole('listitem', { name: `Seat ${seat}` }));
const peek = (seat, slot) => hand(seat).getByRole('button', { name: `Peek at slot ${slot}` });
const swap = (seat, slot = 1) => hand(seat).getByRole('button', { name: `Swap slot ${slot}` });
const targets = [1, 2].map(handSlotId => ({ playerId: 'p1', handSlotId, faceUp: true, cardId: handSlotId + 1 }));

it('king selects two cards in one hand, then Done opens a fresh different-player swap without a server event', async () => {
  const { socket, user, container } = await board();
  expect(peek(1, 1)).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(socket.emissions.filter(e => e.event === 'choosePowerTargets')).toHaveLength(0);
  await user.click(peek(1, 1));
  expect(container.querySelectorAll('.setup-hand__slot--selected')).toHaveLength(0);
  await user.click(peek(1, 1));
  await user.click(peek(1, 2));
  expect(container.querySelectorAll('.setup-hand__slot--selected')).toHaveLength(2);
  expect(peek(2, 1)).toBeDisabled();
  await user.click(peek(1, 2));
  await user.click(peek(1, 2));
  expect(socket.emissions.filter(e => e.event === 'choosePowerTargets')).toEqual([
    { event: 'choosePowerTargets', payload: { peekTargets: [{ playerId: 'p1', handSlotId: 1 }, { playerId: 'p1', handSlotId: 2 }] }, ack: undefined },
  ]);
  act(() => socket.receive('powerPeekResult', { targets }));
  expect(hand(1).getAllByRole('img', { name: /face up/ })).toHaveLength(2);
  const done = screen.getByRole('button', { name: 'Done' });
  done.focus(); await user.keyboard(' ');
  fireEvent.click(done);
  expect(socket.emissions.filter(e => e.event === 'finishPowerPeek')).toHaveLength(1);
  expect(hand(1).queryByRole('img', { name: /face up/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();
  expect(container.querySelectorAll('.setup-hand__slot--selected')).toHaveLength(0);
  expect(swap(1)).toHaveFocus();
  await user.click(swap(2)); await user.click(swap(3));
  expect(socket.emissions.filter(e => e.event === 'choosePowerSwap')).toEqual([
    { event: 'choosePowerSwap', payload: { first: { playerId: 'p2', handSlotId: 1 }, second: { playerId: 'p3', handSlotId: 1 } }, ack: undefined },
  ]);
  act(() => socket.receive('error', { code: 'INVALID_POWER_TARGET', message: 'Retry swap' }));
  expect(swap(1)).toBeEnabled();
  expect(hand(1).queryByRole('img', { name: /face up/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: "Don't use" }));
  act(() => { socket.receive('discardPileUpdated', { top: { cardId: 13 } }); socket.receive('turnChanged', { playerId: 'p2' }); });
  expect(screen.queryByRole('img', { name: /Drawn card/ })).not.toBeInTheDocument();
});

it('queen submits its first peek click and restores the face and Done after rejection', async () => {
  const { socket, user } = await board('onePeekSwap');
  await user.click(peek(2, 2)); fireEvent.click(peek(1, 1));
  expect(socket.emissions.find(e => e.event === 'choosePowerTargets').payload).toEqual({ peekTargets: [{ playerId: 'p2', handSlotId: 2 }] });
  act(() => socket.receive('powerPeekResult', { targets: [{ playerId: 'p2', handSlotId: 2, faceUp: true, cardId: 6 }] }));
  await user.click(screen.getByRole('button', { name: 'Done' }));
  await user.click(swap(1));
  act(() => socket.receive('error', { code: 'POWER_NOT_AVAILABLE', message: 'Retry Done' }));
  expect(document.querySelectorAll('.setup-hand__slot--selected')).toHaveLength(0);
  expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled();
  expect(hand(2).getByRole('img', { name: 'Slot 2, face up' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Done' }));
  expect(hand(2).queryByRole('img', { name: /face up/ })).not.toBeInTheDocument();
  expect(swap(1)).toBeEnabled();
});
