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

it('prevents ordinary requests between power start and rerender, then sends Use only once', () => {
  const { socket, result } = hook();
  const old = result.current.actions;
  act(() => {
    socket.receive('powerResolutionStarted', { playerId: 'p1' });
    old.discardDrawnCard(); old.replaceHandCard(1); old.drawFromDeck();
    old.usePower(2); old.skipPower(); old.finishPowerPeek();
  });
  expect(commands(socket)).toEqual([]);
  expect(result.current.state.powerPrompt).toBeNull();
  act(() => socket.receive('powerAvailable', { power: 'selfPeek' }));
  act(() => {
    result.current.actions.usePower(2);
    result.current.actions.usePower(3);
    result.current.actions.skipPower();
  });
  expect(commands(socket)).toEqual([{ event: 'usePower', payload: { peekTarget: { playerId: 'p1', handSlotId: 2 } }, ack: undefined }]);
  act(() => socket.receive('powerCardRevealed', { playerId: 'p1', faceUp: true, cardId: 7 }));
  act(() => socket.receive('powerResolutionStarted', { playerId: 'p1' }));
  expect(result.current.state.turnPending).toBe(true);
  act(() => result.current.actions.usePower(1));
  expect(commands(socket)).toHaveLength(1);
  act(() => socket.receive('powerPeekResult', peek));
  expect(result.current.permissions.canFinishPowerPeek).toBe(true);
});

it('restores Use/Skip choices after rejection and holds Skip locked until turn advancement', () => {
  const { socket, result } = hook();
  act(() => startPower(socket));
  act(() => result.current.actions.usePower(8));
  expect(commands(socket)).toEqual([]);
  act(() => result.current.actions.usePower(2));
  act(() => socket.receive('error', { code: 'INVALID_POWER_TARGET', message: 'Try another card' }));
  expect(result.current.permissions).toMatchObject({ canUsePower: true, canSkipPower: true, canReplace: false, canDiscardDrawn: false });
  act(() => { result.current.actions.skipPower(); result.current.actions.usePower(2); result.current.actions.skipPower(); });
  expect(commands(socket).map(entry => entry.event)).toEqual(['usePower', 'skipPower']);
  act(() => socket.receive('error', { code: 'POWER_NOT_AVAILABLE', message: 'Retry' }));
  expect(result.current.permissions.canSkipPower).toBe(true);
  act(() => result.current.actions.skipPower());
  const old = result.current.actions;
  act(() => {
    socket.receive('discardPileUpdated', { top: { cardId: 7 } });
    old.usePower(2); old.skipPower(); old.drawFromDeck(); old.discardDrawnCard();
  });
  expect(commands(socket)).toHaveLength(3);
  expect(result.current.state).toMatchObject({ drawnCard: null, resolvingPower: false, powerPrompt: null, awaitingTurn: true });
  act(() => socket.receive('turnChanged', { playerId: 'p2' }));
  expect(result.current.state.turnPending).toBe(false);
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
  act(() => { result.current.actions.usePower(2); result.current.actions.skipPower(); result.current.actions.finishPowerPeek(); });
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
    old.finishPowerPeek(); old.skipPower(); old.usePower(2);
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
    oldActions.usePower(2); oldActions.skipPower();
  });
  expect(rendered.result.current.state).toBe(before);
  expect(commands(socket)).toEqual([]);
  rendered.unmount();
  for (const listeners of replacement.listeners.values()) expect(listeners.size).toBe(0);
  act(() => { late[3](peek); oldActions.usePower(2); oldActions.skipPower(); });
  expect(commands(socket)).toEqual([]);
});
