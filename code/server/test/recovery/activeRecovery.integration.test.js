// Active departures reset the round while preserving live socket membership.
import assert from 'node:assert/strict';
import test from 'node:test';
import { activeHarness, join, confirmReady } from '../helpers/room.js';
import { nextEvent } from '../helpers/socket.js';
import { createGameState } from '../../src/game/state.js';

test('active departure with a pending card preserves seats and allows replacement/redeal', async t => {
  const { connect, gameState, clients, disconnect } = await activeHarness(t);
  gameState.discardPile.cards.push(gameState.deck.cards.pop(), gameState.deck.cards.pop());
  gameState.discardPile.topMatchStatus = 'matched';
  Object.assign(gameState.players[0], { drawnCard: gameState.deck.cards.pop(), drawnFrom: 'deck', drawnCardRevealed: true });
  gameState.turnStep = 'awaitingDrawnCardResolution';
  gameState.pendingPower = { power: 'selfPeek', stage: 'awaitingPeekDone' };
  gameState.pendingMatch = { matcherPlayerId: clients[0].id, recipientPlayerId: clients[1].id, stage: 'awaitingGift' };
  gameState.cambioCalledBy = clients[0].id;
  gameState.finalMatchGraceDeadline = 123;
  gameState.winners = [clients[0].id];
  for (const player of gameState.players) Object.assign(player, { isReady: true, score: 7, calledCambio: true });
  const departedId = clients[0].id;
  const survivors = clients.filter((_, i) => i !== 0);
  const orders = survivors.map(client => {
    const order = [];
    client.on('playerDisconnected', () => order.push('departure'));
    client.on('gameAborted', () => order.push('abort'));
    client.on('gameState', () => assert.fail('no snapshot expected'));
    return order;
  });
  const departures = survivors.map(client => nextEvent(client, 'playerDisconnected'));
  const aborts = survivors.map(client => nextEvent(client, 'gameAborted'));
  await disconnect(clients[0]);
  for (const notice of await Promise.all(departures)) {
    assert.equal(notice.players.length, 4);
    assert.equal(notice.players.find(player => player.playerId === departedId).connected, false);
  }
  const notices = await Promise.all(aborts);
  for (const notice of notices) {
    assert.equal(notice.reason, 'PLAYER_DISCONNECTED');
    assert.equal(notice.playerId, departedId);
    assert.deepEqual(notice.lobby.players.map(player => player.seatId), [1, 2, 3, 4].filter(seat => seat !== 1));
    assert.ok(notice.lobby.players.every(player => player.connected && !player.isReady));
  }
  for (const order of orders) assert.deepEqual(order, ['departure', 'abort']);
  assert.deepEqual({ ...gameState, players: [] }, createGameState());
  for (const player of gameState.players) {
    assert.deepEqual(player.hand, []);
    assert.equal(player.drawnCard, null);
    assert.equal(player.drawnFrom, null);
    assert.equal(player.drawnCardRevealed, false);
    assert.equal(player.score, 0);
    assert.equal(player.calledCambio, false);
  }
  const replacement = await connect();
  assert.equal((await join(replacement, 'Replacement', survivors)).ack.seatId, 1);
  const seated = [...survivors, replacement];
  for (const client of seated.slice(0, 3)) await confirmReady(client, seated);
  const deals = seated.map(client => nextEvent(client, 'dealComplete'));
  await confirmReady(seated[3], seated);
  await Promise.all(deals);
  assert.ok(gameState.players.every(player => player.hand.length === 4));
});

