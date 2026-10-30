// Exercises self-peek domain stages independently of socket notifications.
import assert from 'node:assert/strict';
import test from 'node:test';
import { startPowerResolution, usePower, skipPower, finishPowerPeek } from '../../src/game/powers.js';
import { drawCard, discardDrawnCard, swapDrawnCard } from '../../src/game/turns.js';
import { activeGame, allCards } from '../helpers/activeGame.js';

const target = { playerId: 'p1', handSlotId: 2 };
const usePayload = { peekTarget: target };

function drawnPower(rank = 7, id = 'p1') {
  const state = activeGame();
  state.turn = id;
  const index = state.deck.cards.findIndex(card => card.rank === rank);
  const [card] = state.deck.cards.splice(index, 1);
  // Keep a known old discard whose match status must survive start and use.
  state.discardPile.cards.push(state.deck.cards.pop());
  state.discardPile.topMatchStatus = 'matched';
  state.deck.cards.push(card);
  drawCard(state, id, { source: 'deck' });
  return state;
}

function pendingPower(stage = 'awaitingChoice') {
  const state = drawnPower();
  startPowerResolution(state, 'p1');
  if (stage === 'awaitingPeekDone') usePower(state, 'p1', usePayload);
  return state;
}

function rejectsUnchanged(state, action, code) {
  const before = structuredClone(state);
  assert.throws(action, { name: 'DomainError', code });
  assert.deepEqual(state, before);
}

for (const rank of [7, 8]) {
  test(`${rank}: start and use retain the held card, hands, piles, and current turn`, () => {
    const state = drawnPower(rank);
    const before = structuredClone(state);
    const player = state.players[0];
    const held = player.drawnCard;
    const peeked = player.hand[1].card;
    startPowerResolution(state, 'p1');
    assert.deepEqual(state, {
      ...before, turnStep: 'resolvingPower', pendingPower: 'selfPeek', pendingPowerStage: 'awaitingChoice',
    });
    const started = structuredClone(state);
    const result = usePower(state, 'p1', usePayload);
    started.pendingPowerStage = 'awaitingPeekDone';
    started.players[0].drawnCardRevealed = true;
    assert.deepEqual(state, started);
    assert.equal(player.drawnCard, held);
    assert.deepEqual(result, { target, card: peeked });
    assert.equal(result.card, peeked);
    assert.equal(allCards(state).length, 108);
    // No timer or subsequent action is required to keep the peek pending.
    rejectsUnchanged(state, () => skipPower(state, 'p1'), 'POWER_NOT_AVAILABLE');
    rejectsUnchanged(state, () => usePower(state, 'p1', usePayload), 'POWER_NOT_AVAILABLE');
  });

  for (const finish of [skipPower, finishPowerPeek]) {
    test(`${rank}: ${finish.name} clears pending state and advances exactly once`, () => {
      for (const id of ['p1', 'p4']) {
        const state = drawnPower(rank, id);
        state.players.reverse();
        const player = state.players.find(player => player.id === id);
        const held = player.drawnCard;
        const beforeDiscard = [...state.discardPile.cards];
        const physical = new Set(allCards(state));
        const hands = structuredClone(state.players.map(player => player.hand));
        startPowerResolution(state, id);
        if (finish === finishPowerPeek) usePower(state, id, { peekTarget: { playerId: id, handSlotId: 1 } });
        else assert.equal(player.drawnCardRevealed, false);
        finish(state, id);
        assert.deepEqual(state.discardPile.cards, [...beforeDiscard, held]);
        assert.equal(state.discardPile.topMatchStatus, 'eligible');
        assert.equal(state.turn, id === 'p4' ? 'p1' : 'p2');
        assert.equal(state.turnStep, 'awaitingDraw');
        assert.equal(player.drawnCard, null);
        assert.equal(player.drawnFrom, null);
        assert.equal(player.drawnCardRevealed, false);
        assert.equal(state.pendingPower, null);
        assert.equal(state.pendingPowerStage, null);
        assert.deepEqual(state.players.map(player => player.hand), hands);
        assert.equal(allCards(state).length, 108);
        assert.deepEqual(new Set(allCards(state)), physical);
        rejectsUnchanged(state, () => finish(state, id), 'NOT_YOUR_TURN');
        rejectsUnchanged(state, () => finish(state, state.turn), 'POWER_NOT_AVAILABLE');
      }
    });
  }
}

