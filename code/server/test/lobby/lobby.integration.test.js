// Checks lobby membership and readiness through real sockets.
import assert from 'node:assert/strict';
import test from 'node:test';
import { nextEvent } from '../helpers/socket.js';
import { harness, join } from '../helpers/room.js';

test('two contenders for the last seat produce one acknowledgement and one ROOM_FULL', async t => {
  const { connect, gameState } = await harness(t);
  const seated = [];
  for (let seat = 1; seat <= 3; seat++) {
    const client = await connect();
    await join(client, `Player ${seat}`, seated);
    seated.push(client);
  }
  const contenders = await Promise.all([connect(), connect()]);
  const outcomes = contenders.map((client, index) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('Join outcome timed out')); }, 1500);
    function cleanup() { clearTimeout(timer); client.off('error', onError); }
    function onError(error) { cleanup(); resolve(error); }
    client.once('error', onError);
    client.timeout(1000).emit('joinRoom', { displayName: `Contender ${index}` }, (error, ack) => {
      if (!error) { cleanup(); resolve(ack); }
    });
  }));
  const result = await Promise.all(outcomes);
  assert.equal(result.filter(outcome => outcome.seatId === 4).length, 1);
  assert.equal(result.filter(outcome => outcome.code === 'ROOM_FULL').length, 1);
  assert.equal(gameState.players.length, 4);
  assert.equal(new Set(gameState.players.map(player => player.seatId)).size, 4);
  assert.ok(contenders.every(client => client.connected));
});

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
    requester.timeout(1000).emit('joinRoom', payload, error => {
      if (!error) acked = true;
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

test('ready rejects unseated senders and incomplete hands only at the requesting socket', async t => {
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

test('unready reaches seated clients and remains available after an undealt departure', async t => {
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

  for (const client of clients.slice(0, 3)) {
    const event = nextEvent(clients[0], 'playerReady');
    client.emit('ready', {});
    assert.deepEqual(await event, { playerId: client.id });
  }
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
    outsider.timeout(1000).emit('joinRoom', { displayName }, error => { if (!error) acked = true; });
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
