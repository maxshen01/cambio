// Independent active-room fixture; setup transitions remain covered by setup integration tests.
import { createGameState } from '../../src/game/state.js';
import { createDeck } from '../../src/game/deck.js';
import { joinPlayer } from '../../src/game/lobby.js';
import { drawCard } from '../../src/game/turns/actions.js';
import assert from 'node:assert/strict';

export function activeGame(ids = ['p1', 'p2', 'p3', 'p4']) {
  const state = createGameState();
  const cards = createDeck();
  ids.forEach((id, index) => {
    joinPlayer(state, { id, displayName: `Player ${index + 1}` });
  });
  state.players.forEach(player => {
    player.hand = [1, 2, 3, 4].map(handSlotId => ({ handSlotId, card: cards.pop() }));
  });
  Object.assign(state, { phase: 'active', turn: ids[0], turnStep: 'awaitingDraw', deck: { cards } });
  return state;
}

export function allCards(state) {
  return [...state.deck.cards, ...state.discardPile.cards,
    ...state.players.flatMap(player => [...player.hand.map(slot => slot.card), ...(player.drawnCard ? [player.drawnCard] : [])])];
}

// Choose an existing physical card and acting seat without cloning or losing cards.
export function drawnPower(rank = 7, id = 'p1', suit) {
  const state = activeGame();
  state.turn = id;
  const index = state.deck.cards.findIndex(card => card.rank === rank && (!suit || card.suit === suit));
  assert.ok(index >= 0, `Fixture card missing: rank ${rank}, suit ${suit ?? 'any'}`);
  const [card] = state.deck.cards.splice(index, 1);
  state.discardPile.cards.push(state.deck.cards.pop());
  state.discardPile.topMatchStatus = 'matched';
  state.deck.cards.push(card);
  drawCard(state, id, { source: 'deck' });
  return state;
}

export function rejectsUnchanged(state, action, code) {
  const before = structuredClone(state);
  assert.throws(action, { name: 'DomainError', code });
  assert.deepEqual(state, before);
}
