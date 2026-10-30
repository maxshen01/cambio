// Hook tests cover synchronous requests, event lifetimes, and rejected power choices.
import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useGameClient } from '../../src/game/useGameClient.js';
import { FakeSocket } from '../helpers/fakeSocket.js';
import { activatePowerClient, startPower, revealPeek, peek, powerEvents, cards, players } from '../helpers/powerClient.js';

function hook(localId = 'p1') {
  const socket = new FakeSocket();
  const rendered = renderHook(() => useGameClient(socket), { wrapper: StrictMode });
  act(() => rendered.result.current.actions.joinLobby('Player'));
  act(() => activatePowerClient(socket, localId));
  return { socket, ...rendered };
}
const commands = socket => socket.emissions.filter(entry => entry.event !== 'joinRoom');

it('sends Done before a post-peek swap in the same burst and guards stale callbacks', () => {
  const { socket, result } = hook();
  const actions = result.current.actions;
  act(() => startPower(socket, 'p1', 'twoPeekSwap'));
  act(() => actions.usePower());
  act(() => socket.receive('powerCardRevealed', { playerId: 'p1', faceUp: true, cardId: 13 }));
  const targets = [{ playerId: 'p1', handSlotId: 1 }, { playerId: 'p1', handSlotId: 2 }];
  act(() => {
    actions.choosePowerTargets([targets[0]]);
    actions.choosePowerTargets([targets[0], targets[0]]);
    actions.choosePowerSwap({ first: targets[0], second: { playerId: 'p2', handSlotId: 1 } });
  });
  expect(commands(socket).map(entry => entry.event)).toEqual(['usePower']);
  act(() => actions.choosePowerTargets(targets));
  act(() => socket.receive('powerPeekResult', { targets: targets.map((ref, index) => ({ ...ref, faceUp: true, cardId: index + 2 })) }));
  act(() => actions.skipPower());
  expect(commands(socket).map(entry => entry.event)).toEqual(['usePower', 'choosePowerTargets']);
  const pair = { first: { playerId: 'p2', handSlotId: 1 }, second: { playerId: 'p3', handSlotId: 1 } };
  act(() => {
    actions.finishPowerPeek(); actions.finishPowerPeek(); actions.usePower();
    actions.choosePowerSwap(pair); actions.choosePowerSwap(pair); actions.skipPower();
  });
  expect(commands(socket).map(entry => entry.event)).toEqual(['usePower', 'choosePowerTargets', 'finishPowerPeek', 'choosePowerSwap']);
  act(() => socket.receive('error', { code: 'SWAP_NOT_ALLOWED', message: 'Retry' }));
  expect(result.current.permissions).toMatchObject({ canChoosePowerSwap: true, canFinishPowerPeek: false });
  act(() => {
    socket.receive('disconnect', 'transport close');
    actions.choosePowerSwap(pair); actions.finishPowerPeek(); actions.skipPower();
  });
  expect(commands(socket)).toHaveLength(4);
});

it('Jack validates current pair occupancy and ownership and locks even stale action callbacks', () => {
  const { socket, result } = hook();
  const actions = result.current.actions;
  act(() => startPower(socket, 'p1', 'blindSwap'));
  act(() => actions.usePower());
  act(() => socket.receive('powerCardRevealed', { playerId: 'p1', faceUp: true, cardId: 11 }));
  const first = { playerId: 'p2', handSlotId: 1 };
  const second = { playerId: 'p3', handSlotId: 1 };
  act(() => {
    actions.choosePowerTargets(first);
    actions.choosePowerTargets({ first, second: { ...first, handSlotId: 2 } });
    actions.choosePowerTargets({ first, second: { ...second, handSlotId: 8 } });
    actions.finishPowerPeek();
  });
  expect(commands(socket).map(e => e.event)).toEqual(['usePower']);
  act(() => {
    actions.choosePowerTargets({ first, second });
    actions.choosePowerTargets({ first, second }); actions.skipPower(); actions.replaceHandCard(1);
  });
  expect(commands(socket).map(e => e.event)).toEqual(['usePower', 'choosePowerTargets']);
  expect(commands(socket)[1].payload).toEqual({ first, second });
  act(() => socket.receive('error', { code: 'INVALID_POWER_TARGET', message: 'Retry' }));
  expect(result.current.permissions.canChoosePowerTargets).toBe(true);
  act(() => {
    socket.receive('disconnect', 'transport close');
    actions.choosePowerTargets({ first, second }); actions.usePower(); actions.skipPower();
  });
  expect(commands(socket)).toHaveLength(2);
});

