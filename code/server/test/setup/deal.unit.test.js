// Checks setup eligibility, complete resets, and deterministic seat-order dealing.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../../src/game/state.js';
import { joinPlayer } from '../../src/game/lobby.js';
import { createDeck } from '../../src/game/deck.js';
import { dealIfReady, toDealView } from '../../src/game/deal.js';

function readyRoom() {
  const state = createGameState();
  for (let seat = 1; seat <= 4; seat++) {
    joinPlayer(state, { id: String(seat), displayName: `Player ${seat}` }).isReady = true;
  }
  return state;
}

test('a new deal clears every stale setup field and deals from the top in four seat-order passes', () => {
  const state = readyRoom();
  const players = [...state.players];
  state.players.reverse();
  for (const player of players) {
    Object.assign(player, { drawnCard: createDeck()[0], drawnFrom: 'discard', drawnCardRevealed: true, score: -2, calledCambio: true });
  }
  Object.assign(state, {
    deck: { cards: createDeck() },
    discardPile: { cards: createDeck().slice(0, 2), topMatchStatus: 'matched' },
    turn: '1', turnStep: 'resolvingPower', pendingPower: 'selfPeek',
    pendingPowerStage: 'awaitingPeekDone',
    pendingMatch: { matcherPlayerId: '1', recipientPlayerId: '2', stage: 'awaitingGift' },
    cambioCalledBy: '1', finalMatchGraceDeadline: 1234, winners: ['1'],
  });
  assert.equal(dealIfReady(state, () => 1 - Number.EPSILON), true);
  assert.deepEqual(state.players, players);
  const ordered = createDeck();
  for (const [seat, player] of players.entries()) {
    assert.deepEqual(player.hand.map(slot => slot.handSlotId), [1, 2, 3, 4]);
    assert.deepEqual(player.hand.map(slot => slot.card), [0, 1, 2, 3].map(pass => ordered[107 - pass * 4 - seat]));
    assert.deepEqual({ ...player, hand: [] }, {
      id: String(seat + 1), displayName: `Player ${seat + 1}`, seatId: seat + 1,
      hand: [], drawnCard: null, drawnFrom: null, drawnCardRevealed: false,
      score: 0, calledCambio: false, connected: true, isReady: false,
    });
  }
  assert.deepEqual({ ...state, players: [] }, { ...createGameState(), deck: { cards: ordered.slice(0, 92) } });
  const allCards = [...state.deck.cards, ...players.flatMap(player => player.hand.map(slot => slot.card))];
  assert.equal(new Set(allCards).size, 108);
  const before = structuredClone(state);
  assert.equal(dealIfReady(state), false);
  assert.deepEqual(state, before);
});

test('dealing requires exactly four connected, uniquely seated, ready players in an undealt lobby', () => {
  for (const change of [
    state => state.players.pop(),
    state => state.players.push({ ...state.players[0], id: '5' }),
    state => { state.players[0].isReady = false; },
    state => { state.players[0].connected = false; },
    state => { state.players[0].seatId = 2; },
    state => { state.players[0].seatId = 5; },
    state => { state.phase = 'active'; },
    state => { state.players[0].hand = [{ handSlotId: 1, card: createDeck()[0] }]; },
  ]) {
    const state = readyRoom();
    change(state);
    const before = structuredClone(state);
    assert.equal(dealIfReady(state, () => assert.fail('Ineligible rooms must not shuffle')), false);
    assert.deepEqual(state, before);
  }
});

test('recipient views expose only their bottom two faces and are independent of state and each other', () => {
  const state = readyRoom();
  dealIfReady(state, () => 0);
  const before = structuredClone(state);
  const first = toDealView(state, '1');
  const second = toDealView(state, '2');
  assert.equal(first.cards.length, 16);
  assert.equal(second.cards.length, 16);
  for (const [recipient, view] of [['1', first], ['2', second], ['outsider', toDealView(state, 'outsider')]]) {
    assert.deepEqual(view.cards, state.players.flatMap(player => player.hand.map(slot => {
      const ref = { playerId: player.id, handSlotId: slot.handSlotId };
      return player.id === recipient && [2, 4].includes(slot.handSlotId)
        ? { ...ref, faceUp: true, cardId: slot.card.cardId }
        : { ...ref, faceUp: false };
    })));
  }
  first.cards[0].faceUp = true;
  first.cards[0].cardId = 99;
  assert.equal(second.cards[0].faceUp, false);
  assert.deepEqual(state, before);
});
