// Checks room recovery after injected faults across lobby and setup actions.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../../src/game/state.js';
import { nextEvent } from '../helpers/socket.js';
import { harness, join, dealtHarness, confirmReady } from '../helpers/room.js';

for (const action of ['joinRoom', 'ready', 'unready', 'disconnect']) {
  test(`unexpected ${action} fault resets the room, disconnects observers, and accepts a fresh join`, async t => {
    const { connect, gameState, io } = await harness(t);
    const first = await connect();
    const second = await connect();
    const outsider = await connect();
    await join(first, 'One');
    await join(second, 'Two', [first]);
    let departures = 0;
    let aborted = 0;
    for (const client of [first, second, outsider]) {
      client.on('playerDisconnected', () => departures++);
      client.on('gameAborted', () => aborted++);
    }
    const logs = t.mock.method(console, 'error', () => {});
    if (action === 'joinRoom') {
      // Mutation has already inserted the third player when the room join fails.
      io.sockets.sockets.get(outsider.id).join = () => { throw new Error('injected room fault'); };
    } else if (action === 'disconnect') {
      gameState.players.splice = function (...args) {
        Array.prototype.splice.apply(this, args);
        throw new Error('injected departure fault after removal');
      };
    } else {
      Object.defineProperty(gameState.players[0], 'isReady', {
        get: () => action === 'unready',
        set: () => { throw new Error('injected readiness fault'); },
      });
    }
    const disconnected = [first, second, outsider].map(client => nextEvent(client, 'disconnect'));
    if (action === 'disconnect') first.disconnect();
    else if (action === 'joinRoom') outsider.emit(action, { displayName: 'Three' });
    else first.emit(action, {});
    await Promise.all(disconnected);
    assert.deepEqual(gameState, createGameState());
    assert.equal(departures, 0);
    assert.equal(aborted, 0);
    assert.equal(logs.mock.callCount(), 1);
    const fresh = await connect();
    const { ack } = await join(fresh, 'Fresh');
    assert.equal(ack.seatId, 1);
    assert.equal(gameState.players.length, 1);
  });
}

for (const fault of ['deal', 'memorizationReady', 'memorizationDisconnect']) {
  test(`unexpected ${fault} fault resets shared state and suppresses recursive cleanup events`, async t => {
    const room = fault === 'deal' ? await harness(t) : await dealtHarness(t);
    const { connect, gameState } = room;
    const clients = room.clients ?? [];
    if (fault === 'deal') {
      for (let seat = 1; seat <= 4; seat++) {
        const client = await connect();
        await join(client, `Player ${seat}`, clients);
        clients.push(client);
      }
      for (const client of clients.slice(0, 3)) await confirmReady(client, clients);
      Object.defineProperty(gameState.players[0], 'drawnCard', {
        get: () => null, set: () => { throw new Error('injected deal reset fault'); },
      });
    } else if (fault === 'memorizationReady') {
      Object.defineProperty(gameState.players[0], 'isReady', {
        get: () => false, set: () => { throw new Error('injected memorization ready fault'); },
      });
    } else {
      Object.defineProperty(gameState.players[0], 'drawnCard', {
        get: () => null, set: () => { throw new Error('injected memorization cleanup fault'); },
      });
    }
    const outsider = await connect();
    const unwanted = [];
    for (const client of [...clients, outsider]) {
      for (const event of ['playerDisconnected', 'gameAborted', 'gameState', 'turnChanged', 'dealComplete']) {
        client.on(event, () => unwanted.push(event));
      }
    }
    const logs = t.mock.method(console, 'error', () => {});
    const disconnected = [...clients, outsider].map(client => nextEvent(client, 'disconnect'));
    if (fault === 'memorizationDisconnect') clients[1].disconnect();
    else clients[fault === 'deal' ? 3 : 0].emit('ready', {});
    await Promise.all(disconnected);
    assert.deepEqual(gameState, createGameState());
    assert.deepEqual(unwanted, []);
    assert.equal(logs.mock.callCount(), 1);
    const fresh = await connect();
    assert.equal((await join(fresh, 'Fresh')).ack.seatId, 1);
    assert.equal(gameState.players.length, 1);
  });
}
