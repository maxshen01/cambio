// Independent client fixtures for self-peek state and fake-socket action tests.
import { initialGameClientState } from '../../src/game/gameClientState.js';

export const players = [1, 2, 3, 4].map(seatId => ({
  playerId: `p${seatId}`, seatId, displayName: `Player ${seatId}`, connected: true, isReady: true,
}));
export const cards = players.flatMap(player => [1, 2, 3, 4].map(handSlotId => ({
  playerId: player.playerId, handSlotId, faceUp: false,
})));
export const powerEvents = ['powerResolutionStarted', 'powerAvailable', 'powerCardRevealed', 'powerPeekResult'];
export const peek = { targets: [{ playerId: 'p1', handSlotId: 2, faceUp: true, cardId: 12 }] };

export function powerClientState(localId = 'p1') {
  return {
    ...initialGameClientState(true), identity: { playerId: localId, seatId: localId === 'p1' ? 1 : 2 },
    players: structuredClone(players), stage: 'active', turnPlayerId: 'p1', cards: structuredClone(cards),
    drawnCard: localId === 'p1' ? { playerId: 'p1', source: 'deck', faceUp: true, cardId: 7 }
      : { playerId: 'p1', source: 'deck', faceUp: false },
    discardTop: { cardId: 4 },
  };
}

export function activatePowerClient(socket, localId = 'p1') {
  socket.emissions.find(entry => entry.event === 'joinRoom').ack({ playerId: localId, seatId: localId === 'p1' ? 1 : 2 });
  socket.receive('playerJoined', { players });
  socket.receive('dealComplete', { cards });
  socket.receive('turnChanged', { playerId: 'p1' });
  socket.receive('cardDrawn', powerClientState(localId).drawnCard);
}

export function startPower(socket, localId = 'p1') {
  socket.receive('powerResolutionStarted', { playerId: 'p1' });
  if (localId === 'p1') socket.receive('powerAvailable', { power: 'selfPeek' });
}

export function revealPeek(socket) {
  socket.receive('powerCardRevealed', { playerId: 'p1', faceUp: true, cardId: 7 });
  socket.receive('powerPeekResult', peek);
}
