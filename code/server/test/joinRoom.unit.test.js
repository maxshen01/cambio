// Tests player joins, seat order, rejection rules, and public lobby views.

import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState, joinPlayer } from '../src/game/state.js';
import { toLobbyView } from '../src/game/lobbyView.js';

test('joins take the lowest vacant seat and keep players in seat order', () => {
  const state = createGameState();
  joinPlayer(state, { id: 'one', displayName: ' One ' });
  joinPlayer(state, { id: 'three', displayName: 'Three' });
  state.players[1].seatId = 3;
  state.players[0].isReady = true;

  const player = joinPlayer(state, { id: 'two', displayName: 'Two' });

  assert.equal(player.seatId, 2);
  const playerSeats = state.players.map(({ id, seatId }) => {
    return [id, seatId];
  });
  assert.deepEqual(playerSeats, [
    ['one', 1],
    ['two', 2],
    ['three', 3],
  ]);
  assert.equal(state.players[0].displayName, 'One');
  assert.equal(state.players[0].isReady, true);
  assert.equal(player.isReady, false);
  assert.deepEqual(player.hand, []);
});

test('lobby view exposes only public player fields in seat order', () => {
  const state = createGameState();
  const player = joinPlayer(state, { id: 'one', displayName: 'One' });
  joinPlayer(state, { id: 'two', displayName: 'Two' });
  player.isReady = true;
  player.hand.push({ handSlotId: 1, card: { cardId: 42 } });
  player.drawnCard = { cardId: 43 };

  assert.deepEqual(toLobbyView(state), {
    players: [
      { playerId: 'one', displayName: 'One', seatId: 1, connected: true, isReady: true },
      { playerId: 'two', displayName: 'Two', seatId: 2, connected: true, isReady: false },
    ],
  });
});

test('invalid and repeated joins leave state unchanged', () => {
  const state = createGameState();
  joinPlayer(state, { id: 'one', displayName: 'One' });
  const before = structuredClone(state);

  for (const [input, code] of [
    [{ id: 'one', displayName: 'Again' }, 'ALREADY_IN_ROOM'],
    [{ id: 'two', displayName: '   ' }, 'INVALID_NAME'],
    [{ id: 'two', displayName: 123 }, 'INVALID_NAME'],
  ]) {
    assert.throws(() => {
      joinPlayer(state, input);
    }, { code });
    assert.deepEqual(state, before);
  }
});

test('full and started or dealt rooms reject joins without changing state', () => {
  const full = createGameState();
  for (let i = 1; i <= 4; i++) {
    joinPlayer(full, { id: `${i}`, displayName: `${i}` });
  }

  const fullBefore = structuredClone(full);
  assert.throws(() => {
    joinPlayer(full, { id: 'five', displayName: 'Five' });
  }, { code: 'ROOM_FULL' });
  assert.deepEqual(full, fullBefore);

  for (const change of [
    state => {
      state.phase = 'active';
    },
    state => {
      state.players[0].hand = [{ handSlotId: 1, card: { cardId: 1 } }];
    },
  ]) {
    const state = createGameState();
    joinPlayer(state, { id: 'one', displayName: 'One' });
    change(state);
    const before = structuredClone(state);
    assert.throws(() => {
      joinPlayer(state, { id: 'two', displayName: 'Two' });
    }, { code: 'GAME_ALREADY_STARTED' });
    assert.deepEqual(state, before);
  }
});
