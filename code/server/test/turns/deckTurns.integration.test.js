// Real Socket.IO coverage for draw privacy/publicity, ordered resolutions, and requester-only errors.
import assert from 'node:assert/strict';
import test from 'node:test';
import { harness, dealtHarness, confirmReady } from '../helpers/room.js';
import { nextEvent } from '../helpers/socket.js';
import { activeGame, allCards } from '../helpers/activeGame.js';
import { PLAYER_ROOM } from '../../src/sockets/rooms.js';

async function activeHarness(t) {
  const room = await harness(t);
  const clients = [];
  for (let i = 0; i < 4; i++) {
    const client = await room.connect();
    await room.io.sockets.sockets.get(client.id).join(PLAYER_ROOM);
    clients.push(client);
  }
  Object.assign(room.gameState, activeGame(clients.map(client => client.id)));
  return { ...room, clients };
}

test('IT-02 privately draws, rejects a duplicate, discards, replaces, and wraps clockwise', async t => {
  const { clients, connect, gameState } = await activeHarness(t);
  const outsider = await connect();
  const records = clients.map(() => []);
  const outsiderEvents = [];
  outsider.onAny(event => outsiderEvents.push(event));
  clients.forEach((client, index) => client.onAny((event, payload) => records[index].push({ event, payload })));
  const physical = new Set(allCards(gameState));
  for (let turn = 0; turn < 5; turn++) {
    records.forEach(record => { record.length = 0; });
    const owner = clients[turn % 4];
    const top = gameState.deck.cards.at(-1);
    const draws = clients.map(client => nextEvent(client, 'cardDrawn'));
    owner.emit('drawCard', { source: 'deck' });
    const views = await Promise.all(draws);
    views.forEach((view, index) => assert.deepEqual(view, index === turn % 4
      ? { playerId: owner.id, source: 'deck', faceUp: true, cardId: top.cardId }
      : { playerId: owner.id, source: 'deck', faceUp: false }));
    const before = structuredClone(gameState);
    const duplicate = nextEvent(owner, 'error');
    owner.emit('drawCard', { source: 'deck' });
    assert.equal((await duplicate).code, 'DRAW_NOT_AVAILABLE');
    assert.deepEqual(gameState, before);
    const next = clients[(turn + 1) % 4];
    const completed = clients.map(client => nextEvent(client, 'turnChanged'));
    const replacing = turn % 2 === 1;
    const displaced = gameState.players[turn % 4].hand[0].card;
    const event = replacing ? 'swapDrawnCard' : 'discardDrawnCard';
    const payload = replacing ? { target: { playerId: owner.id, handSlotId: 1 } } : {};
    const repeatedResolution = nextEvent(owner, 'error');
    owner.emit(event, payload);
    owner.emit(event, payload);
    assert.deepEqual(await Promise.all(completed), clients.map(() => ({ playerId: next.id })));
    assert.equal((await repeatedResolution).code, 'NOT_YOUR_TURN');
    records.forEach((record, index) => {
      const successes = record.filter(entry => entry.event !== 'error');
      assert.deepEqual(successes, [
        { event: 'cardDrawn', payload: views[index] },
        ...(replacing ? [{ event: 'cardSwapped', payload: { kind: 'drawn', target: payload.target } }] : []),
        { event: 'discardPileUpdated', payload: { top: { cardId: (replacing ? displaced : top).cardId } } },
        { event: 'turnChanged', payload: { playerId: next.id } },
      ]);
      assert.equal(record.filter(entry => entry.event === 'error').length, clients[index] === owner ? 2 : 0);
    });
    assert.deepEqual(new Set(allCards(gameState)), physical);
    assert.equal(allCards(gameState).length, 108);
    assert.equal(gameState.players[turn % 4].drawnCard, null);
  }
  assert.deepEqual(outsiderEvents, []);
});

