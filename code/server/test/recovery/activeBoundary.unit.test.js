// Fault injection exercises recovery after mutation without adding production debug controls.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameBoundary } from '../../src/sockets/boundary.js';
import { activeGame } from '../helpers/activeGame.js';
import { createGameState } from '../../src/game/state.js';
import { DomainError } from '../../src/game/domainError.js';
import { resetAbortedGame } from '../../src/game/recovery.js';

for (const phase of ['active', 'finalRound']) {
  for (const afterMutation of [false, true]) {
    test(`${phase} fault ${afterMutation ? 'after' : 'before'} mutation resets and suppresses recursive cleanup`, t => {
      const state = activeGame();
      state.phase = phase;
      const players = [...state.players];
      const notices = [];
      const socket = { id: 'p1', emit() { assert.fail('no action error expected'); } };
      let run;
      const io = {
        to: () => ({ emit: (event, payload) => {
          notices.push({ event, payload });
          run(socket, 'disconnect', () => assert.fail('recursive cleanup'));
        } }),
        disconnectSockets() { assert.fail('survivors must remain connected'); },
      };
      run = createGameBoundary(io, state);
      const logs = t.mock.method(console, 'error', () => {});
      run(socket, 'drawCard', () => {
        if (afterMutation) {
          state.phase = 'deal';
          state.deck.cards.pop();
          players[0].hand = [];
        }
        throw new Error('injected action fault');
      });
      assert.equal(logs.mock.callCount(), 1);
      assert.deepEqual(notices.map(notice => notice.event), ['gameAborted']);
      assert.equal(notices[0].payload.reason, 'SERVER_ERROR');
      assert.equal('playerId' in notices[0].payload, false);
      assert.deepEqual({ ...state, players: [] }, createGameState());
      assert.deepEqual(state.players, players);
      assert.ok(state.players.every(player => !player.hand.length && !player.isReady));
    });
  }
}

for (const source of [null, 'deck', 'discard']) {
  for (const departing of [0, 1]) {
    test(`abort reset: ${source ?? 'no draw'}, departing seat ${departing + 1}`, () => {
      const state = activeGame();
      const survivors = state.players.filter((_, index) => index !== departing);
      const expected = structuredClone(survivors);
      state.players[departing].connected = false;
      for (const player of state.players) {
        Object.assign(player, { isReady: true, score: 7, calledCambio: true });
      }
      if (source) Object.assign(state.players[0], {
        drawnCard: state.deck.cards.pop(), drawnFrom: source, drawnCardRevealed: true,
      });
      Object.assign(state, {
        turnStep: 'resolvingPower', pendingPower: { power: 'selfPeek', stage: 'awaitingPeekDone' },
        pendingMatch: { matcherPlayerId: 'p1', recipientPlayerId: 'p2', stage: 'awaitingGift' },
        cambioCalledBy: 'p1', finalMatchGraceDeadline: 123, winners: ['p1'],
      });
      state.discardPile.cards.push(state.deck.cards.pop());
      resetAbortedGame(state);
      assert.deepEqual(state, { ...createGameState(), players: expected.map(player => ({ ...player, hand: [] })) });
      state.players.forEach((player, index) => assert.equal(player, survivors[index]));
    });
  }
}

test('a failing live disconnect excludes the departed player and accepts later actions', t => {
  const state = activeGame();
  const notices = [];
  const socket = { id: 'p2', emit() {} };
  const io = { to: () => ({ emit: (event, payload) => notices.push({ event, payload }) }) };
  const run = createGameBoundary(io, state);
  t.mock.method(console, 'error', () => {});
  run(socket, 'disconnect', () => { throw new Error('before departure mutation'); });
  assert.deepEqual(state.players.map(player => player.id), ['p1', 'p3', 'p4']);
  assert.equal(notices[0].payload.reason, 'SERVER_ERROR');
  let ran = false;
  run(socket, 'ready', () => { ran = true; });
  assert.equal(ran, true);
});

test('live domain errors remain private and leave state unchanged', () => {
  const state = activeGame();
  const before = structuredClone(state);
  const errors = [];
  const run = createGameBoundary({ to() { assert.fail('no broadcast'); } }, state);
  run({ id: 'p2', emit: (event, payload) => errors.push({ event, payload }) }, 'drawCard', () => {
    throw new DomainError('NOT_YOUR_TURN', 'It is not your turn.');
  });
  assert.deepEqual(state, before);
  assert.deepEqual(errors, [{ event: 'error', payload: { code: 'NOT_YOUR_TURN', message: 'It is not your turn.' } }]);
});

test('normal live departure suppresses nested cleanup and releases its guard', () => {
  const state = activeGame();
  const socket = { id: 'p2' };
  const run = createGameBoundary({}, state);
  run(socket, 'disconnect', () => {
    run(socket, 'disconnect', () => assert.fail('nested departure'));
  });
  let ran = false;
  run(socket, 'ready', () => { ran = true; });
  assert.equal(ran, true);
});