it('activation and confirmation use one immediate lock and ignore duplicate reveals', () => {
  const { socket, result } = hook();
  const old = result.current.actions;
  act(() => {
    socket.receive('powerResolutionStarted', { playerId: 'p1' });
    old.usePower(); old.choosePowerTargets({ playerId: 'p1', handSlotId: 2 });
    old.drawFromDeck(); old.replaceHandCard(1);
  });
  expect(commands(socket)).toEqual([]);
  act(() => socket.receive('powerAvailable', { power: 'selfPeek' }));
  act(() => { old.usePower(); old.usePower(); old.skipPower(); });
  expect(commands(socket)).toEqual([{ event: 'usePower', payload: {}, ack: undefined }]);
  expect(result.current.permissions.canChoosePowerTargets).toBe(false);
  act(() => socket.receive('powerCardRevealed', { playerId: 'p1', faceUp: true, cardId: 7 }));
  expect(result.current.permissions).toMatchObject({ canUsePower: false, canChoosePowerTargets: true, canSkipPower: true });
  act(() => {
    old.choosePowerTargets({ playerId: 'p1', handSlotId: 2 });
    socket.receive('powerCardRevealed', { playerId: 'p1', faceUp: true, cardId: 7 });
    old.choosePowerTargets({ playerId: 'p1', handSlotId: 3 }); old.skipPower(); old.usePower();
  });
  expect(commands(socket).map(entry => entry.event)).toEqual(['usePower', 'choosePowerTargets']);
  expect(result.current.state.turnPending).toBe(true);
  act(() => socket.receive('powerPeekResult', peek));
  expect(result.current.permissions.canFinishPowerPeek).toBe(true);
});

it('rejected activation and target submission restore their own stages and Skip remains locked', () => {
  const { socket, result } = hook();
  act(() => startPower(socket));
  act(() => result.current.actions.usePower());
  act(() => socket.receive('error', { code: 'POWER_NOT_AVAILABLE', message: 'Retry activation' }));
  expect(result.current.permissions.canUsePower).toBe(true);
  act(() => result.current.actions.usePower());
  act(() => socket.receive('powerCardRevealed', { playerId: 'p1', faceUp: true, cardId: 7 }));
  act(() => result.current.actions.choosePowerTargets({ playerId: 'p1', handSlotId: 8 }));
  expect(commands(socket)).toHaveLength(2);
  act(() => result.current.actions.choosePowerTargets({ playerId: 'p1', handSlotId: 2 }));
  act(() => socket.receive('error', { code: 'INVALID_POWER_TARGET', message: 'Try another card' }));
  expect(result.current.permissions).toMatchObject({ canUsePower: false, canChoosePowerTargets: true, canSkipPower: true, canReplace: false });
  act(() => { result.current.actions.skipPower(); result.current.actions.skipPower(); });
  expect(commands(socket).map(entry => entry.event)).toEqual(['usePower', 'usePower', 'choosePowerTargets', 'skipPower']);
  act(() => socket.receive('error', { code: 'POWER_NOT_AVAILABLE', message: 'Retry Skip' }));
  act(() => result.current.actions.skipPower());
  const old = result.current.actions;
  act(() => {
    socket.receive('discardPileUpdated', { top: { cardId: 7 } });
    old.usePower(); old.choosePowerTargets({ playerId: 'p1', handSlotId: 2 }); old.skipPower(); old.drawFromDeck();
  });
  expect(commands(socket)).toHaveLength(5);
  expect(result.current.state).toMatchObject({ drawnCard: null, powerPrompt: null, awaitingTurn: true });
});

it('keeps peeks until Done, hides during its request, restores on rejection, and erases on completion', () => {
  const { socket, result } = hook();
  act(() => { startPower(socket); revealPeek(socket); });
  vi.useFakeTimers();
  try {
    act(() => vi.advanceTimersByTime(60000));
    expect(result.current.view.powerPeekTargets).toEqual(peek.targets);
  } finally { vi.useRealTimers(); }
  act(() => { result.current.actions.finishPowerPeek(); result.current.actions.finishPowerPeek(); result.current.actions.skipPower(); });
  expect(commands(socket).map(entry => entry.event)).toEqual(['finishPowerPeek']);
  expect(result.current.view.powerPeekTargets).toEqual([]);
  expect(result.current.state.drawnCard).toMatchObject({ cardId: 7, source: 'deck' });
  act(() => socket.receive('error', { code: 'POWER_NOT_AVAILABLE', message: 'Retry Done' }));
  expect(result.current.view.powerPeekTargets).toEqual(peek.targets);
  expect(result.current.permissions.canFinishPowerPeek).toBe(true);
  act(() => result.current.actions.finishPowerPeek());
  act(() => socket.receive('discardPileUpdated', { top: { cardId: 7 } }));
  expect(result.current.state.powerPeekTargets).toEqual([]);
  expect(result.current.state.pendingPowerAction).toBeNull();
  expect(result.current.permissions.canDraw).toBe(false);
});