test('each turn action rejects a representative invalid request privately without mutation', async t => {
  const { clients, connect, gameState } = await activeHarness(t);
  const outsider = await connect();
  const records = new Map([...clients, outsider].map(client => [client, []]));
  for (const client of records.keys()) client.onAny((event, payload) => records.get(client).push({ event, payload }));
  async function rejected(client, event, payload, code) {
    const before = structuredClone(gameState);
    for (const record of records.values()) record.length = 0;
    const response = nextEvent(client, 'error');
    client.emit(event, payload);
    assert.equal((await response).code, code);
    assert.deepEqual(gameState, before);
    assert.deepEqual(records.get(client).map(entry => entry.event), ['error']);
    for (const [recipient, record] of records) if (recipient !== client) assert.deepEqual(record, []);
  }
  await rejected(outsider, 'drawCard', { source: 'deck' }, 'NOT_IN_ROOM');
  await rejected(clients[0], 'drawCard', { source: 'bad' }, 'INVALID_DRAW_SOURCE');
  await rejected(clients[0], 'discardDrawnCard', {}, 'RESOLUTION_NOT_AVAILABLE');
  const draws = clients.map(client => nextEvent(client, 'cardDrawn'));
  clients[0].emit('drawCard', { source: 'deck' });
  await Promise.all(draws);
  await rejected(clients[0], 'swapDrawnCard',
    { target: { playerId: clients[1].id, handSlotId: 1 } }, 'INVALID_TARGET');
});

test('representative power cards discard and replace through ordinary socket events without effects', async t => {
  const { clients, gameState } = await activeHarness(t);
  const seen = [];
  clients[0].onAny(event => seen.push(event));
  for (const [power, replace] of [['selfPeek', false], ['twoPeekSwap', true]]) {
    const index = gameState.deck.cards.findIndex(card => card.power === power);
    const [card] = gameState.deck.cards.splice(index, 1);
    gameState.deck.cards.push(card);
    const owner = clients.find(client => client.id === gameState.turn);
    const draws = clients.map(client => nextEvent(client, 'cardDrawn'));
    owner.emit('drawCard', { source: 'deck' });
    await Promise.all(draws);
    const turns = clients.map(client => nextEvent(client, 'turnChanged'));
    owner.emit(replace ? 'swapDrawnCard' : 'discardDrawnCard', replace ? { target: { playerId: owner.id, handSlotId: 1 } } : {});
    await Promise.all(turns);
    assert.equal(gameState.pendingPower, null);
    assert.equal(gameState.pendingPowerStage, null);
    assert.equal(card.power, power);
  }
  assert.ok(seen.every(event => ['cardDrawn', 'cardSwapped', 'discardPileUpdated', 'turnChanged'].includes(event)));
});

test('real setup leads through a deck discard into a discard draw and replacement', async t => {
  const { clients, gameState } = await dealtHarness(t, { random: () => 0 });
  const starts = clients.map(client => nextEvent(client, 'turnChanged'));
  for (const client of clients) await confirmReady(client, clients);
  await Promise.all(starts);
  const top = gameState.deck.cards.at(-1);
  const draws = clients.map(client => nextEvent(client, 'cardDrawn'));
  clients[0].emit('drawCard', { source: 'deck' });
  await Promise.all(draws);
  const turns = clients.map(client => nextEvent(client, 'turnChanged'));
  clients[0].emit('discardDrawnCard', {});
  await Promise.all(turns);
  assert.equal(gameState.turn, clients[1].id);
  assert.equal(gameState.discardPile.cards.at(-1), top);
  const publicDraws = clients.map(client => nextEvent(client, 'cardDrawn'));
  const emptyPiles = clients.map(client => nextEvent(client, 'discardPileUpdated'));
  clients[1].emit('drawCard', { source: 'discard' });
  assert.deepEqual(await Promise.all(publicDraws), clients.map(() => ({ playerId: clients[1].id, source: 'discard', faceUp: true, cardId: top.cardId })));
  assert.deepEqual(await Promise.all(emptyPiles), clients.map(() => ({ top: null })));
  const displaced = gameState.players[1].hand[0].card;
  const nextTurns = clients.map(client => nextEvent(client, 'turnChanged'));
  clients[1].emit('swapDrawnCard', { target: { playerId: clients[1].id, handSlotId: 1 } });
  await Promise.all(nextTurns);
  assert.equal(gameState.players[1].hand[0].card, top);
  assert.equal(gameState.discardPile.cards.at(-1), displaced);
  assert.equal(gameState.turn, clients[2].id);
});

