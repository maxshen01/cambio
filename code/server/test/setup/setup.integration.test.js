// Checks private dealing, memorization, and replacement-seat redealing.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../../src/game/state.js';
import { nextEvent, recordEvents } from '../helpers/socket.js';
import { harness, join, dealtHarness, confirmReady } from '../helpers/room.js';

test('fourth memorization notice precedes exactly one first turn without observer updates', async t => {
  const room = await dealtHarness(t, { random: () => 0.5 });
  const { clients, connect, gameState, drain } = room;
  const outsider = await connect();
  const recipients = [...clients, outsider];
  const { records, clear } = recordEvents(t, recipients);
  for (const [index, client] of clients.entries()) {
    const turns = index === 3 ? clients.map(recipient => nextEvent(recipient, 'turnChanged')) : [];
    await confirmReady(client, clients);
    await Promise.all(turns);
    await drain(client);
    assert.equal(gameState.phase, index === 3 ? 'active' : 'deal');
    // A duplicate setup confirmation has no broadcast and cannot start play early.
    if (index === 0) {
      const before = structuredClone(gameState);
      const lengths = records.map(record => record.length);
      client.emit('ready', {});
      await drain(client);
      assert.deepEqual(records.map(record => record.length), lengths);
      assert.deepEqual(gameState, before);
    }
  }
  for (const [index, record] of records.entries()) {
    assert.deepEqual(record, index === 4 ? [] : [
      ...clients.map(client => ({ event: 'playerReady', payload: { playerId: client.id } })),
      { event: 'turnChanged', payload: { playerId: clients[2].id } },
    ]);
  }
  clear();
  const before = structuredClone(gameState);
  const rejected = nextEvent(clients[0], 'error');
  clients[0].emit('ready', {});
  assert.equal((await rejected).code, 'READY_NOT_AVAILABLE');
  await drain(clients[0]);
  assert.deepEqual(gameState, before);
  records.forEach((record, index) => assert.deepEqual(record.map(item => item.event), index === 0 ? ['error'] : []));
});

for (const readyCount of [0, 3]) {
  test(`departure after ${readyCount} memorization confirmations clears the deal and permits replacement-seat redealing`, async t => {
    const { clients, connect, gameState, drain, disconnect } = await dealtHarness(t);
    const outsider = await connect();
    const unexpected = [];
    const departures = [];
    for (const client of [...clients, outsider]) {
      for (const event of ['turnChanged', 'gameState', 'gameAborted']) {
        client.on(event, () => unexpected.push(event));
      }
    }
    outsider.on('dealComplete', () => unexpected.push('outsider deal'));
    outsider.on('playerDisconnected', () => unexpected.push('outsider departure'));
    for (const client of clients.slice(0, readyCount)) await confirmReady(client, clients);
    const before = structuredClone(gameState);
    await disconnect(outsider);
    assert.deepEqual(gameState, before);
    const survivors = clients.filter(client => client !== clients[1]);
    const expectedPlayers = gameState.players.filter(player => player.id !== clients[1].id)
      .map(player => ({ ...structuredClone(player), hand: [], isReady: false }));
    const updates = survivors.map(client => nextEvent(client, 'playerDisconnected'));
    for (const client of survivors) client.on('playerDisconnected', view => departures.push(view));
    await disconnect(clients[1]);
    const views = await Promise.all(updates);
    assert.deepEqual(gameState, { ...createGameState(), players: expectedPlayers });
    const expectedView = { players: expectedPlayers.map(player => ({
      playerId: player.id, displayName: player.displayName, seatId: player.seatId,
      connected: true, isReady: false,
    })) };
    for (const view of views) assert.deepEqual(view, expectedView);
    const replacement = await connect();
    const { ack } = await join(replacement, 'Replacement', survivors);
    assert.equal(ack.seatId, 2);
    const nextClients = [survivors[0], replacement, survivors[1], survivors[2]];
    const freshDeals = nextClients.map(client => nextEvent(client, 'dealComplete'));
    for (const client of nextClients) await confirmReady(client, nextClients);
    const payloads = await Promise.all(freshDeals);
    for (const [index, payload] of payloads.entries()) {
      assert.deepEqual(payload.cards.map(card => [card.playerId, card.handSlotId]),
        nextClients.flatMap(client => [1, 2, 3, 4].map(slot => [client.id, slot])));
      assert.deepEqual(payload.cards.filter(card => card.faceUp).map(card => [card.playerId, card.handSlotId]),
        [2, 4].map(slot => [nextClients[index].id, slot]));
      for (const card of payload.cards.filter(card => !card.faceUp)) assert.equal('cardId' in card, false);
    }
    await drain(nextClients[3]);
    assert.equal(departures.length, 3);
    assert.deepEqual(unexpected, []);
    assert.equal(gameState.deck.cards.length, 92);
    assert.deepEqual(gameState.players.map(player => player.isReady), [false, false, false, false]);
  });
}

