// Deck/discard draws and resolution, including entry into 7–10 peeks.
import { requireTurnPlayer, finishTurn } from './turnLifecycle.js';
import { startPowerResolution } from './powers.js';
import { DomainError } from './domainError.js';
import { refillDeck } from './deck.js';
/** @typedef {import('./types.js').GameState} GameState */

/** Draw exactly once from the chosen pile, retaining ownership outside the hand.
 * @param {GameState} state @param {string} id @param {unknown} payload
 * @param {() => number} [random]
 */
export function drawCard(state, id, payload, random = Math.random) {
  const player = requireTurnPlayer(state, id);
  if (!payload || typeof payload !== 'object' || !('source' in payload)
    || (payload.source !== 'deck' && payload.source !== 'discard')) {
    throw new DomainError('INVALID_DRAW_SOURCE', 'Choose the deck or discard pile to draw a card.');
  }
  if (state.phase !== 'active' || state.turnStep !== 'awaitingDraw' || state.pendingPower
    || state.players.some(player => player.drawnCard)) {
    throw new DomainError('DRAW_NOT_AVAILABLE', 'Drawing is not available right now.');
  }
  const source = payload.source;
  const pile = source === 'deck' ? state.deck.cards : state.discardPile.cards;
  const card = pile.at(-1);
  if (!card) throw new DomainError(source === 'deck' ? 'DECK_EMPTY' : 'DISCARD_EMPTY',
    source === 'deck' ? 'The deck is empty.' : 'The discard pile is empty.');
  pile.pop();
  if (source === 'discard') state.discardPile.topMatchStatus = pile.length ? 'exposed' : null;
  Object.assign(player, { drawnCard: card, drawnFrom: source, drawnCardRevealed: false });
  state.turnStep = 'awaitingDrawnCardResolution';
  refillDeck(state, random);
  return player;
}

/** Validate a resolution while leaving rejected requests completely unchanged.
 * @param {GameState} state @param {string} id
 */
function requireResolutionPlayer(state, id) {
  const player = requireTurnPlayer(state, id);
  if (state.phase !== 'active' || state.turnStep !== 'awaitingDrawnCardResolution' || state.pendingPower) {
    throw new DomainError('RESOLUTION_NOT_AVAILABLE', 'Card resolution is not available right now.');
  }
  if (!player.drawnCard) throw new DomainError('NO_DRAWN_CARD', 'You have no drawn card.');
  return player;
}

/** Start a peek for a deck-drawn 7–10; other cards complete the ordinary discard.
 * @param {GameState} state @param {string} id @param {() => number} [random]
 * @returns {{ kind: 'powerStarted', playerId: string, power: 'selfPeek' | 'opponentPeek' | 'blindSwap' } | { kind: 'completed' }}
 */
export function discardDrawnCard(state, id, random = Math.random) {
  const player = requireResolutionPlayer(state, id);
  if (player.drawnFrom === 'discard') {
    throw new DomainError('MUST_SWAP_DISCARD_DRAW', 'Replace one of your hand cards with the discard draw.');
  }
  if (player.drawnCard?.power === 'selfPeek' || player.drawnCard?.power === 'opponentPeek' || player.drawnCard?.power === 'blindSwap') {
    startPowerResolution(state, id);
    return { kind: 'powerStarted', playerId: id, power: player.drawnCard.power };
  }
  finishTurn(state, player, /** @type {import('./types.js').Card} */ (player.drawnCard), random);
  return { kind: 'completed' };
}

/** Replace an occupied own-hand slot facedown, then discard its displaced card.
 * @param {GameState} state @param {string} id @param {unknown} payload
 * @param {() => number} [random]
 * @returns {import('./types.js').HandSlot['handSlotId']}
 */
export function swapDrawnCard(state, id, payload, random = Math.random) {
  const player = requireResolutionPlayer(state, id);
  const target = payload && typeof payload === 'object' && 'target' in payload ? payload.target : null;
  if (!target || typeof target !== 'object' || !('playerId' in target) || target.playerId !== id
    || !('handSlotId' in target)) throw new DomainError('INVALID_TARGET', 'Choose one of your occupied hand slots.');
  const slot = player.hand.find(slot => slot.handSlotId === target.handSlotId);
  if (!slot) throw new DomainError('INVALID_TARGET', 'Choose one of your occupied hand slots.');
  const displaced = slot.card;
  slot.card = /** @type {import('./types.js').Card} */ (player.drawnCard);
  finishTurn(state, player, displaced, random);
  return slot.handSlotId;
}