it('gives opponents public held-card faces and facedown targets but no power commands', () => {
  const { socket, result } = hook('p2');
  act(() => { startPower(socket, 'p2'); revealPeek(socket); });
  expect(result.current.state.drawnCard).toEqual({ playerId: 'p1', source: 'deck', faceUp: true, cardId: 7 });
  expect(result.current.view.powerPeekTargets).toEqual([{ playerId: 'p1', handSlotId: 2, faceUp: false }]);
  expect(result.current.state.powerPrompt).toBeNull();
  act(() => { result.current.actions.choosePowerTargets({ playerId: 'p1', handSlotId: 2 }); result.current.actions.skipPower(); result.current.actions.finishPowerPeek(); });
  expect(commands(socket)).toEqual([]);
});

it.each(['abort', 'deal', 'turn', 'loss'])('clears faces and blocks old actions/late events after %s', boundary => {
  const { socket, result } = hook();
  act(() => { startPower(socket); revealPeek(socket); });
  const old = result.current.actions;
  act(() => {
    if (boundary === 'abort') socket.receive('gameAborted', { reason: 'SERVER_ERROR', lobby: { players } });
    else if (boundary === 'deal') socket.receive('dealComplete', { cards });
    else if (boundary === 'turn') socket.receive('turnChanged', { playerId: 'p2' });
    else socket.disconnect();
    old.finishPowerPeek(); old.skipPower(); old.choosePowerTargets({ playerId: 'p1', handSlotId: 2 });
    startPower(socket); revealPeek(socket);
  });
  expect(commands(socket)).toEqual([]);
  expect(result.current.state).toMatchObject({ resolvingPower: false, powerPrompt: null, powerPeekTargets: [], pendingPowerAction: null });
});

it('cleans all StrictMode listeners and ignores saved callbacks after unmount/socket replacement', () => {
  const socket = new FakeSocket();
  const rendered = renderHook(({ connection }) => useGameClient(connection), { initialProps: { connection: socket }, wrapper: StrictMode });
  act(() => rendered.result.current.actions.joinLobby('Player'));
  act(() => { activatePowerClient(socket); startPower(socket); });
  const oldActions = rendered.result.current.actions;
  const late = powerEvents.map(event => [...socket.listeners.get(event)][0]);
  for (const event of powerEvents) expect(socket.listeners.get(event).size).toBe(1);
  const replacement = new FakeSocket();
  rendered.rerender({ connection: replacement });
  for (const listeners of socket.listeners.values()) expect(listeners.size).toBe(0);
  const before = rendered.result.current.state;
  act(() => {
    late[0]({ playerId: 'p1' }); late[1]({ power: 'selfPeek' });
    late[2]({ playerId: 'p1', faceUp: true, cardId: 8 }); late[3](peek);
    oldActions.choosePowerTargets({ playerId: 'p1', handSlotId: 2 }); oldActions.skipPower();
  });
  expect(rendered.result.current.state).toBe(before);
  expect(commands(socket)).toEqual([]);
  rendered.unmount();
  for (const listeners of replacement.listeners.values()) expect(listeners.size).toBe(0);
  act(() => { late[3](peek); oldActions.choosePowerTargets({ playerId: 'p1', handSlotId: 2 }); oldActions.skipPower(); });
  expect(commands(socket)).toEqual([]);
});

it('opponent actions reject own/missing targets and lock all turn commands immediately', () => {
  const { socket, result } = hook();
  act(() => { startPower(socket, 'p1', 'opponentPeek'); socket.receive('powerCardRevealed', { playerId: 'p1', faceUp: true, cardId: 9 }); });
  act(() => {
    for (const target of [{ playerId: 'p1', handSlotId: 2 }, { playerId: 'outsider', handSlotId: 2 }, { playerId: 'p2', handSlotId: 8 }]) result.current.actions.choosePowerTargets(target);
  });
  expect(commands(socket)).toEqual([]);
  const old = result.current.actions;
  act(() => {
    old.choosePowerTargets({ playerId: 'p3', handSlotId: 2 });
    old.choosePowerTargets({ playerId: 'p4', handSlotId: 2 });
    old.skipPower(); old.drawFromDeck(); old.replaceHandCard(1);
  });
  expect(commands(socket)).toEqual([{ event: 'choosePowerTargets', payload: { peekTarget: { playerId: 'p3', handSlotId: 2 } }, ack: undefined }]);
  act(() => socket.receive('error', { code: 'INVALID_POWER_TARGET', message: 'Retry' }));
  act(() => old.choosePowerTargets({ playerId: 'p4', handSlotId: 2 }));
  expect(commands(socket)[1].payload.peekTarget.playerId).toBe('p4');
});