test('power actions enforce membership, turn ownership, then pending gift before mutation', () => {
  for (const state of [drawnPower(), pendingPower(), pendingPower('awaitingPeekDone')]) {
    for (const action of [startPowerResolution, usePower, skipPower, finishPowerPeek]) {
      rejectsUnchanged(state, () => action(state, 'outsider'), 'NOT_IN_ROOM');
      rejectsUnchanged(state, () => action(state, 'p2'), 'NOT_YOUR_TURN');
      state.pendingMatch = { matcherPlayerId: 'p2', recipientPlayerId: 'p3', stage: 'awaitingGift' };
      rejectsUnchanged(state, () => action(state, 'p1'), 'MATCH_RESOLVING');
      state.pendingMatch = null;
    }
  }
});

test('unavailable phases, sources, powers, held cards, and stages leave state unchanged', () => {
  const actions = [
    [startPowerResolution, drawnPower],
    [usePower, pendingPower],
    [skipPower, pendingPower],
    [finishPowerPeek, () => pendingPower('awaitingPeekDone')],
  ];
  for (const [action, fixture] of actions) {
    for (const phase of ['deal', 'finalRound', 'roundOver', 'gameAborted']) {
      const state = fixture();
      state.phase = phase;
      rejectsUnchanged(state, () => action(state, 'p1', usePayload), 'POWER_NOT_AVAILABLE');
    }
    for (const change of [
      state => { state.players[0].drawnFrom = 'discard'; },
      state => { state.players[0].drawnFrom = null; },
      state => { state.players[0].drawnCard = null; },
      state => { state.players[0].drawnCard = { ...state.players[0].drawnCard, power: 'opponentPeek' }; },
      state => { state.turnStep = 'awaitingDraw'; },
    ]) {
      const state = fixture();
      change(state);
      rejectsUnchanged(state, () => action(state, 'p1', usePayload), 'POWER_NOT_AVAILABLE');
    }
  }
  for (const rank of [1, 9, 10, 11, 12, 13]) {
    const state = drawnPower(rank);
    rejectsUnchanged(state, () => startPowerResolution(state, 'p1'), 'POWER_NOT_AVAILABLE');
  }
  for (const change of [
    state => { state.pendingPower = 'selfPeek'; },
    state => { state.pendingPowerStage = 'awaitingChoice'; },
    state => { state.players[0].drawnCardRevealed = true; },
  ]) {
    const state = drawnPower();
    change(state);
    rejectsUnchanged(state, () => startPowerResolution(state, 'p1'), 'POWER_NOT_AVAILABLE');
  }
  for (const stage of [null, 'awaitingSwap', 'awaitingPeekDone']) {
    const state = pendingPower();
    state.pendingPowerStage = stage;
    rejectsUnchanged(state, () => usePower(state, 'p1', usePayload), 'POWER_NOT_AVAILABLE');
    rejectsUnchanged(state, () => skipPower(state, 'p1'), 'POWER_NOT_AVAILABLE');
  }
  const state = pendingPower();
  rejectsUnchanged(state, () => finishPowerPeek(state, 'p1'), 'POWER_NOT_AVAILABLE');
  rejectsUnchanged(state, () => startPowerResolution(state, 'p1'), 'POWER_NOT_AVAILABLE');
  for (const power of [null, 'opponentPeek', 'blindSwap', 'onePeekSwap', 'twoPeekSwap']) {
    state.pendingPower = power;
    for (const action of [usePower, skipPower, finishPowerPeek]) {
      rejectsUnchanged(state, () => action(state, 'p1', usePayload), 'POWER_NOT_AVAILABLE');
    }
  }
});

