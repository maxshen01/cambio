// Checks private dealing, memorization, and replacement-seat redealing.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../../src/game/state.js';
import { nextEvent } from '../helpers/socket.js';
import { harness, join, dealtHarness, confirmReady } from '../helpers/room.js';

test('fourth memorization notice precedes exactly one first turn, with targeted readiness errors', async t => {
  let randomCalls = 0;
  const { clients, connect, gameState } = await dealtHarness(t, { random: () => { randomCalls++; return 0.5; } });
  const outsider = await connect();
  const events = [];
  const errors = [];
  for (const client of [...clients, outsider]) {
    for (const event of ['playerReady', 'dealComplete', 'turnChanged', 'gameState', 'gameAborted', 'playerUnready']) {
      client.on(event, payload => events.push({ recipient: client.id, event, payload }));
    }
    client.on('error', payload => errors.push({ recipient: client.id, payload }));
  }
  const original = structuredClone(gameState);
  for (const action of ['ready', 'unready']) {
    const error = nextEvent(outsider, 'error');
    outsider.emit(action, {});
    assert.equal((await error).code, 'NOT_IN_ROOM');
    assert.deepEqual(gameState, original);
  }
  for (const [index, client] of clients.entries()) {
    const turns = index === 3 ? clients.map(recipient => nextEvent(recipient, 'turnChanged')) : [];
    await confirmReady(client, clients);
    await Promise.all(turns);
    assert.equal(gameState.phase, index === 3 ? 'active' : 'deal');
    assert.equal(randomCalls, index === 3 ? 1 : 0);
    const before = structuredClone(gameState);
    client.emit('ready', {});
    if (index === 3) await nextEvent(client, 'error');
    const error = nextEvent(client, 'error');
    client.emit('unready', {});
    assert.equal((await error).code, 'READY_NOT_AVAILABLE');
    assert.deepEqual(gameState, before);
  }
  const completed = structuredClone(gameState);
  const rejected = nextEvent(clients[0], 'error');
  clients[0].emit('ready', {});
  assert.equal((await rejected).code, 'READY_NOT_AVAILABLE');
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.deepEqual(gameState, completed);
  original.players.forEach(player => { player.isReady = true; });
  assert.deepEqual(gameState, { ...original, phase: 'active', turn: clients[2].id, turnStep: 'awaitingDraw' });
  assert.equal(events.length, 20);
  for (const client of clients) {
    assert.deepEqual(events.filter(entry => entry.recipient === client.id), [...clients.map(sender => ({
      recipient: client.id, event: 'playerReady', payload: { playerId: sender.id },
    })), { recipient: client.id, event: 'turnChanged', payload: { playerId: clients[2].id } }]);
  }
  assert.deepEqual(errors.map(({ recipient, payload }) => [recipient, payload.code]), [
    [outsider.id, 'NOT_IN_ROOM'], [outsider.id, 'NOT_IN_ROOM'],
    ...clients.slice(0, 3).map(client => [client.id, 'READY_NOT_AVAILABLE']),
    [clients[3].id, 'READY_NOT_AVAILABLE'], [clients[3].id, 'READY_NOT_AVAILABLE'],
    [clients[0].id, 'READY_NOT_AVAILABLE'],
  ]);
});

for (const readyCount of [0, 2, 3]) {
  test(`departure after ${readyCount} memorization confirmations clears the deal and permits replacement-seat redealing`, async t => {
    const { clients, connect, gameState } = await dealtHarness(t);
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
    outsider.disconnect();
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.deepEqual(gameState, before);
    const survivors = clients.filter(client => client !== clients[1]);
    const expectedPlayers = gameState.players.filter(player => player.id !== clients[1].id)
      .map(player => ({ ...structuredClone(player), hand: [], isReady: false }));
    const updates = survivors.map(client => nextEvent(client, 'playerDisconnected'));
    for (const client of survivors) client.on('playerDisconnected', view => departures.push(view));
    clients[1].disconnect();
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
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(departures.length, 3);
    assert.deepEqual(unexpected, []);
    assert.equal(gameState.deck.cards.length, 92);
    assert.deepEqual(gameState.players.map(player => player.isReady), [false, false, false, false]);
  });
}

test('fourth lobby Ready sends one recipient-private deal after the ready notice', async t => {
  const { connect, gameState } = await harness(t);
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
  // Seed stale round fields to verify the real event path applies the full deal reset.
  Object.assign(gameState, {
    deck: { cards: [{ cardId: 999 }] },
    discardPile: { cards: [{ cardId: 998 }], topMatchStatus: 'matched' },
    turn: 'stale', turnStep: 'resolvingPower', pendingPower: 'selfPeek',
    pendingPowerStage: 'awaitingPeekDone',
    pendingMatch: { matcherPlayerId: 'stale', recipientPlayerId: 'stale', stage: 'awaitingGift' },
    cambioCalledBy: 'stale', finalMatchGraceDeadline: 123, winners: ['stale'],
  });
  for (const player of gameState.players) {
    Object.assign(player, { drawnCard: { cardId: 997 }, drawnFrom: 'deck', drawnCardRevealed: true, score: 5, calledCambio: true });
  }
  clients[0].emit('ready', {});
  await new Promise(resolve => setTimeout(resolve, 30));
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
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(readyEvents.length, count);
  assert.equal(outsiderUpdates, 0);
  assert.equal(setupEvents, 0);
  assert.equal(gameState.phase, 'deal');
  assert.equal(gameState.turn, null);
  assert.equal(gameState.turnStep, null);
  assert.equal(gameState.deck.cards.length, 92);
  assert.deepEqual(gameState.players.map(player => player.isReady), [false, false, false, false]);
  assert.deepEqual({ ...gameState, players: [], deck: { cards: [] } }, createGameState());
  for (const player of gameState.players) {
    assert.deepEqual({
      drawnCard: player.drawnCard, drawnFrom: player.drawnFrom, drawnCardRevealed: player.drawnCardRevealed,
      score: player.score, calledCambio: player.calledCambio,
    }, { drawnCard: null, drawnFrom: null, drawnCardRevealed: false, score: 0, calledCambio: false });
  }
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
