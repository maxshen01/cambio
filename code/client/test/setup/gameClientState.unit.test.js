// Checks ownership and private-face lifetimes independently of React and socket listeners.
import { expect, it } from 'vitest';
import { initialGameClientState } from '../../src/game/gameClientState.js';
import { gameClientReducer } from '../../src/game/gameClientReducer.js';
import { selectGameClient } from '../../src/game/gameSelectors.js';

function joinedState() {
  return {
    ...initialGameClientState(true),
    identity: { playerId: 'p1', seatId: 1 },
    players: [1, 2, 3, 4].map(seatId => ({
      playerId: `p${seatId}`, seatId, displayName: `Player ${seatId}`, connected: true, isReady: true,
    })),
  };
}

function openingView() {
  return [1, 2, 3, 4].flatMap(player => [1, 2, 3, 4].map(handSlotId => ({
    playerId: `p${player}`, handSlotId,
    ...(player === 1 && [2, 4].includes(handSlotId)
      ? { faceUp: true, cardId: handSlotId === 2 ? 53 : 54 } : { faceUp: false }),
  })));
}

it('owns its opening view independently of later payload or state mutations', () => {
  const before = joinedState();
  const cards = openingView();
  const expected = structuredClone(cards);
  const next = gameClientReducer(before, { type: 'dealReceived', cards });
  expect(next.cards).toEqual(expected);
  cards[1].cardId = 7;
  cards.pop();
  expect(next.cards).toEqual(expected);
  next.cards[3].faceUp = false;
  expect(cards[3].faceUp).toBe(true);
  expect(before.cards).toEqual([]);
  expect(before.players.every(player => player.isReady)).toBe(true);
  expect(next.players.every(player => !player.isReady)).toBe(true);
});

it('rejects opening deals before membership or a full room is confirmed', () => {
  const joined = joinedState();
  const action = { type: 'dealReceived', cards: openingView() };
  for (const state of [
    initialGameClientState(true),
    { ...joined, identity: null },
    { ...joined, players: joined.players.slice(1) },
    { ...joined, identity: { playerId: 'outsider', seatId: 1 } },
    { ...joined, connection: 'failed' },
  ]) {
    expect(gameClientReducer(state, action)).toBe(state);
  }
});

it('retains memorization faces through other confirmations and rejection, then removes them on local confirmation', () => {
  const memorization = gameClientReducer(joinedState(), { type: 'dealReceived', cards: openingView() });
  const requested = gameClientReducer(memorization, { type: 'readyRequested' });
  const otherReady = gameClientReducer(requested, { type: 'readinessReceived', playerId: 'p2', isReady: true });
  expect(otherReady.readyPending).toBe(true);
  expect(otherReady.cards).toEqual(memorization.cards);
  const rejected = gameClientReducer(otherReady, {
    type: 'serverErrorReceived', error: { code: 'READY_NOT_AVAILABLE', message: 'Try again' },
  });
  expect(rejected.cards).toEqual(memorization.cards);
  expect(selectGameClient(rejected).permissions.canReady).toBe(true);
  const confirmed = gameClientReducer(rejected, { type: 'readinessReceived', playerId: 'p1', isReady: true });
  expect(confirmed.cards.every(card => !card.faceUp && !('cardId' in card))).toBe(true);
  expect(memorization.cards.filter(card => card.faceUp)).toHaveLength(2);
  expect(selectGameClient(confirmed).permissions.canReady).toBe(false);
});

it('activation removes opening faces even if a local readiness notice was not received', () => {
  const memorization = gameClientReducer(joinedState(), { type: 'dealReceived', cards: openingView() });
  const active = gameClientReducer(memorization, { type: 'turnChanged', playerId: 'p1' });
  expect(active.stage).toBe('active');
  expect(active.cards).toHaveLength(16);
  expect(active.cards.every(card => !card.faceUp && !('cardId' in card))).toBe(true);
  expect(selectGameClient(active).permissions).toMatchObject({ canDraw: true, canReady: false });
});

it('loss clears private and pending state and cannot be undone by late events or requests', () => {
  const memorization = gameClientReducer(joinedState(), { type: 'dealReceived', cards: openingView() });
  const lost = gameClientReducer({
    ...memorization, joinPending: true, readyPending: true, turnPending: true, awaitingTurn: true,
    drawnCard: { playerId: 'p1', source: 'deck', faceUp: true, cardId: 7 }, discardTop: { cardId: 8 },
    movement: { id: 1, kind: 'draw', source: 'deck' },
  }, { type: 'connectionLost' });
  expect(lost).toMatchObject({
    connection: 'lost', identity: null, players: [], cards: [], stage: 'lobby', turnPlayerId: null,
    drawnCard: null, discardTop: null, movement: null,
    joinPending: false, readyPending: false, turnPending: false, awaitingTurn: false,
  });
  for (const action of [
    { type: 'connectionEstablished' },
    { type: 'joinRequested' },
    { type: 'joinAcknowledged', identity: { playerId: 'p1', seatId: 1 } },
    { type: 'playersReceived', players: joinedState().players },
    { type: 'dealReceived', cards: openingView() },
    { type: 'turnChanged', playerId: 'p1' },
  ]) {
    expect(gameClientReducer(lost, action)).toBe(lost);
  }
  expect(Object.values(selectGameClient(lost).permissions).every(value => !value)).toBe(true);
});
