// Tests joinRoom and playerJoined through a real Socket.IO server and clients.

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import test from 'node:test';
import { createServer } from '../src/server.js';
import { createGameState } from '../src/game/state.js';

// Socket.IO ships this real client bundle; no separate test dependency is needed.
const require = createRequire(import.meta.url);
const { io: connectClient } = require('../node_modules/socket.io/client-dist/socket.io.js');

async function harness(t, gameState = createGameState()) {
  const { httpServer, io } = createServer({ gameState });
  await new Promise(resolve => {
    httpServer.listen(0, '127.0.0.1', resolve);
  });

  const url = `http://127.0.0.1:${httpServer.address().port}`;
  const clients = [];

  t.after(async () => {
    for (const client of clients) {
      client.disconnect();
    }
    await new Promise(resolve => {
      io.close(resolve);
    });
  });

  async function connect() {
    const client = connectClient(url, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    clients.push(client);
    await once(client, 'connect');
    return client;
  }

  return { connect, gameState };
}

function nextEvent(client, event) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${event}`));
    }, 1000);

    client.once(event, payload => {
      clearTimeout(timeout);
      resolve(payload);
    });
  });
}

async function join(client, name, seatedClients = []) {
  const recipients = [...seatedClients, client];
  const views = recipients.map(socket => {
    return nextEvent(socket, 'playerJoined');
  });
  const order = [];

  client.once('playerJoined', () => {
    order.push('joined');
  });
  const ack = await new Promise(resolve => {
    client.emit('joinRoom', { displayName: name }, value => {
      order.push('ack');
      resolve(value);
    });
  });

  const payloads = await Promise.all(views);
  assert.deepEqual(order, ['ack', 'joined']);
  for (const payload of payloads) {
    assert.deepEqual(payload, payloads[0]);
  }

  return { ack, view: payloads[0] };
}

test('each join acknowledges first, then broadcasts a public complete lobby to all seated clients', async t => {
  const { connect, gameState } = await harness(t);
  const clients = [];
  let dealEvents = 0;
  for (let i = 1; i <= 4; i++) {
    const client = await connect();
    client.on('dealComplete', () => {
      dealEvents++;
    });

    const { ack, view } = await join(client, ` Player ${i} `, clients);
    clients.push(client);
    assert.deepEqual(ack, { playerId: client.id, seatId: i });

    const expectedPlayers = clients.map((socket, index) => {
      return {
        playerId: socket.id,
        displayName: `Player ${index + 1}`,
        seatId: index + 1,
        connected: true,
        isReady: false,
      };
    });
    assert.deepEqual(view, { players: expectedPlayers });
    assert.equal(JSON.stringify(view).includes('drawnCard'), false);
    assert.equal(JSON.stringify(view).includes('hand'), false);
  }

  assert.equal(gameState.players.length, 4);
  assert.equal(dealEvents, 0);
});

test('invalid, repeated, full, and started or dealt joins only send requester errors', async t => {
  const { connect, gameState } = await harness(t);
  const clients = [];
  const first = await connect();
  await join(first, 'One');
  clients.push(first);
  const outsider = await connect();

  async function rejectJoin(requester, payload, code) {
    const before = structuredClone(gameState);
    let acked = false;
    let joined = false;
    let otherErrors = 0;
    const onJoined = () => {
      joined = true;
    };
    const onOtherError = () => {
      otherErrors++;
    };
    const observedClients = [...clients, outsider];

    for (const client of observedClients) {
      client.on('playerJoined', onJoined);
      if (client !== requester) {
        client.on('error', onOtherError);
      }
    }

    const error = nextEvent(requester, 'error');
    requester.emit('joinRoom', payload, () => {
      acked = true;
    });
    assert.equal((await error).code, code);
    await new Promise(resolve => {
      setTimeout(resolve, 30);
    });

    assert.equal(acked, false);
    assert.equal(joined, false);
    assert.equal(otherErrors, 0);
    assert.deepEqual(gameState, before);

    for (const client of observedClients) {
      client.off('playerJoined', onJoined);
      if (client !== requester) {
        client.off('error', onOtherError);
      }
    }
  }

  await rejectJoin(outsider, { displayName: '  ' }, 'INVALID_NAME');
  await rejectJoin(outsider, {}, 'INVALID_NAME');
  await rejectJoin(first, { displayName: 'Again' }, 'ALREADY_IN_ROOM');
  for (let i = 2; i <= 4; i++) {
    const client = await connect();
    await join(client, `${i}`, clients);
    clients.push(client);
  }
  await rejectJoin(outsider, { displayName: 'Five' }, 'ROOM_FULL');

  gameState.players.pop();
  gameState.phase = 'active';
  await rejectJoin(outsider, { displayName: 'Late' }, 'GAME_ALREADY_STARTED');
  gameState.phase = 'deal';
  gameState.players[0].hand = [{ handSlotId: 1, card: { cardId: 10 } }];
  await rejectJoin(outsider, { displayName: 'Late' }, 'GAME_ALREADY_STARTED');
});

test('disconnect broadcasts a public view only for seated departures and reuses the gap', async t => {
  const { connect, gameState } = await harness(t);
  const first = await connect();
  const middle = await connect();
  const last = await connect();
  const outsider = await connect();
  await join(first, 'One');
  await join(middle, 'Two', [first]);
  await join(last, 'Three', [first, middle]);
  gameState.players[0].isReady = true;
  gameState.players[2].isReady = true;

  let unexpected = 0;
  outsider.on('playerDisconnected', () => { unexpected++; });
  first.on('playerJoined', () => { unexpected++; });
  const firstUpdate = nextEvent(first, 'playerDisconnected');
  const lastUpdate = nextEvent(last, 'playerDisconnected');
  middle.disconnect();
  const [firstView, lastView] = await Promise.all([firstUpdate, lastUpdate]);
  assert.deepEqual(firstView, lastView);
  assert.deepEqual(firstView, { players: [
    { playerId: first.id, displayName: 'One', seatId: 1, connected: true, isReady: true },
    { playerId: last.id, displayName: 'Three', seatId: 3, connected: true, isReady: true },
  ] });
  assert.deepEqual(gameState.players.map(player => player.seatId), [1, 3]);

  let extraDisconnects = 0;
  first.on('playerDisconnected', () => { extraDisconnects++; });
  last.on('playerDisconnected', () => { extraDisconnects++; });
  outsider.disconnect();
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(unexpected, 0);
  assert.equal(extraDisconnects, 0);
  assert.deepEqual(gameState.players.map(player => player.seatId), [1, 3]);

  const replacement = await connect();
  const { ack, view } = await join(replacement, 'Replacement', [first, last]);
  assert.equal(ack.seatId, 2);
  assert.deepEqual(view.players.map(player => [player.seatId, player.isReady]), [
    [1, true], [2, false], [3, true],
  ]);
  assert.equal(JSON.stringify(firstView).includes('hand'), false);
  assert.equal(JSON.stringify(firstView).includes('drawnCard'), false);
});
