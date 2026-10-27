// Covers private pending-card ownership, synchronous resolution, and refill conservation.
import assert from 'node:assert/strict';
import test from 'node:test';
import { drawCard, discardDrawnCard, swapDrawnCard } from '../../src/game/turns.js';
import { toDrawnCardView } from '../../src/game/views/drawnCardView.js';
import { refillDeck, createDeck } from '../../src/game/deck.js';
import { activeGame, allCards } from '../helpers/activeGame.js';

test('one deck draw stays outside the hand and only its owner sees its face', () => {
  const state = activeGame();
  const top = state.deck.cards.at(-1);
  drawCard(state, 'p1', { source: 'deck' });
  assert.equal(state.players[0].drawnCard, top);
  assert.equal(state.players[0].hand.length, 4);
  assert.equal(state.turnStep, 'awaitingDrawnCardResolution');
  assert.deepEqual(toDrawnCardView(state.players[0], 'p1'), { playerId: 'p1', faceUp: true, cardId: top.cardId });
  assert.deepEqual(toDrawnCardView(state.players[0], 'p2'), { playerId: 'p1', faceUp: false });
  assert.equal(allCards(state).length, 108);
});

test('discard and replacement each advance exactly once clockwise, including seat four to one', () => {
  const state = activeGame();
  const originals = new Set(allCards(state));
  // Seat order, rather than array insertion order, determines advancement.
  state.players.reverse();
  for (const id of ['p1', 'p2', 'p3', 'p4', 'p1']) {
    assert.equal(state.turn, id);
    const player = state.players.find(player => player.id === id);
    drawCard(state, id, { source: 'deck' });
    const held = player.drawnCard;
    const displaced = player.hand[0].card;
    if (id === 'p2') {
      swapDrawnCard(state, id, { target: { playerId: id, handSlotId: 1 } });
      assert.equal(player.hand[0].card, held);
      assert.equal(state.discardPile.cards.at(-1), displaced);
    } else {
      discardDrawnCard(state, id);
      assert.equal(state.discardPile.cards.at(-1), held);
    }
    assert.equal(state.turnStep, 'awaitingDraw');
    assert.equal(state.discardPile.topMatchStatus, 'eligible');
    assert.equal(player.drawnCard, null);
    assert.equal(player.drawnFrom, null);
    assert.equal(player.drawnCardRevealed, false);
    assert.equal(state.pendingPower, null);
    assert.deepEqual(new Set(allCards(state)), originals);
  }
});

test('every power card discards or swaps without starting power resolution or changing metadata', () => {
  for (const card of createDeck().filter(card => card.power)) {
    for (const action of ['discard', 'swap']) {
      const state = activeGame();
      state.deck.cards = [card];
      drawCard(state, 'p1', { source: 'deck' });
      if (action === 'discard') discardDrawnCard(state, 'p1');
      else swapDrawnCard(state, 'p1', { target: { playerId: 'p1', handSlotId: 2 } });
      assert.equal(state.turn, 'p2');
      assert.equal(state.pendingPower, null);
      assert.equal(state.pendingPowerStage, null);
      assert.ok(card.power);
      assert.equal(action === 'discard' ? state.discardPile.cards.at(-1) : state.players[0].hand[1].card, card);
    }
  }
});

test('invalid draws and resolutions leave the entire state unchanged', () => {
  const reject = (state, action, code) => {
    const before = structuredClone(state);
    assert.throws(action, { code });
    assert.deepEqual(state, before);
  };
  const state = activeGame();
  reject(state, () => drawCard(state, 'outsider', { source: 'deck' }), 'NOT_IN_ROOM');
  reject(state, () => drawCard(state, 'p2', { source: 'deck' }), 'NOT_YOUR_TURN');
  for (const payload of [undefined, null, {}, { source: 'other' }]) {
    reject(state, () => drawCard(state, 'p1', payload), 'INVALID_DRAW_SOURCE');
  }
  for (const phase of ['deal', 'finalRound', 'roundOver', 'gameAborted']) {
    state.phase = phase;
    reject(state, () => drawCard(state, 'p1', { source: 'deck' }), 'DRAW_NOT_AVAILABLE');
    reject(state, () => discardDrawnCard(state, 'p1'), 'RESOLUTION_NOT_AVAILABLE');
  }
  state.phase = 'active';
  reject(state, () => discardDrawnCard(state, 'p1'), 'RESOLUTION_NOT_AVAILABLE');
  drawCard(state, 'p1', { source: 'deck' });
  reject(state, () => drawCard(state, 'p1', { source: 'deck' }), 'DRAW_NOT_AVAILABLE');
  reject(state, () => discardDrawnCard(state, 'p2'), 'NOT_YOUR_TURN');
  reject(state, () => swapDrawnCard(state, 'outsider', {}), 'NOT_IN_ROOM');
  for (const payload of [undefined, null, {}, { target: null }, { target: { playerId: 'p2', handSlotId: 1 } },
    { target: { playerId: 'p1', handSlotId: 5 } }, { target: { playerId: 'p1', handSlotId: '1' } }]) {
    reject(state, () => swapDrawnCard(state, 'p1', payload), 'INVALID_TARGET');
  }
  state.players[0].drawnCard = null;
  reject(state, () => discardDrawnCard(state, 'p1'), 'NO_DRAWN_CARD');
  state.turnStep = 'resolvingPower';
  reject(state, () => swapDrawnCard(state, 'p1', {}), 'RESOLUTION_NOT_AVAILABLE');
  state.turnStep = 'awaitingDraw';
  state.deck.cards = [];
  reject(state, () => drawCard(state, 'p1', { source: 'deck' }), 'DECK_EMPTY');
});

