// Jack resolution validates both positions before exchanging hidden cards.
import assert from 'node:assert/strict';
import test from 'node:test';
import { drawCard, discardDrawnCard, swapDrawnCard } from '../../src/game/turns/actions.js';
import { usePower, choosePowerTargets, skipPower, finishPowerPeek } from '../../src/game/turns/powers.js';
import { drawnPower, rejectsUnchanged as rejects, allCards } from '../helpers/activeGame.js';

const ref = (playerId, handSlotId = 1) => ({ playerId, handSlotId });
const pair = { first: ref('p1'), second: ref('p2') };
function drawn(suit = 'clubs', id = 'p1') { return drawnPower(11, id, suit); }
function started() {
  const state = drawn();
  assert.equal(discardDrawnCard(state, 'p1').kind, 'powerStarted');
  usePower(state, 'p1');
  return state;
}
for (const opponents of [false, true]) {
  test(`Jack exchanges ${opponents ? 'two opponents' : 'own and opponent'} cards and finishes once`, () => {
    const state = drawn('clubs', 'p4');
    const original = new Set(allCards(state));
    const held = state.players[3].drawnCard;
    const first = state.players[opponents ? 0 : 3].hand[0];
    const second = state.players[1].hand[0];
    const [a, b] = [first.card, second.card];
    const targets = { first: ref(opponents ? 'p1' : 'p4'), second: ref('p2') };
    assert.equal(discardDrawnCard(state, 'p4').power, 'blindSwap');
    assert.equal(state.players[3].drawnCardRevealed, false);
    usePower(state, 'p4');
    assert.equal(state.turn, 'p4');
    assert.equal(state.players[3].drawnCardRevealed, true);
    choosePowerTargets(state, 'p4', targets);
    assert.equal(first.card, b);
    assert.equal(second.card, a);
    assert.equal(state.discardPile.cards.at(-1), held);
    assert.equal(state.discardPile.topMatchStatus, 'eligible');
    assert.equal(state.turn, 'p1');
    assert.equal(state.turnStep, 'awaitingDraw');
    assert.equal(state.pendingPower, null);
    assert.equal(state.pendingPowerStage, null);
    assert.equal(state.players[3].drawnCard, null);
    assert.equal(state.players[3].drawnFrom, null);
    assert.equal(state.players[3].drawnCardRevealed, false);
    assert.deepEqual(state.players.map(p => p.hand.map(s => s.handSlotId)), Array(4).fill([1, 2, 3, 4]));
    assert.deepEqual(new Set(allCards(state)), original);
    assert.equal(allCards(state).length, 108);
    rejects(state, () => choosePowerTargets(state, 'p4', targets), 'NOT_YOUR_TURN');
  });
}

test('Jack rejects invalid shape, slots, ownership and lifecycle without mutation', () => {
  const state = started();
  for (const payload of [null, [], {}, { peekTarget: pair.first }, { first: [], second: pair.second }]) {
    rejects(state, () => choosePowerTargets(state, 'p1', payload), 'INVALID_POWER_ACTION');
  }
  for (const target of [ref('absent'), ref('p2', 8), ref('p2', '1'), {}]) {
    rejects(state, () => choosePowerTargets(state, 'p1', { ...pair, second: target }), 'INVALID_POWER_TARGET');
  }
  for (const second of [ref('p1'), ref('p1', 2)]) {
    rejects(state, () => choosePowerTargets(state, 'p1', { ...pair, second }), 'SWAP_NOT_ALLOWED');
  }
  rejects(state, () => choosePowerTargets(state, 'observer', pair), 'NOT_IN_ROOM');
  rejects(state, () => choosePowerTargets(state, 'p2', pair), 'NOT_YOUR_TURN');
  rejects(state, () => usePower(state, 'p1'), 'POWER_NOT_AVAILABLE');
  rejects(state, () => finishPowerPeek(state, 'p1'), 'POWER_NOT_AVAILABLE');
  rejects(state, () => drawCard(state, 'p1', { source: 'deck' }), 'DRAW_NOT_AVAILABLE');
  rejects(state, () => swapDrawnCard(state, 'p1', { target: pair.first }), 'RESOLUTION_NOT_AVAILABLE');
  const waiting = drawn();
  rejects(waiting, () => choosePowerTargets(waiting, 'p1', pair), 'POWER_NOT_AVAILABLE');
  discardDrawnCard(waiting, 'p1');
  rejects(waiting, () => choosePowerTargets(waiting, 'p1', pair), 'POWER_NOT_AVAILABLE');
});

for (const activate of [false, true]) {
  test(`Jack Skip ${activate ? 'after' : 'before'} activation preserves hands`, () => {
    const state = drawn();
    const hands = structuredClone(state.players.map(p => p.hand));
    discardDrawnCard(state, 'p1');
    if (activate) usePower(state, 'p1');
    skipPower(state, 'p1');
    assert.deepEqual(state.players.map(p => p.hand), hands);
    assert.equal(state.turn, 'p2');
    assert.equal(state.pendingPower, null);
  });
}

test('Jack completion retries a low-deck refill and conserves cards', () => {
  const state = started();
  state.discardPile.cards.push(...state.deck.cards.splice(0, state.deck.cards.length - 2));
  const topTwo = [...state.deck.cards];
  const original = new Set(allCards(state));
  choosePowerTargets(state, 'p1', pair, () => 0);
  assert.deepEqual(state.deck.cards.slice(-2), topTwo);
  assert.equal(state.discardPile.cards.length, 2);
  assert.deepEqual(new Set(allCards(state)), original);
});
