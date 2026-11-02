// Shared isolated room fixtures with bounded socket waits and automatic teardown.
import assert from 'node:assert/strict';
import { io as connectClient } from 'socket.io-client';
import { createServer } from '../../src/server.js';
import { createGameState } from '../../src/game/state.js';
import { nextEvent, barrier } from './socket.js';
import { activeGame } from './activeGame.js';
import { PLAYER_ROOM } from '../../src/sockets/rooms.js';

// Creates a fresh server per test; callers may inject a game state for their feature.
export async function harness(t, gameState = createGameState(), options = {}) {
  const { httpServer, io } = createServer({ gameState, ...options });
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
      autoConnect: false,
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    clients.push(client);
    const connected = nextEvent(client, 'connect', 'connect_error');
    client.connect();
    await connected;
    // Test-only synchronization; production handlers are unchanged.
    io.sockets.sockets.get(client.id).on('testBarrier', ack => ack());
    return client;
  }

  async function drain(sender) {
    if (sender) await barrier(sender);
    await Promise.all(clients.filter(client => client.connected).map(barrier));
  }

  async function disconnect(client) {
    const completed = nextEvent(io.sockets.sockets.get(client.id), 'disconnect');
    client.disconnect();
    await completed;
    await drain();
  }

  return { connect, gameState, io, drain, disconnect };
}

// Isolated active play bypasses lobby requests while retaining real transport/membership.
export async function activeHarness(t, options = {}) {
  const room = await harness(t, undefined, options);
  const clients = [];
  for (let seat = 1; seat <= 4; seat++) {
    const client = await room.connect();
    await room.io.sockets.sockets.get(client.id).join(PLAYER_ROOM);
    clients.push(client);
  }
  Object.assign(room.gameState, activeGame(clients.map(client => client.id)));
  return { ...room, clients };
}

// Joins a client while checking acknowledgement order and every recipient's view.
export async function join(client, name, seatedClients = []) {
  const recipients = [...seatedClients, client];
  const views = recipients.map(socket => {
    return nextEvent(socket, 'playerJoined');
  });
  const order = [];

  const onJoined = () => order.push('joined');
  client.once('playerJoined', onJoined);
  let ack;
  let payloads;
  try {
    [ack, payloads] = await Promise.all([
      new Promise((resolve, reject) => {
        client.timeout(1000).emit('joinRoom', { displayName: name }, (error, value) => {
          if (error) return reject(error);
          order.push('ack');
          resolve(value);
        });
      }),
      Promise.all(views),
    ]);
  } finally {
    client.off('playerJoined', onJoined);
  }
  assert.deepEqual(order, ['ack', 'joined']);
  for (const payload of payloads) {
    assert.deepEqual(payload, payloads[0]);
  }

  return { ack, view: payloads[0] };
}

// Exercises the real lobby-to-deal transition for setup and recovery scenarios.
export async function dealtHarness(t, options = {}) {
  const room = await harness(t, createGameState(), options);
  const clients = [];
  for (let seat = 1; seat <= 4; seat++) {
    const client = await room.connect();
    await join(client, `Player ${seat}`, clients);
    clients.push(client);
  }
  for (const client of clients.slice(0, 3)) await confirmReady(client, clients);
  const deals = clients.map(client => nextEvent(client, 'dealComplete'));
  await confirmReady(clients[3], clients);
  await Promise.all(deals);
  return { ...room, clients };
}

// Subscribes before emitting so fast broadcasts cannot be missed.
export async function confirmReady(sender, recipients) {
  const events = recipients.map(client => nextEvent(client, 'playerReady'));
  sender.emit('ready', {});
  assert.deepEqual(await Promise.all(events), recipients.map(() => ({ playerId: sender.id })));
}
