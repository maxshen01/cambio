// Two-stage powers retain the held card until a separate swap or skip completes.
import assert from 'node:assert/strict';
import test from 'node:test';
import { drawCard, discardDrawnCard } from '../../src/game/turns/actions.js';
import { choosePowerTargets, finishPowerPeek, choosePowerSwap, skipPower, usePower } from '../../src/game/turns/powers.js';
import { activeGame, allCards } from '../helpers/activeGame.js';

const ref = (playerId, handSlotId = 1) => ({ playerId, handSlotId });
const pair = { first: ref('p2'), second: ref('p3') };
function pending(rank = 12, suit = 'clubs') {
  const state = activeGame();
  const index = state.deck.cards.findIndex(card => card.rank === rank && card.suit === suit);
  state.deck.cards.push(...state.deck.cards.splice(index, 1));
  drawCard(state, 'p1', { source: 'deck' });
  discardDrawnCard(state, 'p1');
  return state;
}
function viewing(rank = 12) {
  const state = pending(rank);
  usePower(state, 'p1');
  choosePowerTargets(state, 'p1', { peekTargets: rank === 12 ? [ref('p1')] : [ref('p1'), ref('p1', 2)] });
  return state;
}
function rejects(state, action, code) {
  const before = structuredClone(state);
  assert.throws(action, { code });
  assert.deepEqual(state, before);
}

