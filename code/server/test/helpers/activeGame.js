// Independent active-room fixture; setup transitions remain covered by setup integration tests.
import { createGameState } from '../../src/game/state.js';
import { createDeck } from '../../src/game/deck.js';
import { joinPlayer } from '../../src/game/lobby.js';

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
