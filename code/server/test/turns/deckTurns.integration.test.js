// Real Socket.IO coverage for deck privacy, ordered resolutions, and requester-only errors.
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
      ? { playerId: owner.id, faceUp: true, cardId: top.cardId }
      : { playerId: owner.id, faceUp: false }));
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

test('socket validation rejects wrong stage/player, malformed targets, empty deck, and unsupported sources privately', async t => {
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
  await rejected(clients[1], 'drawCard', { source: 'deck' }, 'NOT_YOUR_TURN');
  for (const payload of [null, {}, { source: 'discard' }, { source: 'bad' }]) {
    await rejected(clients[0], 'drawCard', payload, 'INVALID_DRAW_SOURCE');
  }
  gameState.phase = 'deal';
  await rejected(clients[0], 'drawCard', { source: 'deck' }, 'DRAW_NOT_AVAILABLE');
  gameState.phase = 'active';
  await rejected(clients[0], 'discardDrawnCard', {}, 'RESOLUTION_NOT_AVAILABLE');
  const draws = clients.map(client => nextEvent(client, 'cardDrawn'));
  clients[0].emit('drawCard', { source: 'deck' });
  await Promise.all(draws);
  for (const target of [null, { playerId: clients[1].id, handSlotId: 1 }, { playerId: clients[0].id, handSlotId: 8 }]) {
    await rejected(clients[0], 'swapDrawnCard', { target }, 'INVALID_TARGET');
  }
  await rejected(clients[1], 'discardDrawnCard', {}, 'NOT_YOUR_TURN');
  gameState.players[0].drawnCard = null;
  await rejected(clients[0], 'discardDrawnCard', {}, 'NO_DRAWN_CARD');
  gameState.turnStep = 'awaitingDraw';
  gameState.deck.cards = [];
  await rejected(clients[0], 'drawCard', { source: 'deck' }, 'DECK_EMPTY');
});

test('all power kinds resolve through ordinary socket events with no power prompts or effects', async t => {
  const { clients, gameState } = await activeHarness(t);
  const powers = [...new Set(gameState.deck.cards.map(card => card.power).filter(Boolean))];
  const seen = [];
  clients[0].onAny(event => seen.push(event));
  for (const power of powers) {
    for (const replace of [false, true]) {
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
  }
  assert.ok(seen.every(event => ['cardDrawn', 'cardSwapped', 'discardPileUpdated', 'turnChanged'].includes(event)));
});

test('real lobby and memorization progression leads into a complete deck turn', async t => {
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
});