for (const rank of [12, 13]) {
  for (const suit of ['clubs', 'spades']) {
    test(`${rank} ${suit}: peek, Done, and an independent pair finish exactly once`, () => {
      const state = pending(rank, suit);
      const original = new Set(allCards(state));
      const held = state.players[0].drawnCard;
      assert.equal(state.pendingPower, rank === 12 ? 'onePeekSwap' : 'twoPeekSwap');
      usePower(state, 'p1');
      const targets = rank === 12 ? [ref('p1')] : [ref('p1'), ref('p1', 2)];
      const result = choosePowerTargets(state, 'p1', { peekTargets: targets });
      assert.deepEqual(result.targets.map(item => item.target), targets);
      assert.equal(result.targets[0].card, state.players[0].hand[0].card);
      rejects(state, () => skipPower(state, 'p1'), 'POWER_NOT_AVAILABLE');
      const beforeDone = structuredClone(state);
      finishPowerPeek(state, 'p1');
      assert.deepEqual(state, { ...beforeDone, pendingPowerStage: 'awaitingSwap' });
      assert.equal(state.players[0].drawnCard, held);
      rejects(state, () => finishPowerPeek(state, 'p1'), 'POWER_NOT_AVAILABLE');
      rejects(state, () => choosePowerSwap(state, 'p1', { first: ref('p2'), second: ref('p2', 2) }), 'SWAP_NOT_ALLOWED');
      const [a, b] = [state.players[1].hand[0].card, state.players[2].hand[0].card];
      choosePowerSwap(state, 'p1', pair);
      assert.equal(state.players[1].hand[0].card, b);
      assert.equal(state.players[2].hand[0].card, a);
      assert.equal(state.discardPile.cards.at(-1), held);
      assert.equal(state.discardPile.topMatchStatus, 'eligible');
      assert.equal(state.players[0].drawnCard, null);
      assert.equal(state.players[0].drawnFrom, null);
      assert.equal(state.players[0].drawnCardRevealed, false);
      assert.equal(state.pendingPower, null);
      assert.equal(state.pendingPowerStage, null);
      assert.equal(state.turn, 'p2');
      assert.equal(state.turnStep, 'awaitingDraw');
      assert.deepEqual(new Set(allCards(state)), original);
      assert.equal(allCards(state).length, 108);
      rejects(state, () => choosePowerSwap(state, 'p1', pair), 'NOT_YOUR_TURN');
    });
  }
  test(`${rank}: count, distinctness, shape, and occupancy errors preserve the stage`, () => {
    const state = pending(rank);
    rejects(state, () => choosePowerSwap(state, 'p1', pair), 'POWER_NOT_AVAILABLE');
    usePower(state, 'p1');
    for (const payload of [{}, { peekTargets: null }, { peekTarget: ref('p1') }]) {
      rejects(state, () => choosePowerTargets(state, 'p1', payload), 'INVALID_POWER_ACTION');
    }
    for (const peekTargets of [[], [ref('p1'), ref('p1')], [ref('p1'), ref('p2'), ref('p3')]]) {
      rejects(state, () => choosePowerTargets(state, 'p1', { peekTargets }), 'INVALID_TARGET_COUNT');
    }
    const targets = rank === 12 ? [ref('p1', 8)] : [ref('p1'), ref('missing')];
    rejects(state, () => choosePowerTargets(state, 'p1', { peekTargets: targets }), 'INVALID_POWER_TARGET');
    rejects(state, () => choosePowerSwap(state, 'p1', pair), 'POWER_NOT_AVAILABLE');
    const valid = rank === 12 ? [ref('p2')] : [ref('p2'), ref('p3')];
    choosePowerTargets(state, 'p1', { peekTargets: valid });
    finishPowerPeek(state, 'p1');
    rejects(state, () => choosePowerSwap(state, 'p1', {}), 'INVALID_POWER_ACTION');
    rejects(state, () => choosePowerSwap(state, 'p1', { ...pair, second: ref('p3', 8) }), 'INVALID_POWER_TARGET');
    rejects(state, () => choosePowerSwap(state, 'p2', pair), 'NOT_YOUR_TURN');
    rejects(state, () => choosePowerSwap(state, 'observer', pair), 'NOT_IN_ROOM');
    rejects(state, () => choosePowerTargets(state, 'p1', { peekTargets: valid }), 'POWER_NOT_AVAILABLE');
  });
  for (const stage of ['awaitingChoice', 'awaitingTargets', 'awaitingSwap']) {
    test(`${rank}: Skip at ${stage} preserves hands and completes`, () => {
      const state = stage === 'awaitingSwap' ? viewing(rank) : pending(rank);
      if (stage === 'awaitingTargets') usePower(state, 'p1');
      if (stage === 'awaitingSwap') finishPowerPeek(state, 'p1');
      const hands = structuredClone(state.players.map(p => p.hand));
      skipPower(state, 'p1');
      assert.deepEqual(state.players.map(p => p.hand), hands);
      assert.equal(state.pendingPower, null);
      assert.equal(state.turn, 'p2');
    });
  }
  for (const suit of ['hearts', 'diamonds']) {
    test(`${rank} ${suit}: red cards discard without a power`, () => {
      const state = pending(rank, suit);
      assert.equal(state.pendingPower, null);
      assert.equal(state.turn, 'p2');
    });
  }
}

test('two-stage completion retries refill, preserves physical cards, and wraps seat four', () => {
  const state = viewing(13);
  finishPowerPeek(state, 'p1');
  state.discardPile.cards.push(...state.deck.cards.splice(0, state.deck.cards.length - 2));
  const remainingTop = [...state.deck.cards];
  const original = new Set(allCards(state));
  choosePowerSwap(state, 'p1', pair, () => 0);
  assert.deepEqual(state.deck.cards.slice(-2), remainingTop);
  assert.equal(state.discardPile.cards.length, 2);
  assert.deepEqual(new Set(allCards(state)), original);
  const wrap = viewing();
  wrap.players[3].drawnCard = wrap.players[0].drawnCard;
  wrap.players[3].drawnFrom = 'deck'; wrap.players[3].drawnCardRevealed = true;
  wrap.players[0].drawnCard = null; wrap.players[0].drawnFrom = null; wrap.players[0].drawnCardRevealed = false;
  wrap.turn = 'p4';
  finishPowerPeek(wrap, 'p4');
  choosePowerSwap(wrap, 'p4', { first: ref('p4'), second: ref('p1') });
  assert.equal(wrap.turn, 'p1');
});
