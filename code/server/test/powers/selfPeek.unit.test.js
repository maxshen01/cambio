// Exercises self/opponent-peek domain stages independently of socket notifications.
import assert from 'node:assert/strict';
import test from 'node:test';
import { startPowerResolution, usePower, choosePowerTargets, skipPower, finishPowerPeek } from '../../src/game/turns/powers.js';
import { drawCard, discardDrawnCard, swapDrawnCard } from '../../src/game/turns/actions.js';
import { drawnPower, rejectsUnchanged, allCards } from '../helpers/activeGame.js';

const target = { playerId: 'p1', handSlotId: 2 };
const usePayload = { peekTarget: target };

function pendingPower(stage = 'awaitingTargets') {
  const state = drawnPower();
  startPowerResolution(state, 'p1');
  if (stage !== 'awaitingChoice') usePower(state, 'p1');
  if (stage === 'awaitingPeekDone') choosePowerTargets(state, 'p1', usePayload);
  return state;
}

for (const rank of [7, 9]) {
  const power = rank < 9 ? 'selfPeek' : 'opponentPeek';
  const target = { playerId: rank < 9 ? 'p1' : 'p2', handSlotId: 2 };
  const usePayload = { peekTarget: target };
  test(`${rank}: start and use retain the held card, hands, piles, and current turn`, () => {
    const state = drawnPower(rank);
    const before = structuredClone(state);
    const player = state.players[0];
    const held = player.drawnCard;
    const peeked = state.players.find(player => player.id === target.playerId).hand[1].card;
    startPowerResolution(state, 'p1');
    assert.deepEqual(state, {
      ...before, turnStep: 'resolvingPower', pendingPower: power, pendingPowerStage: 'awaitingChoice',
    });
    rejectsUnchanged(state, () => choosePowerTargets(state, 'p1', usePayload), 'POWER_NOT_AVAILABLE');
    const beforeActivation = structuredClone(state);
    usePower(state, 'p1');
    beforeActivation.pendingPowerStage = 'awaitingTargets';
    beforeActivation.players[0].drawnCardRevealed = true;
    assert.deepEqual(state, beforeActivation);
    rejectsUnchanged(state, () => usePower(state, 'p1'), 'POWER_NOT_AVAILABLE');
    const started = structuredClone(state);
    const result = choosePowerTargets(state, 'p1', usePayload);
    started.pendingPowerStage = 'awaitingPeekDone';
    started.players[0].drawnCardRevealed = true;
    assert.deepEqual(state, started);
    assert.equal(player.drawnCard, held);
    assert.deepEqual(result, { kind: 'peek', targets: [{ target, card: peeked }] });
    assert.equal(result.targets[0].card, peeked);
    assert.equal(allCards(state).length, 108);
    // No timer or subsequent action is required to keep the peek pending.
    rejectsUnchanged(state, () => skipPower(state, 'p1'), 'POWER_NOT_AVAILABLE');
    rejectsUnchanged(state, () => choosePowerTargets(state, 'p1', usePayload), 'POWER_NOT_AVAILABLE');
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
        if (finish === finishPowerPeek) {
          usePower(state, id);
          choosePowerTargets(state, id, { peekTarget: { playerId: rank < 9 ? id : (id === 'p1' ? 'p2' : 'p1'), handSlotId: 1 } });
        }
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
  for (const [action, fixture] of [
    [startPowerResolution, drawnPower],
    [usePower, () => pendingPower('awaitingChoice')],
    [choosePowerTargets, pendingPower],
    [skipPower, () => pendingPower('awaitingChoice')],
    [finishPowerPeek, () => pendingPower('awaitingPeekDone')],
  ]) {
    const state = fixture();
    rejectsUnchanged(state, () => action(state, 'outsider'), 'NOT_IN_ROOM');
    rejectsUnchanged(state, () => action(state, 'p2'), 'NOT_YOUR_TURN');
    state.pendingMatch = { matcherPlayerId: 'p2', recipientPlayerId: 'p3', stage: 'awaitingGift' };
    rejectsUnchanged(state, () => action(state, 'p1'), 'MATCH_RESOLVING');
  }
});

test('unavailable phases, sources, powers, held cards, and stages leave state unchanged', () => {
  const actions = [
    [startPowerResolution, drawnPower],
    [usePower, () => pendingPower('awaitingChoice')],
    [choosePowerTargets, pendingPower],
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
      state => { state.players[0].drawnCard = { ...state.players[0].drawnCard, power: null }; },
      state => { state.turnStep = 'awaitingDraw'; },
    ]) {
      const state = fixture();
      change(state);
      rejectsUnchanged(state, () => action(state, 'p1', usePayload), 'POWER_NOT_AVAILABLE');
    }
  }
  const ordinary = drawnPower(1);
  rejectsUnchanged(ordinary, () => startPowerResolution(ordinary, 'p1'), 'POWER_NOT_AVAILABLE');
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
    rejectsUnchanged(state, () => choosePowerTargets(state, 'p1', usePayload), 'POWER_NOT_AVAILABLE');
    rejectsUnchanged(state, () => skipPower(state, 'p1'), 'POWER_NOT_AVAILABLE');
  }
  const state = pendingPower();
  rejectsUnchanged(state, () => finishPowerPeek(state, 'p1'), 'POWER_NOT_AVAILABLE');
  rejectsUnchanged(state, () => startPowerResolution(state, 'p1'), 'POWER_NOT_AVAILABLE');
  for (const power of [null, 'opponentPeek', 'blindSwap', 'onePeekSwap', 'twoPeekSwap']) {
    state.pendingPower = power;
    for (const action of [choosePowerTargets, skipPower, finishPowerPeek]) {
      rejectsUnchanged(state, () => action(state, 'p1', usePayload), 'POWER_NOT_AVAILABLE');
    }
  }
});

