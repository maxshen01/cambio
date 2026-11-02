// Real Socket.IO coverage for draw privacy/publicity, ordered resolutions, and requester-only errors.
import assert from 'node:assert/strict';
import test from 'node:test';
import { activeHarness, dealtHarness, confirmReady } from '../helpers/room.js';
import { nextEvent, recordEvents } from '../helpers/socket.js';
import { allCards } from '../helpers/activeGame.js';

test('IT-02 privately draws, rejects a duplicate, discards and replaces with ordered completion', async t => {
  const { clients, connect, gameState, drain } = await activeHarness(t);
  const outsider = await connect();
  const observed = recordEvents(t, [...clients, outsider]);
  const records = observed.records.slice(0, 4);
  const outsiderEvents = observed.records[4];
  const physical = new Set(allCards(gameState));
  for (let turn = 0; turn < 2; turn++) {
    records.forEach(record => { record.length = 0; });
    const owner = clients[turn % 4];
    const ordinary = gameState.deck.cards.findIndex(card => !card.power);
    gameState.deck.cards.push(...gameState.deck.cards.splice(ordinary, 1));
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
  await drain();
  assert.deepEqual(outsiderEvents, []);
});

test('each turn action rejects a representative invalid request privately without mutation', async t => {
  const { clients, connect, gameState, drain } = await activeHarness(t);
  const outsider = await connect();
  const recipients = [...clients, outsider];
  const observed = recordEvents(t, recipients);
  const records = new Map(recipients.map((client, index) => [client, observed.records[index]]));
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
    const { clients, connect, gameState, drain } = await activeHarness(t);
    const outsider = await connect();
    const recipients = [...clients, outsider];
    const { records } = recordEvents(t, recipients);
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

    if (count === 1) {
      await rejected(outsider, 'drawCard', { source: 'discard' }, 'NOT_IN_ROOM');
      await rejected(clients[1], 'drawCard', { source: 'discard' }, 'NOT_YOUR_TURN');
    }
    const piles = clients.map(client => nextEvent(client, 'discardPileUpdated'));
    owner.emit('drawCard', { source: 'discard' });
    assert.deepEqual(await Promise.all(piles), clients.map(() => ({ top: older ? { cardId: older.cardId } : null })));
    assert.equal(gameState.discardPile.topMatchStatus, older ? 'exposed' : null);
    if (count === 1) {
      await rejected(owner, 'discardDrawnCard', {}, 'MUST_SWAP_DISCARD_DRAW');
      await rejected(owner, 'drawCard', { source: 'discard' }, 'DRAW_NOT_AVAILABLE');
      await rejected(owner, 'swapDrawnCard', { target: { playerId: clients[1].id, handSlotId: 1 } }, 'INVALID_TARGET');
    }
    const turns = clients.map(client => nextEvent(client, 'turnChanged'));
    owner.emit('swapDrawnCard', { target });
    assert.deepEqual(await Promise.all(turns), clients.map(() => ({ playerId: clients[1].id })));
    await drain(owner);
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
    if (count === 1) {
      gameState.discardPile.cards = [];
      await rejected(clients[1], 'drawCard', { source: 'discard' }, 'DISCARD_EMPTY');
    }
  }
});
