// Tests setup stage recognition, idempotent readiness, and full survivor resets.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../../src/game/state.js';
import { dealIfReady } from '../../src/game/deal.js';
import { startPlayIfReady } from '../../src/game/turns.js';
import { isMemorization, joinPlayer, readyPlayer, unreadyPlayer, removeLobbyPlayer } from '../../src/game/lobby.js';

function dealtRoom() {
  const state = createGameState();
  for (let seat = 1; seat <= 4; seat++) {
    const player = joinPlayer(state, { id: String(seat), displayName: `Player ${seat}` });
    readyPlayer(state, player.id);
  }
  dealIfReady(state, () => 0);
  return state;
}

test('memorization accepts each confirmation once without changing the deal', () => {
  const state = dealtRoom();
  assert.equal(isMemorization(state), true);
  const expected = structuredClone(state);
  for (const player of state.players) {
    assert.equal(readyPlayer(state, player.id), true);
    const once = structuredClone(state);
    assert.equal(readyPlayer(state, player.id), false);
    assert.deepEqual(state, once);
    assert.throws(() => unreadyPlayer(state, player.id), { code: 'READY_NOT_AVAILABLE' });
    assert.deepEqual(state, once);
  }
  expected.players.forEach(player => { player.isReady = true; });
  assert.deepEqual(state, expected);
  assert.equal(dealIfReady(state), false);
});

test('each seat can start uniformly and only after four connected confirmations', () => {
  for (const [sample, seat] of [[0, 1], [0.2499, 1], [0.25, 2], [0.4999, 2], [0.5, 3], [0.7499, 3], [0.75, 4], [0.9999, 4]]) {
    const state = dealtRoom();
    let calls = 0;
    const random = () => { calls++; return sample; };
    assert.equal(startPlayIfReady(state, random), false);
    for (const player of state.players) {
      readyPlayer(state, player.id);
      if (player.id !== '4') assert.equal(startPlayIfReady(state, random), false);
    }
    const before = structuredClone(state);
    state.players[0].connected = false;
    assert.equal(startPlayIfReady(state, random), false);
    state.players[0].connected = true;
    assert.equal(calls, 0);
    assert.equal(startPlayIfReady(state, random), true);
    assert.deepEqual(state, { ...before, phase: 'active', turn: String(seat), turnStep: 'awaitingDraw' });
    assert.equal(startPlayIfReady(state, random), false);
    assert.equal(calls, 1);
    assert.throws(() => readyPlayer(state, '1'), { code: 'READY_NOT_AVAILABLE' });
  }
});

test('unsupported phases and incomplete opening hands reject readiness without mutation', () => {
  for (const change of [
    ...['active', 'finalRound', 'roundOver', 'gameAborted'].map(phase => state => { state.phase = phase; }),
    state => state.players.pop(),
    state => state.players[0].hand.pop(),
    state => { state.players[0].hand[0].handSlotId = 2; },
    state => { state.players[0].hand[0].card = null; },
    state => { state.players[0].hand.push({ ...state.players[0].hand[0], handSlotId: 5 }); },
  ]) {
    const state = dealtRoom();
    change(state);
    const before = structuredClone(state);
    assert.equal(isMemorization(state), false);
    for (const action of [readyPlayer, unreadyPlayer]) {
      assert.throws(() => action(state, 'outsider'), { code: 'NOT_IN_ROOM' });
      assert.throws(() => action(state, '1'), { code: 'READY_NOT_AVAILABLE' });
      assert.deepEqual(state, before);
    }
  }
});

test('memorization departures clear all round fields while preserving survivor objects and seats', () => {
  const state = dealtRoom();
  state.players.forEach(player => { player.isReady = true; });
  const survivors = state.players.filter(player => player.id !== '2');
  const expectedPlayers = structuredClone(survivors).map(player => ({ ...player, hand: [], isReady: false }));
  const before = structuredClone(state);
  assert.equal(removeLobbyPlayer(state, 'outsider'), false);
  assert.deepEqual(state, before);
  Object.assign(state, {
    turn: '1', turnStep: 'resolvingPower', pendingPower: 'selfPeek', pendingPowerStage: 'awaitingPeekDone',
    pendingMatch: { matcherPlayerId: '1', recipientPlayerId: '3', stage: 'awaitingGift' },
    cambioCalledBy: '1', finalMatchGraceDeadline: 100, winners: ['1'],
  });
  state.discardPile = { cards: [state.deck.cards[0]], topMatchStatus: 'matched' };
  for (const player of survivors) {
    Object.assign(player, { drawnCard: state.deck.cards[0], drawnFrom: 'deck', drawnCardRevealed: true, score: 12, calledCambio: true });
  }
  assert.equal(removeLobbyPlayer(state, '2'), true);
  assert.deepEqual(state, { ...createGameState(), players: expectedPlayers });
  state.players.forEach((player, index) => assert.equal(player, survivors[index]));
});
