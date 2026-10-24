// Tests player joins, seat order, rejection rules, and public lobby views.

import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/game/state.js';
import { joinPlayer, removeLobbyPlayer, readyPlayer, unreadyPlayer } from '../src/game/lobby.js';
import { toLobbyView } from '../src/game/lobbyView.js';

test('join rejection precedence is membership, name, stage, then capacity', () => {
  const state = createGameState();
  for (let id = 1; id <= 4; id++) joinPlayer(state, { id: String(id), displayName: String(id) });
  state.phase = 'active';
  const before = structuredClone(state);
  assert.throws(() => joinPlayer(state, { id: '1', displayName: '' }), { code: 'ALREADY_IN_ROOM' });
  assert.throws(() => joinPlayer(state, { id: '5', displayName: '' }), { code: 'INVALID_NAME' });
  assert.throws(() => joinPlayer(state, { id: '5', displayName: '1' }), { code: 'INVALID_NAME' });
  assert.throws(() => joinPlayer(state, { id: '5', displayName: 'Five' }), { code: 'GAME_ALREADY_STARTED' });
  assert.deepEqual(state, before);
  state.phase = 'deal';
  assert.throws(() => joinPlayer(state, { id: '5', displayName: 'Five' }), { code: 'ROOM_FULL' });
});

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

test('disconnect cleanup frees only an undealt seated player and preserves survivors', () => {
  const state = createGameState();
  joinPlayer(state, { id: 'one', displayName: 'One' }).isReady = true;
  joinPlayer(state, { id: 'two', displayName: 'Two' });
  joinPlayer(state, { id: 'three', displayName: 'Three' }).isReady = true;

  assert.equal(removeLobbyPlayer(state, 'missing'), false);
  assert.equal(removeLobbyPlayer(state, 'two'), true);
  assert.equal(removeLobbyPlayer(state, 'two'), false);
  assert.deepEqual(toLobbyView(state), { players: [
    { playerId: 'one', displayName: 'One', seatId: 1, connected: true, isReady: true },
    { playerId: 'three', displayName: 'Three', seatId: 3, connected: true, isReady: true },
  ] });

  const replacement = joinPlayer(state, { id: 'replacement', displayName: 'Replacement' });
  assert.equal(replacement.seatId, 2);
  assert.equal(replacement.isReady, false);
  assert.deepEqual(state.players.map(player => player.seatId), [1, 2, 3]);
});

test('disconnect cleanup defers incomplete deals and later-phase players', () => {
  for (const change of [
    state => { state.phase = 'active'; },
    state => { state.players[0].hand.push({ handSlotId: 1 }); },
  ]) {
    const state = createGameState();
    joinPlayer(state, { id: 'one', displayName: 'One' });
    change(state);
    const before = structuredClone(state);
    assert.equal(removeLobbyPlayer(state, 'one'), false);
    assert.deepEqual(state, before);
  }
});

test('readiness works before four seats fill and survives seat replacement', () => {
  const state = createGameState();
  joinPlayer(state, { id: 'one', displayName: 'One' });
  joinPlayer(state, { id: 'two', displayName: 'Two' });
  assert.equal(readyPlayer(state, 'one'), true);
  assert.equal(readyPlayer(state, 'one'), false);
  assert.equal(removeLobbyPlayer(state, 'two'), true);
  const replacement = joinPlayer(state, { id: 'replacement', displayName: 'Replacement' });
  assert.equal(replacement.isReady, false);
  assert.deepEqual(toLobbyView(state).players.map(player => [player.seatId, player.isReady]), [
    [1, true], [2, false],
  ]);
});

test('readiness rejects unseated and non-lobby senders without changing state', () => {
  const state = createGameState();
  joinPlayer(state, { id: 'one', displayName: 'One' });
  assert.throws(() => readyPlayer(state, 'outsider'), { code: 'NOT_IN_ROOM' });
  for (const change of [
    room => { room.phase = 'active'; },
    room => { room.players[0].hand.push({ handSlotId: 1 }); },
  ]) {
    const room = structuredClone(state);
    change(room);
    const before = structuredClone(room);
    assert.throws(() => readyPlayer(room, 'one'), { code: 'READY_NOT_AVAILABLE' });
    assert.deepEqual(room, before);
  }
  assert.equal(state.players[0].isReady, false);
});

