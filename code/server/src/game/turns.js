// Synchronous first-turn, private deck-draw, and ordinary resolution rules; powers are inactive.
import { isMemorization } from './lobby.js';
import { DomainError } from './domainError.js';
import { refillDeck } from './deck.js';
/** @typedef {import('./types.js').GameState} GameState */

/** Choose the starter once; call after broadcasting the fourth playerReady notice.
 * @param {import('./types.js').GameState} state
 * @param {() => number} [random] Uniform sample in [0, 1).
 * @returns {boolean}
 */
export function startPlayIfReady(state, random = Math.random) {
  if (!isMemorization(state) || !state.players.every(player => player.connected && player.isReady)) return false;
  const players = [...state.players].sort((a, b) => a.seatId - b.seatId);
  const starter = players[Math.floor(random() * players.length)];
  state.phase = 'active';
  state.turn = starter.id;
  state.turnStep = 'awaitingDraw';
  return true;
}

/** Validate membership and turn ownership before changing any round fields.
 * @param {GameState} state @param {string} id
 */
function requireTurnPlayer(state, id) {
  const player = state.players.find(player => player.id === id);
  if (!player) throw new DomainError('NOT_IN_ROOM', 'You are not in this room.');
  if (state.turn !== id) throw new DomainError('NOT_YOUR_TURN', 'It is not your turn.');
  if (state.pendingMatch) throw new DomainError('MATCH_RESOLVING', 'Wait for the match to finish.');
  return player;
}

/** Draw exactly once; discard-source draws are deferred to the next implementation step.
 * @param {GameState} state @param {string} id @param {unknown} payload
 * @param {() => number} [random]
 */
export function drawCard(state, id, payload, random = Math.random) {
  const player = requireTurnPlayer(state, id);
  if (!payload || typeof payload !== 'object' || !('source' in payload) || payload.source !== 'deck') {
    throw new DomainError('INVALID_DRAW_SOURCE', 'Choose the deck to draw a card.');
  }
  if (state.phase !== 'active' || state.turnStep !== 'awaitingDraw' || state.pendingPower
    || state.players.some(player => player.drawnCard)) {
    throw new DomainError('DRAW_NOT_AVAILABLE', 'Drawing is not available right now.');
  }
  const card = state.deck.cards.at(-1);
  if (!card) throw new DomainError('DECK_EMPTY', 'The deck is empty.');
  state.deck.cards.pop();
  Object.assign(player, { drawnCard: card, drawnFrom: 'deck', drawnCardRevealed: false });
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

/** Clear the pending card and start exactly one next turn in stable clockwise seat order.
 * @param {GameState} state @param {import('./types.js').Player} player
 * @param {import('./types.js').Card} discarded @param {() => number} random
 */
function finishTurn(state, player, discarded, random) {
  state.discardPile.cards.push(discarded);
  state.discardPile.topMatchStatus = 'eligible';
  Object.assign(player, { drawnCard: null, drawnFrom: null, drawnCardRevealed: false });
  state.pendingPower = null;
  state.pendingPowerStage = null;
  refillDeck(state, random);
  const players = [...state.players].sort((a, b) => a.seatId - b.seatId);
  state.turn = players[(players.findIndex(candidate => candidate.id === player.id) + 1) % players.length].id;
  state.turnStep = 'awaitingDraw';
}

/** Discard a deck-drawn card and complete the turn, including cards whose powers are inactive.
 * @param {GameState} state @param {string} id @param {() => number} [random]
 */
export function discardDrawnCard(state, id, random = Math.random) {
  const player = requireResolutionPlayer(state, id);
  finishTurn(state, player, /** @type {import('./types.js').Card} */ (player.drawnCard), random);
}

/** Replace an occupied own-hand slot facedown, then discard its displaced card.
 * @param {GameState} state @param {string} id @param {unknown} payload
 * @param {() => number} [random]
 * @returns {import('../../../shared/lobbyTypes.js').DrawnSwapNotice}
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
  return { kind: 'drawn', target: { playerId: id, handSlotId: slot.handSlotId } };
}