test('Use distinguishes malformed actions from invalid own-hand targets after activation', () => {
  const state = pendingPower();
  for (const payload of [undefined, null, [], 'peek', {}, { target }, { peekTarget: null }, { peekTarget: [] }, { peekTarget: 2 }]) {
    rejectsUnchanged(state, () => choosePowerTargets(state, 'p1', payload), 'INVALID_POWER_ACTION');
  }
  for (const peekTarget of [{}, { playerId: 'p1' }, { handSlotId: 2 },
    { playerId: 'p2', handSlotId: 2 }, { playerId: 'outsider', handSlotId: 2 },
    ...[0, 5, 9, 1.5, '2', null].map(handSlotId => ({ playerId: 'p1', handSlotId }))]) {
    rejectsUnchanged(state, () => choosePowerTargets(state, 'p1', { peekTarget }), 'INVALID_POWER_TARGET');
  }
  const slot = state.players[0].hand.pop();
  rejectsUnchanged(state, () => choosePowerTargets(state, 'p1', { peekTarget: { playerId: 'p1', handSlotId: slot.handSlotId } }), 'INVALID_POWER_TARGET');
  const result = choosePowerTargets(state, 'p1', { peekTarget: target, cardId: 999, power: 'blindSwap' });
  assert.equal(result.targets[0].card, state.players[0].hand[1].card);
});

test('ordinary actions cannot draw, discard, or replace during any power stage', () => {
  for (const stage of ['awaitingChoice', 'awaitingTargets', 'awaitingPeekDone']) {
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
  const result = choosePowerTargets(state, 'p1', { peekTarget: { playerId: 'p1', handSlotId: 8 } });
  assert.deepEqual(result.targets[0].target, { playerId: 'p1', handSlotId: 8 });
  assert.equal(result.targets[0].card, expected);
});

for (const finish of [skipPower, finishPowerPeek]) {
  test(`${finish.name}: refill waits for completion and preserves physical cards`, () => {
    const state = drawnPower();
    const surplus = state.deck.cards.splice(0, state.deck.cards.length - 2);
    state.discardPile.cards.push(...surplus.slice(0, 3));
    const deck = [...state.deck.cards];
    const discards = [...state.discardPile.cards];
    const physical = new Set(allCards(state));
    const held = state.players[0].drawnCard;
    startPowerResolution(state, 'p1');
    if (finish === finishPowerPeek) {
      usePower(state, 'p1');
      choosePowerTargets(state, 'p1', usePayload);
    }
    assert.deepEqual(state.deck.cards, deck);
    assert.deepEqual(state.discardPile.cards, discards);
    finish(state, 'p1', () => 0);
    assert.deepEqual(state.deck.cards.slice(-2), deck);
    assert.deepEqual(state.discardPile.cards, [discards.at(-1), held]);
    assert.equal(state.discardPile.topMatchStatus, 'eligible');
    assert.deepEqual(new Set(allCards(state)), physical);
    assert.equal(allCards(state).length, physical.size);
  });
}

test('opponent peek accepts each opponent by stable occupied slot and rejects own cards', () => {
  for (const opponent of ['p2', 'p3', 'p4']) {
    const state = drawnPower(9);
    discardDrawnCard(state, 'p1');
    usePower(state, 'p1');
    rejectsUnchanged(state, () => choosePowerTargets(state, 'p1', usePayload), 'INVALID_POWER_TARGET');
    const hand = state.players.find(player => player.id === opponent).hand;
    hand[0].handSlotId = 8;
    hand.reverse();
    rejectsUnchanged(state, () => choosePowerTargets(state, 'p1', { peekTarget: { playerId: opponent, handSlotId: 1 } }), 'INVALID_POWER_TARGET');
    const target = { playerId: opponent, handSlotId: 8 };
    assert.equal(choosePowerTargets(state, 'p1', { peekTarget: target }).targets[0].card, hand.find(slot => slot.handSlotId === 8).card);
  }
});
