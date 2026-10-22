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

test('ready broadcasts only new lobby marks and retains four ready players without dealing', async t => {
  const { connect, gameState } = await harness(t);
  const outsider = await connect();
  let outsiderUpdates = 0;
  outsider.on('playerReady', () => { outsiderUpdates++; });
  const clients = [];
  const readyEvents = [];
  let setupEvents = 0;
  for (let seat = 1; seat <= 4; seat++) {
    const client = await connect();
    client.on('playerReady', payload => readyEvents.push([seat, payload]));
    for (const event of ['dealComplete', 'turnChanged', 'gameState']) {
      client.on(event, () => { setupEvents++; });
    }
    await join(client, `Player ${seat}`, clients);
    clients.push(client);
    if (seat === 1) {
      const ready = nextEvent(client, 'playerReady');
      client.emit('ready', {});
      assert.deepEqual(await ready, { playerId: client.id });
      assert.equal(gameState.players[0].isReady, true);
    }
  }

  assert.deepEqual(gameState.players.map(player => player.isReady), [true, false, false, false]);
  for (const client of clients.slice(1)) {
    const events = clients.map(recipient => nextEvent(recipient, 'playerReady'));
    client.emit('ready', {});
    assert.deepEqual(await Promise.all(events), clients.map(() => ({ playerId: client.id })));
  }
  const count = readyEvents.length;
  clients[0].emit('ready', {});
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(readyEvents.length, count);
  assert.equal(outsiderUpdates, 0);
  assert.equal(setupEvents, 0);
  assert.equal(gameState.phase, 'deal');
  assert.deepEqual(gameState.players.map(player => player.isReady), [true, true, true, true]);

  const survivors = [clients[0], clients[2], clients[3]];
  const departure = survivors.map(client => nextEvent(client, 'playerDisconnected'));
  clients[1].disconnect();
  await Promise.all(departure);
  const replacement = await connect();
  const { view } = await join(replacement, 'Replacement', survivors);
  assert.deepEqual(view.players.map(player => [player.seatId, player.isReady]), [
    [1, true], [2, false], [3, true], [4, true],
  ]);
  const replacementReady = survivors.map(client => nextEvent(client, 'playerReady'));
  replacement.emit('ready', {});
  assert.deepEqual(await Promise.all(replacementReady), survivors.map(() => ({ playerId: replacement.id })));
});

test('ready rejects unseated and dealt senders only at the requesting socket', async t => {
  const { connect, gameState } = await harness(t);
  const seated = await connect();
  const outsider = await connect();
  await join(seated, 'One');
  let broadcasts = 0;
  let otherErrors = 0;
  seated.on('playerReady', () => { broadcasts++; });
  outsider.on('error', () => { otherErrors++; });
  const unseatedError = nextEvent(outsider, 'error');
  outsider.emit('ready', {});
  assert.deepEqual(await unseatedError, {
    code: 'NOT_IN_ROOM', message: 'You are not in this room.',
  });
  assert.equal(otherErrors, 1);
  otherErrors = 0;

  gameState.players[0].hand.push({ handSlotId: 1 });
  const before = structuredClone(gameState);
  const stageError = nextEvent(seated, 'error');
  seated.emit('ready', {});
  assert.deepEqual(await stageError, {
    code: 'READY_NOT_AVAILABLE', message: 'Ready is not available right now.',
  });
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(broadcasts, 0);
  assert.equal(otherErrors, 0);
  assert.deepEqual(gameState, before);
});

test('unready reaches seated clients, locks at four ready, and unlocks after departure', async t => {
  const { connect, gameState } = await harness(t);
  const outsider = await connect();
  const clients = [];
  let outsiderUpdates = 0;
  let extraUpdates = 0;
  outsider.on('playerUnready', () => { outsiderUpdates++; });
  for (let seat = 1; seat <= 4; seat++) {
    const client = await connect();
    client.on('playerUnready', () => { extraUpdates++; });
    await join(client, `Player ${seat}`, clients);
    clients.push(client);
  }
  const notInRoom = nextEvent(outsider, 'error');
  outsider.emit('unready', {});
  assert.equal((await notInRoom).code, 'NOT_IN_ROOM');

  const initialReady = nextEvent(clients[0], 'playerReady');
  clients[0].emit('ready', {});
  await initialReady;
  assert.equal(gameState.players[0].isReady, true);
  const updates = clients.map(client => nextEvent(client, 'playerUnready'));
  clients[0].emit('unready', {});
  assert.deepEqual(await Promise.all(updates), clients.map(() => ({ playerId: clients[0].id })));
  assert.equal(gameState.players[0].isReady, false);
  const broadcastCount = extraUpdates;
  clients[0].emit('unready', {});
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(extraUpdates, broadcastCount);
  assert.equal(outsiderUpdates, 0);

  for (const client of clients) {
    const event = nextEvent(clients[0], 'playerReady');
    client.emit('ready', {});
    assert.deepEqual(await event, { playerId: client.id });
  }
  const lockedState = structuredClone(gameState);
  const lockedError = nextEvent(clients[0], 'error');
  clients[0].emit('unready', {});
  assert.equal((await lockedError).code, 'READY_NOT_AVAILABLE');
  assert.deepEqual(gameState, lockedState);
  assert.equal(extraUpdates, broadcastCount);

  const departure = nextEvent(clients[0], 'playerDisconnected');
  clients[1].disconnect();
  await departure;
  const unlocked = nextEvent(clients[2], 'playerUnready');
  clients[0].emit('unready', {});
  assert.deepEqual(await unlocked, { playerId: clients[0].id });
  assert.equal(gameState.players.find(player => player.id === clients[0].id).isReady, false);
});

test('duplicate and invalid names only reach the requester, then a departed name can be reused', async t => {
  const { connect, gameState } = await harness(t);
  const first = await connect();
  const outsider = await connect();
  await join(first, '  Éva   Smith ');

  let lobbyUpdates = 0;
  let otherErrors = 0;
  first.on('playerJoined', () => { lobbyUpdates++; });
  first.on('error', () => { otherErrors++; });
  for (const displayName of ['e\u0301VA Smith', 'Alice😀']) {
    const before = structuredClone(gameState);
    let acked = false;
    const error = nextEvent(outsider, 'error');
    outsider.emit('joinRoom', { displayName }, () => { acked = true; });
    assert.deepEqual(await error, {
      code: 'INVALID_NAME',
      message: displayName === 'Alice😀'
        ? 'Use letters, numbers, spaces, apostrophes, hyphens, or periods.'
        : 'That name is already taken.',
    });
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(acked, false);
    assert.equal(lobbyUpdates, 0);
    assert.equal(otherErrors, 0);
    assert.deepEqual(gameState, before);
  }

  const { ack } = await join(outsider, 'Bob', [first]);
  assert.equal(ack.seatId, 2);
  const departed = nextEvent(outsider, 'playerDisconnected');
  first.disconnect();
  await departed;
  const replacement = await connect();
  const { ack: replacementAck, view } = await join(replacement, 'éva smith', [outsider]);
  assert.equal(replacementAck.seatId, 1);
  assert.deepEqual(view.players.map(player => player.displayName), ['éva smith', 'Bob']);
});