test('Use distinguishes malformed actions from invalid own-hand targets before revealing', () => {
  const state = pendingPower();
  for (const payload of [undefined, null, [], 'peek', {}, { target }, { peekTarget: null }, { peekTarget: [] }, { peekTarget: 2 }]) {
    rejectsUnchanged(state, () => usePower(state, 'p1', payload), 'INVALID_POWER_ACTION');
  }
  for (const peekTarget of [{}, { playerId: 'p1' }, { handSlotId: 2 },
    { playerId: 'p2', handSlotId: 2 }, { playerId: 'outsider', handSlotId: 2 },
    ...[0, 5, 9, 1.5, '2', null].map(handSlotId => ({ playerId: 'p1', handSlotId }))]) {
    rejectsUnchanged(state, () => usePower(state, 'p1', { peekTarget }), 'INVALID_POWER_TARGET');
  }
  const slot = state.players[0].hand.pop();
  rejectsUnchanged(state, () => usePower(state, 'p1', { peekTarget: { playerId: 'p1', handSlotId: slot.handSlotId } }), 'INVALID_POWER_TARGET');
  const result = usePower(state, 'p1', { peekTarget: target, cardId: 999, power: 'blindSwap' });
  assert.equal(result.card, state.players[0].hand[1].card);
});

test('ordinary actions cannot draw, discard, or replace during either power stage', () => {
  for (const stage of ['awaitingChoice', 'awaitingPeekDone']) {
    const state = pendingPower(stage);
    rejectsUnchanged(state, () => drawCard(state, 'p1', { source: 'deck' }), 'DRAW_NOT_AVAILABLE');
    rejectsUnchanged(state, () => discardDrawnCard(state, 'p1'), 'RESOLUTION_NOT_AVAILABLE');
    rejectsUnchanged(state, () => swapDrawnCard(state, 'p1', { target }), 'RESOLUTION_NOT_AVAILABLE');
  }
});

test('peek targets use stable occupied slot IDs, including later columns', () => {
  const state = pendingPower();
  const hand = state.players[0].hand;
  // A sparse, reordered hand must be searched by slot ID, not array position.
  hand[0].handSlotId = 8;
  hand.reverse();
  const expected = hand.find(slot => slot.handSlotId === 8).card;
  const result = usePower(state, 'p1', { peekTarget: { playerId: 'p1', handSlotId: 8 } });
  assert.deepEqual(result.target, { playerId: 'p1', handSlotId: 8 });
  assert.equal(result.card, expected);
});

test('Skip and Done retry refill only on completion, preserving deck and discard top order', () => {
  for (const finish of [skipPower, finishPowerPeek]) {
    for (const deckCount of [0, 1, 2, 3]) {
      for (const discardCount of [1, 2, 4]) {
        const state = drawnPower();
        // Build a small boundary fixture from distinct physical cards.
        const surplus = state.deck.cards.splice(0, state.deck.cards.length - deckCount);
        state.discardPile.cards.push(...surplus.splice(0, discardCount - 1));
        // Conservation here is relative to this fixture; surplus is deliberately outside play.
        const physical = new Set(allCards(state));
        const beforeDeck = [...state.deck.cards];
        const beforeDiscard = [...state.discardPile.cards];
        const held = state.players[0].drawnCard;
        let calls = 0;
        const random = () => { calls++; return 0; };
        startPowerResolution(state, 'p1');
        if (finish === finishPowerPeek) usePower(state, 'p1', usePayload);
        assert.deepEqual(state.deck.cards, beforeDeck);
        assert.deepEqual(state.discardPile.cards, beforeDiscard);
        finish(state, 'p1', random);
        const discards = [...beforeDiscard, held];
        if (deckCount <= 2 && discards.length >= 3) {
          const recycled = discards.slice(0, -2);
          // With random=0, Fisher-Yates rotates the first older discard to the end.
          assert.deepEqual(state.deck.cards, [...recycled.slice(1), recycled[0], ...beforeDeck]);
          assert.deepEqual(state.discardPile.cards, discards.slice(-2));
          assert.equal(calls, Math.max(0, recycled.length - 1));
        } else {
          assert.deepEqual(state.deck.cards, beforeDeck);
          assert.deepEqual(state.discardPile.cards, discards);
          assert.equal(calls, 0);
        }
        assert.equal(state.discardPile.topMatchStatus, 'eligible');
        assert.deepEqual(new Set(allCards(state)), physical);
        assert.equal(allCards(state).length, physical.size);
      }
    }
  }
});
