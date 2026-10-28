// Verifies card identities, rule metadata, and shuffle behavior.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createDeck, shuffleDeck } from '../../src/game/deck.js';


const suits = ['clubs', 'diamonds', 'hearts', 'spades'];

test('two decks contain 108 independent objects with two of every stable face ID', () => {
  const cards = createDeck();
  assert.equal(cards.length, 108);
  assert.equal(new Set(cards).size, 108);
  assert.deepEqual([...new Set(cards.map(card => card.cardId))], Array.from({ length: 54 }, (_, i) => i + 1));
  for (let cardId = 1; cardId <= 54; cardId++) {
    const pair = cards.filter(card => card.cardId === cardId);
    assert.equal(pair.length, 2);
    assert.deepEqual(pair[0], pair[1]);
    assert.notEqual(pair[0], pair[1]);
  }
  const fresh = createDeck();
  assert.ok(cards.every(card => !fresh.includes(card)));
  cards[0].rank = 6;
  assert.equal(cards[54].rank, 1);
  assert.equal(fresh[0].rank, 1);
});

test('every card has its printed rank, suit, and rule-defined power', () => {
  const cards = createDeck();
  for (const [suitIndex, suit] of suits.entries()) {
    for (let rank = 1; rank <= 13; rank++) {
      const black = suit === 'clubs' || suit === 'spades';
      const power = rank === 7 || rank === 8 ? 'selfPeek'
        : rank === 9 || rank === 10 ? 'opponentPeek'
          : rank === 11 ? 'blindSwap'
            : rank === 12 && black ? 'onePeekSwap'
              : rank === 13 && black ? 'twoPeekSwap' : null;
      const cardId = suitIndex * 13 + rank;
      for (const card of cards.filter(card => card.cardId === cardId)) {
        assert.deepEqual(card, { cardId, suit, rank, power });
      }
    }
  }
  for (const cardId of [53, 54]) {
    for (const card of cards.filter(card => card.cardId === cardId)) {
      assert.deepEqual(card, { cardId, suit: 'joker', rank: 0, power: null });
    }
  }
});

test('Fisher–Yates uses the injected source and decreasing ranges, in place', () => {
  const cards = createDeck().slice(0, 5);
  const original = [...cards];
  const values = [0.5, 0.75, 0, 0.5];
  let calls = 0;
  assert.equal(shuffleDeck(cards, () => values[calls++]), cards);
  assert.equal(calls, 4);
  assert.deepEqual(cards, [original[4], original[1], original[0], original[3], original[2]]);
  assert.equal(new Set(cards).size, 5);
});

test('shuffle preserves all 108 physical cards and metadata without cloning', () => {
  const cards = createDeck();
  const original = [...cards];
  const before = structuredClone(original);
  shuffleDeck(cards, () => 0);
  assert.deepEqual(cards, [...original.slice(1), original[0]]);
  assert.deepEqual(new Set(cards), new Set(original));
  assert.deepEqual(original, before);
  shuffleDeck(cards, () => 1 - Number.EPSILON);
  assert.deepEqual(cards, [...original.slice(1), original[0]]);
});

test('empty and single-card decks need no randomness; default randomness preserves a deck', () => {
  for (const cards of [[], createDeck().slice(0, 1)]) {
    const before = [...cards];
    shuffleDeck(cards, () => { assert.fail('No random value needed'); });
    assert.deepEqual(cards, before);
  }
  const cards = createDeck();
  const original = new Set(cards);
  shuffleDeck(cards);
  assert.deepEqual(new Set(cards), original);
});
