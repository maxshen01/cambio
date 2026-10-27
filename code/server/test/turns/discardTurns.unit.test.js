// Covers public pending draws, mandatory replacement, and discard/refill invariants.
import assert from 'node:assert/strict';
import test from 'node:test';
import { drawCard, discardDrawnCard, swapDrawnCard } from '../../src/game/turns.js';
import { toDrawnCardView } from '../../src/game/views/drawnCardView.js';
import { activeGame, allCards } from '../helpers/activeGame.js';

function reject(state, action, code) {
  const before = structuredClone(state);
  assert.throws(action, { code });
  assert.deepEqual(state, before);
}

test('discard draws expose an older top or empty pile, remain public, and require own replacement', () => {
  for (const count of [1, 2]) {
    const state = activeGame();
    state.discardPile.cards = state.deck.cards.splice(-count);
    state.discardPile.topMatchStatus = 'matched';
    const originals = new Set(allCards(state));
    const top = state.discardPile.cards.at(-1);
    const older = state.discardPile.cards.at(-2);
    // Exercise wraparound independently of array insertion order.
    state.players.reverse();
    state.turn = 'p4';
    const player = state.players.find(player => player.id === 'p4');
    const displaced = player.hand[0].card;
    drawCard(state, 'p4', { source: 'discard' });
    assert.equal(player.drawnCard, top);
    assert.equal(player.drawnFrom, 'discard');
    assert.equal(player.drawnCardRevealed, false);
    assert.equal(player.hand.length, 4);
    assert.equal(state.turnStep, 'awaitingDrawnCardResolution');
    assert.equal(state.discardPile.cards.at(-1), older);
    assert.equal(state.discardPile.topMatchStatus, older ? 'exposed' : null);
    for (const recipient of state.players) {
      assert.deepEqual(toDrawnCardView(player, recipient.id), { playerId: 'p4', faceUp: true, cardId: top.cardId });
    }
    reject(state, () => discardDrawnCard(state, 'p4'), 'MUST_SWAP_DISCARD_DRAW');
    for (const source of ['deck', 'discard']) reject(state, () => drawCard(state, 'p4', { source }), 'DRAW_NOT_AVAILABLE');
    reject(state, () => swapDrawnCard(state, 'p4', { target: { playerId: 'p1', handSlotId: 1 } }), 'INVALID_TARGET');
    reject(state, () => swapDrawnCard(state, 'p4', { target: { playerId: 'p4', handSlotId: 8 } }), 'INVALID_TARGET');
    assert.deepEqual(swapDrawnCard(state, 'p4', { target: { playerId: 'p4', handSlotId: 1 } }),
      { kind: 'drawn', target: { playerId: 'p4', handSlotId: 1 } });
    assert.equal(player.hand[0].card, top);
    assert.equal(state.discardPile.cards.at(-1), displaced);
    assert.equal(state.discardPile.topMatchStatus, 'eligible');
    assert.equal(state.turn, 'p1');
    assert.equal(state.turnStep, 'awaitingDraw');
    assert.equal(player.drawnCard, null);
    assert.equal(player.drawnFrom, null);
    assert.equal(player.drawnCardRevealed, false);
    assert.equal(state.pendingPower, null);
    assert.equal(state.pendingPowerStage, null);
    reject(state, () => swapDrawnCard(state, 'p4', { target: { playerId: 'p4', handSlotId: 1 } }), 'NOT_YOUR_TURN');
    assert.equal(allCards(state).length, 108);
    assert.deepEqual(new Set(allCards(state)), originals);
  }
});

test('discard draw guards reject without changing state', () => {
  const state = activeGame();
  reject(state, () => drawCard(state, 'p1', { source: 'discard' }), 'DISCARD_EMPTY');
  reject(state, () => drawCard(state, 'outsider', { source: 'discard' }), 'NOT_IN_ROOM');
  reject(state, () => drawCard(state, 'p2', { source: 'discard' }), 'NOT_YOUR_TURN');
  state.phase = 'deal';
  reject(state, () => drawCard(state, 'p1', { source: 'discard' }), 'DRAW_NOT_AVAILABLE');
  state.phase = 'active';
  state.pendingMatch = { matcherPlayerId: 'p2', recipientPlayerId: 'p3', stage: 'awaitingGift' };
  reject(state, () => drawCard(state, 'p1', { source: 'discard' }), 'MATCH_RESOLVING');
  state.pendingMatch = null;
  state.pendingPower = 'selfPeek';
  reject(state, () => drawCard(state, 'p1', { source: 'discard' }), 'DRAW_NOT_AVAILABLE');
});

test('discard draws retry low-deck refill while preserving the exposed top and physical cards', () => {
  for (const count of [3, 4, 6]) {
    const state = activeGame();
    state.discardPile.cards = state.deck.cards.splice(0, count);
    // Use a small independent low-deck fixture; conserve every physical card it contains.
    state.deck.cards = state.deck.cards.slice(-2);
    const originals = new Set(allCards(state));
    const deck = [...state.deck.cards];
    const discards = [...state.discardPile.cards];
    drawCard(state, 'p1', { source: 'discard' }, () => 0);
    assert.equal(state.players[0].drawnCard, discards.at(-1));
    assert.deepEqual(state.deck.cards.slice(-2), deck);
    assert.deepEqual(state.discardPile.cards, discards.slice(count >= 4 ? -3 : 0, -1));
    assert.equal(state.discardPile.topMatchStatus, 'exposed');
    assert.equal(state.deck.cards.length, 2 + Math.max(0, count - 3));
    const displaced = state.players[0].hand[0].card;
    swapDrawnCard(state, 'p1', { target: { playerId: 'p1', handSlotId: 1 } }, () => 0);
    assert.equal(state.discardPile.cards.at(-1), displaced);
    assert.equal(state.discardPile.topMatchStatus, 'eligible');
    assert.deepEqual(state.deck.cards.slice(-2), deck);
    assert.equal(state.deck.cards.length, Math.max(3, count - 1));
    assert.equal(allCards(state).length, 18 + count);
    assert.deepEqual(new Set(allCards(state)), originals);
  }
});

test('every discard-drawn power card replaces normally without effects or metadata changes', () => {
  for (const index of activeGame().deck.cards.flatMap((card, index) => card.power ? [index] : [])) {
    const state = activeGame();
    const [card] = state.deck.cards.splice(index, 1);
    const power = card.power;
    state.discardPile.cards.push(card);
    drawCard(state, 'p1', { source: 'discard' });
    reject(state, () => discardDrawnCard(state, 'p1'), 'MUST_SWAP_DISCARD_DRAW');
    swapDrawnCard(state, 'p1', { target: { playerId: 'p1', handSlotId: 1 } });
    assert.equal(state.players[0].hand[0].card, card);
    assert.equal(card.power, power);
    assert.equal(state.pendingPower, null);
    assert.equal(state.pendingPowerStage, null);
    assert.equal(state.turn, 'p2');
  }
});