test('IT-03 backend publicly draws before pile updates, rejects direct discard, and replaces once', async t => {
  for (const count of [1, 2]) {
    const { clients, connect, gameState } = await activeHarness(t);
    const outsider = await connect();
    const recipients = [...clients, outsider];
    const records = recipients.map(() => []);
    recipients.forEach((client, index) => client.onAny((event, payload) => records[index].push({ event, payload })));
    gameState.discardPile.cards = gameState.deck.cards.splice(-count);
    const physical = new Set(allCards(gameState));
    const top = gameState.discardPile.cards.at(-1);
    const older = gameState.discardPile.cards.at(-2);
    const owner = clients[0];
    const target = { playerId: owner.id, handSlotId: 1 };
    const displaced = gameState.players[0].hand[0].card;

    async function rejected(client, event, payload, code) {
      const before = structuredClone(gameState);
      const lengths = records.map(record => record.length);
      const response = nextEvent(client, 'error');
      client.emit(event, payload);
      assert.equal((await response).code, code);
      assert.deepEqual(gameState, before);
      records.forEach((record, index) => assert.deepEqual(record.slice(lengths[index]).map(entry => entry.event),
        recipients[index] === client ? ['error'] : []));
    }

    await rejected(outsider, 'drawCard', { source: 'discard' }, 'NOT_IN_ROOM');
    await rejected(clients[1], 'drawCard', { source: 'discard' }, 'NOT_YOUR_TURN');
    const piles = clients.map(client => nextEvent(client, 'discardPileUpdated'));
    owner.emit('drawCard', { source: 'discard' });
    assert.deepEqual(await Promise.all(piles), clients.map(() => ({ top: older ? { cardId: older.cardId } : null })));
    assert.equal(gameState.discardPile.topMatchStatus, older ? 'exposed' : null);
    await rejected(owner, 'discardDrawnCard', {}, 'MUST_SWAP_DISCARD_DRAW');
    for (const source of ['deck', 'discard']) await rejected(owner, 'drawCard', { source }, 'DRAW_NOT_AVAILABLE');
    for (const invalid of [{ playerId: clients[1].id, handSlotId: 1 }, { playerId: owner.id, handSlotId: 8 }]) {
      await rejected(owner, 'swapDrawnCard', { target: invalid }, 'INVALID_TARGET');
    }
    const turns = clients.map(client => nextEvent(client, 'turnChanged'));
    owner.emit('swapDrawnCard', { target });
    assert.deepEqual(await Promise.all(turns), clients.map(() => ({ playerId: clients[1].id })));
    await rejected(owner, 'swapDrawnCard', { target }, 'NOT_YOUR_TURN');
    for (let index = 0; index < clients.length; index++) {
      assert.deepEqual(records[index].filter(entry => entry.event !== 'error'), [
        { event: 'cardDrawn', payload: { playerId: owner.id, source: 'discard', faceUp: true, cardId: top.cardId } },
        { event: 'discardPileUpdated', payload: { top: older ? { cardId: older.cardId } : null } },
        { event: 'cardSwapped', payload: { kind: 'drawn', target } },
        { event: 'discardPileUpdated', payload: { top: { cardId: displaced.cardId } } },
        { event: 'turnChanged', payload: { playerId: clients[1].id } },
      ]);
    }
    assert.ok(records[4].every(entry => entry.event === 'error'));
    assert.equal(gameState.players[0].hand[0].card, top);
    assert.equal(gameState.players[0].drawnCard, null);
    assert.equal(gameState.discardPile.topMatchStatus, 'eligible');
    assert.equal(gameState.pendingPower, null);
    assert.equal(allCards(gameState).length, 108);
    assert.deepEqual(new Set(allCards(gameState)), physical);
    // Empty-source errors are domain errors with no mutation or public emissions.
    gameState.discardPile.cards = [];
    await rejected(clients[1], 'drawCard', { source: 'discard' }, 'DISCARD_EMPTY');
  }
});
