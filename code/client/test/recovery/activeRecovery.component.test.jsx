// Active aborts clear the rendered round and request guards without losing membership.
import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import { FakeSocket } from '../helpers/fakeSocket.js';
import { useGameClient } from '../../src/game/useGameClient.js';

function activeClient() {
  const socket = new FakeSocket();
  const hook = renderHook(() => useGameClient(socket), { wrapper: StrictMode });
  const players = [1, 2, 3, 4].map(seatId => ({ playerId: `p${seatId}`, seatId,
    displayName: `Player ${seatId}`, connected: true, isReady: false }));
  act(() => hook.result.current.actions.joinLobby('Player 1'));
  act(() => {
    socket.emissions[0].ack({ playerId: 'p1', seatId: 1 });
    socket.receive('playerJoined', { players });
    socket.receive('dealComplete', { cards: players.map(player => ({ playerId: player.playerId, handSlotId: 1, faceUp: false })) });
    socket.receive('turnChanged', { playerId: 'p1' });
    socket.receive('cardDrawn', { playerId: 'p1', source: 'deck', faceUp: true, cardId: 7 });
  });
  return { socket, ...hook, players };
}

for (const reason of ['PLAYER_DISCONNECTED', 'SERVER_ERROR']) {
  it(`${reason} clears cards, movements and action locks while preserving the local seat`, () => {
    const { socket, result, players, unmount } = activeClient();
    act(() => result.current.actions.discardDrawnCard());
    expect(result.current.state.turnPending).toBe(true);
    const lobby = { players: reason === 'PLAYER_DISCONNECTED' ? players.slice(0, 3) : players };
    if (reason === 'PLAYER_DISCONNECTED') {
      act(() => socket.receive('playerDisconnected', { players: players.map(player =>
        player.playerId === 'p4' ? { ...player, connected: false } : player) }));
      expect(result.current.state.stage).toBe('active');
      expect(result.current.state.drawnCard.cardId).toBe(7);
      expect(result.current.state.players[3].connected).toBe(false);
    }
    act(() => socket.receive('gameAborted', { reason, ...(reason === 'PLAYER_DISCONNECTED' ? { playerId: 'p4' } : {}), lobby }));
    expect(result.current.state).toMatchObject({ connection: 'connected', identity: { playerId: 'p1', seatId: 1 },
      stage: 'lobby', players: lobby.players, cards: [], drawnCard: null, discardTop: null, turnPlayerId: null,
      movement: null, turnPending: false, readyPending: false, joinPending: false, awaitingTurn: false, error: null });
    act(() => result.current.actions.toggleReady());
    expect(socket.emissions.at(-1).event).toBe('ready');
    expect(result.current.state.readyPending).toBe(true);
    for (const listeners of socket.listeners.values()) expect(listeners.size).toBe(1);
    unmount();
    for (const listeners of socket.listeners.values()) expect(listeners.size).toBe(0);
  });
}

it('late abort and gameplay events cannot restore a locally lost active session', () => {
  const { socket, result, players } = activeClient();
  act(() => socket.disconnect());
  const lost = result.current.state;
  act(() => {
    socket.receive('gameAborted', { reason: 'SERVER_ERROR', lobby: { players } });
    socket.receive('playerDisconnected', { players });
    socket.receive('dealComplete', { cards: [{ playerId: 'p1', handSlotId: 1, faceUp: true, cardId: 7 }] });
    socket.receive('turnChanged', { playerId: 'p1' });
    socket.emissions[0].ack({ playerId: 'p1', seatId: 1 });
  });
  expect(result.current.state).toBe(lost);
  expect(lost).toMatchObject({ connection: 'lost', identity: null, cards: [], drawnCard: null, movement: null });
});