for (const action of ['drawCard', 'discardDrawnCard', 'swapDrawnCard']) {
  test(`${action} fault after mutation aborts and leaves the room usable`, async t => {
    const { gameState, io, clients, drain } = await activeHarness(t);
    const originalPlayers = [...gameState.players];
    if (action !== 'drawCard') {
      Object.assign(gameState.players[0], { drawnCard: gameState.deck.cards.pop(), drawnFrom: 'deck' });
      gameState.turnStep = 'awaitingDrawnCardResolution';
    }
    // Inject at a real rule boundary, with a one-shot fault so reset can complete.
    if (action === 'drawCard') {
      const pile = gameState.deck.cards;
      pile.pop = function () {
        Array.prototype.pop.call(this);
        throw new Error('injected deck pop');
      };
    } else if (action === 'discardDrawnCard') {
      gameState.discardPile.cards.push = function (card) {
        Array.prototype.push.call(this, card);
        throw new Error('injected discard push');
      };
    } else {
      const slot = gameState.players[0].hand[0];
      let card = slot.card;
      Object.defineProperty(slot, 'card', {
        get: () => card,
        set: value => { card = value; throw new Error('injected swap assignment'); },
      });
    }
    const logs = t.mock.method(console, 'error', () => {});
    const notices = clients.map(client => nextEvent(client, 'gameAborted'));
    clients[0].emit(action, action === 'drawCard' ? { source: 'deck' }
      : action === 'swapDrawnCard' ? { target: { playerId: clients[0].id, handSlotId: 1 } } : {});
    for (const notice of await Promise.all(notices)) {
      assert.equal(notice.reason, 'SERVER_ERROR');
      assert.equal('playerId' in notice, false);
      assert.equal(notice.lobby.players.length, 4);
    }
    assert.equal(logs.mock.callCount(), 1);
    assert.ok(clients.every(client => client.connected));
    assert.deepEqual(gameState.players, originalPlayers);
    assert.deepEqual({ ...gameState, players: [] }, createGameState());
    assert.equal(io.sockets.sockets.size, 4);
    if (action === 'drawCard') {
      for (const client of clients.slice(0, 3)) await confirmReady(client, clients);
      const deals = clients.map(client => nextEvent(client, 'dealComplete'));
      await confirmReady(clients[3], clients);
      await Promise.all(deals);
      assert.ok(gameState.players.every(player => player.hand.length === 4));
    } else {
      await confirmReady(clients[0], clients);
      assert.equal(gameState.players[0].isReady, true);
    }
    await drain(clients[0]);
  });
}

test('unseated and successive departures do not duplicate an active abort', async t => {
  const { connect, gameState, clients, disconnect } = await activeHarness(t);
  const outsider = await connect();
  let abortCount = 0;
  clients[0].on('gameAborted', () => abortCount++);
  await disconnect(outsider);
  // The server completed departure before survivor output is checked.
  const rejection = nextEvent(clients[0], 'error');
  clients[0].emit('ready', {});
  await rejection;
  assert.equal(gameState.phase, 'active');
  assert.equal(abortCount, 0);
  const abort = nextEvent(clients[0], 'gameAborted');
  await disconnect(clients[1]);
  await abort;
  const departure = nextEvent(clients[0], 'playerDisconnected');
  await disconnect(clients[2]);
  await departure;
  assert.equal(abortCount, 1);
  assert.equal(gameState.players.length, 2);
});

for (const fault of [false, true]) {
  test(`final-round departure ${fault ? 'with a notification fault' : 'during grace'} retains survivors`, async t => {
    const { gameState, io, clients, disconnect } = await activeHarness(t);
    Object.assign(gameState, {
      phase: 'finalRound', turn: null, turnStep: null, finalMatchGraceDeadline: 123,
    });
    const departingId = clients[1].id;
    const logs = t.mock.method(console, 'error', () => {});
    if (fault) {
      const originalTo = io.to.bind(io);
      let injected = false;
      t.mock.method(io, 'to', room => {
        if (injected) return originalTo(room);
        injected = true;
        throw new Error('injected fault after marking departure');
      });
    }
    const survivors = clients.filter((_, index) => index !== 1);
    const aborts = survivors.map(client => nextEvent(client, 'gameAborted'));
    await disconnect(clients[1]);
    for (const notice of await Promise.all(aborts)) {
      assert.equal(notice.reason, fault ? 'SERVER_ERROR' : 'PLAYER_DISCONNECTED');
      assert.ok(notice.lobby.players.every(player => player.playerId !== departingId));
    }
    assert.equal(logs.mock.callCount(), fault ? 1 : 0);
    assert.ok(survivors.every(client => client.connected));
    assert.equal(gameState.phase, 'deal');
    assert.equal(gameState.finalMatchGraceDeadline, null);
  });
}