test('unready changes one mark, ignores repeats, and unlocks after a departure', () => {
  const state = createGameState();
  for (let seat = 1; seat <= 4; seat++) {
    joinPlayer(state, { id: `${seat}`, displayName: `Player ${seat}` });
  }
  readyPlayer(state, '1');
  assert.equal(unreadyPlayer(state, '1'), true);
  assert.equal(unreadyPlayer(state, '1'), false);
  assert.equal(state.players[0].isReady, false);

  for (let seat = 1; seat <= 4; seat++) readyPlayer(state, `${seat}`);
  const beforeLock = structuredClone(state);
  assert.throws(() => unreadyPlayer(state, '1'), { code: 'READY_NOT_AVAILABLE' });
  assert.deepEqual(state, beforeLock);

  removeLobbyPlayer(state, '2');
  assert.equal(unreadyPlayer(state, '1'), true);
  assert.deepEqual(state.players.map(player => player.isReady), [false, true, true]);
});

test('unready rejects unseated and non-lobby senders without mutation', () => {
  const state = createGameState();
  joinPlayer(state, { id: 'one', displayName: 'One' });
  readyPlayer(state, 'one');
  assert.throws(() => unreadyPlayer(state, 'outsider'), { code: 'NOT_IN_ROOM' });
  for (const change of [
    room => { room.phase = 'active'; },
    room => { room.players[0].hand.push({ handSlotId: 1 }); },
  ]) {
    const room = structuredClone(state);
    change(room);
    const before = structuredClone(room);
    assert.throws(() => unreadyPlayer(room, 'one'), { code: 'READY_NOT_AVAILABLE' });
    assert.deepEqual(room, before);
  }
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

test('display names normalize and accept international letters and common punctuation', () => {
  const state = createGameState();
  const names = [
    ['  O’Neil  ', 'O’Neil'],
    ['Anne-  Marie', 'Anne- Marie'],
    ['李明', '李明'],
    ['Player   1', 'Player 1'],
  ];
  names.forEach(([input, expected], index) => {
    const player = joinPlayer(state, { id: `${index}`, displayName: input });
    assert.equal(player.displayName, expected);
  });

  const accented = createGameState();
  assert.equal(joinPlayer(accented, { id: 'accent', displayName: '  e\u0301  ' }).displayName, 'é');
});

test('display names enforce boundaries and reject invalid characters without changing state', () => {
  const state = createGameState();
  assert.equal(joinPlayer(state, { id: 'max', displayName: 'A'.repeat(20) }).displayName.length, 20);
  assert.equal(joinPlayer(state, { id: 'astral', displayName: '𐐷'.repeat(20) }).displayName, '𐐷'.repeat(20));
  const before = structuredClone(state);
  for (const displayName of [
    '', '   ', 'A'.repeat(21), '𐐷'.repeat(21), '😀', 'Alice😀', 'Alice\nBob', '.Alice',
    'Alice!', 'Alice/', 'Alice\u200b', 42, null,
  ]) {
    assert.throws(() => joinPlayer(state, { id: 'invalid', displayName }), { code: 'INVALID_NAME' });
    assert.deepEqual(state, before);
  }
});

test('display names must be unique in occupied seats after normalization and case folding', () => {
  const state = createGameState();
  joinPlayer(state, { id: 'one', displayName: '  Éva   Smith ' });
  const before = structuredClone(state);
  for (const displayName of ['éVA Smith', 'E\u0301va  Smith']) {
    assert.throws(() => joinPlayer(state, { id: 'two', displayName }), { code: 'INVALID_NAME' });
    assert.deepEqual(state, before);
  }
  assert.equal(removeLobbyPlayer(state, 'one'), true);
  assert.equal(joinPlayer(state, { id: 'two', displayName: 'éva smith' }).seatId, 1);

  const greek = createGameState();
  joinPlayer(greek, { id: 'upper', displayName: 'Σ' });
  assert.throws(() => joinPlayer(greek, { id: 'lower', displayName: 'ς' }), { code: 'INVALID_NAME' });
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