test('refill uses the low-deck threshold, preserves both top pairs, and conserves physical cards', () => {
  for (const deckCount of [0, 1, 2, 3]) {
    for (const discardCount of [0, 1, 2, 3, 6]) {
      const state = activeGame();
      const cards = state.deck.cards;
      state.deck.cards = cards.slice(0, deckCount);
      state.discardPile = { cards: cards.slice(10, 10 + discardCount), topMatchStatus: 'eligible' };
      const beforeDeck = [...state.deck.cards];
      const beforeDiscard = [...state.discardPile.cards];
      const physical = new Set(allCards(state));
      let calls = 0;
      refillDeck(state, () => { calls++; return 0; });
      if (deckCount <= 2 && discardCount >= 3) {
        assert.deepEqual(deckCount ? state.deck.cards.slice(-deckCount) : [], beforeDeck);
        assert.deepEqual(state.discardPile.cards, beforeDiscard.slice(-2));
        assert.equal(state.deck.cards.length, deckCount + discardCount - 2);
        assert.equal(calls, Math.max(0, discardCount - 3));
      } else {
        assert.deepEqual(state.deck.cards, beforeDeck);
        assert.deepEqual(state.discardPile.cards, beforeDiscard);
        assert.equal(calls, 0);
      }
      assert.equal(state.discardPile.topMatchStatus, 'eligible');
      assert.deepEqual(new Set(allCards(state)), physical);
    }
  }
});

test('long-running deck turns repeatedly refill without losing or duplicating cards', () => {
  const state = activeGame();
  const original = new Set(allCards(state));
  let refills = 0;
  for (let turn = 0; turn < 250; turn++) {
    const before = state.deck.cards.length;
    const id = state.turn;
    drawCard(state, id, { source: 'deck' }, () => 0);
    if (state.deck.cards.length >= before) refills++;
    if (turn % 2) swapDrawnCard(state, id, { target: { playerId: id, handSlotId: 1 } }, () => 0);
    else discardDrawnCard(state, id, () => 0);
    assert.equal(allCards(state).length, 108);
    assert.deepEqual(new Set(allCards(state)), original);
  }
  assert.ok(refills >= 2);
});

test('refill shuffles older discards at the bottom and retries after later draws and discards', () => {
  const state = activeGame();
  const [a, b, c, d, e, f, g] = state.deck.cards;
  state.deck.cards = [a, b];
  state.discardPile.cards = [c, d, e, f, g];
  refillDeck(state, () => 0);
  assert.deepEqual(state.deck.cards, [d, e, c, a, b]);
  assert.deepEqual(state.discardPile.cards, [f, g]);
  state.deck.cards = [a, b, c];
  state.discardPile.cards = [d, e];
  drawCard(state, 'p1', { source: 'deck' }, () => 0);
  assert.deepEqual(state.deck.cards, [a, b]);
  discardDrawnCard(state, 'p1', () => 0);
  assert.deepEqual(state.deck.cards, [d, a, b]);
  assert.deepEqual(state.discardPile.cards, [e, c]);
  state.discardPile.cards.push(f);
  drawCard(state, 'p2', { source: 'deck' }, () => 0);
  assert.deepEqual(state.deck.cards, [e, d, a]);
  assert.deepEqual(state.discardPile.cards, [c, f]);
});