test('fourth lobby Ready sends one recipient-private deal after the ready notice', async t => {
  const { connect, gameState, drain } = await harness(t, createGameState(), { random: () => 1 - Number.EPSILON });
  const outsider = await connect();
  let outsiderUpdates = 0;
  for (const event of ['playerReady', 'dealComplete', 'gameState', 'turnChanged']) {
    outsider.on(event, () => { outsiderUpdates++; });
  }
  const clients = [];
  const readyEvents = [];
  const sequences = [];
  const deals = [];
  let setupEvents = 0;
  for (let seat = 1; seat <= 4; seat++) {
    const client = await connect();
    const sequence = [];
    sequences.push(sequence);
    client.on('playerReady', payload => readyEvents.push([seat, payload]));
    client.on('playerReady', payload => sequence.push(['playerReady', payload]));
    client.on('dealComplete', payload => { sequence.push(['dealComplete', payload]); deals.push([seat, payload]); });
    for (const event of ['turnChanged', 'gameState']) {
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
  clients[0].emit('ready', {});
  await drain(clients[0]);
  assert.equal(readyEvents.length, 1);
  for (const client of clients.slice(1)) {
    const events = clients.map(recipient => nextEvent(recipient, 'playerReady'));
    const complete = client === clients[3] ? clients.map(recipient => nextEvent(recipient, 'dealComplete')) : [];
    client.emit('ready', {});
    assert.deepEqual(await Promise.all(events), clients.map(() => ({ playerId: client.id })));
    await Promise.all(complete);
    if (client !== clients[3]) assert.equal(deals.length, 0);
  }
  const count = readyEvents.length;
  const dealtState = structuredClone(gameState);
  const unreadyRejected = nextEvent(clients[0], 'error');
  clients[0].emit('unready', {});
  assert.equal((await unreadyRejected).code, 'READY_NOT_AVAILABLE');
  await drain(clients[0]);
  assert.equal(readyEvents.length, count);
  assert.equal(outsiderUpdates, 0);
  assert.equal(setupEvents, 0);
  assert.equal(gameState.phase, 'deal');
  assert.equal(gameState.turn, null);
  assert.equal(gameState.turnStep, null);
  assert.equal(gameState.deck.cards.length, 92);
  assert.deepEqual(gameState.players.map(player => player.isReady), [false, false, false, false]);
  assert.deepEqual(gameState, dealtState);
  assert.equal(deals.length, 4);
  for (const sequence of sequences) {
    assert.deepEqual(sequence.slice(-2).map(([event]) => event), ['playerReady', 'dealComplete']);
    assert.deepEqual(sequence.at(-2)[1], { playerId: clients[3].id });
  }
  for (const [seat, payload] of deals) {
    assert.deepEqual(Object.keys(payload), ['cards']);
    assert.equal(payload.cards.length, 16);
    assert.equal(payload.cards.filter(card => card.faceUp).length, 2);
    const expected = gameState.players.flatMap(player => player.hand.map(slot => {
      const ref = { playerId: player.id, handSlotId: slot.handSlotId };
      return player.seatId === seat && [2, 4].includes(slot.handSlotId)
        ? { ...ref, faceUp: true, cardId: slot.card.cardId }
        : { ...ref, faceUp: false };
    }));
    assert.deepEqual(payload.cards, expected);
  }
});
