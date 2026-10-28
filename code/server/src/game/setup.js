// Readiness, dealing, and first-turn rules; socket handlers coordinate their order.
import { DomainError } from './domainError.js';
import { createDeck, shuffleDeck } from './deck.js';
import { resetSetup } from './state.js';
import { isUndealtLobby, isMemorization, isAllReady } from './selectors.js';
import { SEATS, playersInSeatOrder } from './seats.js';
/** @typedef {import('./types.js').GameState} GameState */

/** Mark a seated player ready once in either setup stage; active readiness is unavailable.
 * @param {GameState} state
 * @param {string} id */
export function readyPlayer(state, id) {
  const player = state.players.find(candidate => candidate.id === id);
  if (!player) {
    throw new DomainError('NOT_IN_ROOM', 'You are not in this room.');
  }
  if (!isUndealtLobby(state) && !isMemorization(state)) {
    throw new DomainError('READY_NOT_AVAILABLE', 'Ready is not available right now.');
  }
  if (player.isReady) return false;
  player.isReady = true;
  return true;
}

/** Clear one lobby ready mark unless all four players are already ready.
 * @param {GameState} state
 * @param {string} id */
export function unreadyPlayer(state, id) {
  const player = state.players.find(candidate => candidate.id === id);
  if (!player) {
    throw new DomainError('NOT_IN_ROOM', 'You are not in this room.');
  }
  if (!isUndealtLobby(state)
    || isAllReady(state)) {
    throw new DomainError('READY_NOT_AVAILABLE', 'Ready is not available right now.');
  }
  if (!player.isReady) return false;
  player.isReady = false;
  return true;
}

/** Deal once all four seats are connected and ready; ineligible rooms stay unchanged.
 * Call only after broadcasting the fourth lobby playerReady notice.
 * @param {GameState} state
 * @param {() => number} [random]
 * @returns {boolean}
 */
export function dealIfReady(state, random = Math.random) {
  if (!isUndealtLobby(state) || state.players.length !== 4
    || !state.players.every(player => player.connected && player.isReady)
    || !SEATS.every(seat => state.players.some(player => player.seatId === seat))) {
    return false;
  }

  const cards = shuffleDeck(createDeck(), random);
  const players = playersInSeatOrder(state.players);
  resetSetup(state, players);
  state.deck.cards = cards;
  /** @type {(1 | 2 | 3 | 4)[]} */
  const slots = [1, 2, 3, 4];
  for (const handSlotId of slots) {
    for (const player of players) {
      const card = cards.pop();
      if (!card) throw new Error('Opening deck exhausted');
      player.hand.push({ handSlotId, card });
    }
  }
  return true;
}

/** Choose the starter once; call after broadcasting the fourth playerReady notice.
 * @param {import('./types.js').GameState} state
 * @param {() => number} [random] Uniform sample in [0, 1).
 * @returns {boolean}
 */
export function startPlayIfReady(state, random = Math.random) {
  if (!isMemorization(state) || !state.players.every(player => player.connected && player.isReady)) return false;
  const players = playersInSeatOrder(state.players);
  const starter = players[Math.floor(random() * players.length)];
  state.phase = 'active';
  state.turn = starter.id;
  state.turnStep = 'awaitingDraw';
  return true;
}
