// Synchronous membership and readiness rules for the undealt lobby.
import { checkDisplayName, sameDisplayName } from '../../../shared/displayName.js';
import { DomainError } from './domainError.js';
/** @typedef {import('./types.js').GameState} GameState */
/** @type {import('../../../shared/lobbyTypes.js').SeatId[]} */
const SEATS = [1, 2, 3, 4];

/** Whether joining and lobby readiness are still available. @param {GameState} state */
export function isUndealtLobby(state) {
  return state.phase === 'deal' && state.players.every(player => player.hand.length === 0);
}

/** The temporary four-ready lock, until dealing is implemented. @param {GameState} state */
export function isAllReady(state) {
  return state.players.filter(player => player.isReady).length === 4;
}

/** Validate a join, then add its server-side Player in stable seat order.
 * @param {GameState} state
 * @param {{ id: string, displayName: unknown }} request */
export function joinPlayer(state, { id, displayName }) {
  const socketAlreadyHasSeat = state.players.some(player => player.id === id);
  if (socketAlreadyHasSeat) {
    throw new DomainError('ALREADY_IN_ROOM', 'You are already in this room.');
  }

  const { name, error } = checkDisplayName(displayName);
  if (name === null) {
    throw new DomainError('INVALID_NAME', error);
  }
  if (state.players.some(player => sameDisplayName(player.displayName, name))) {
    throw new DomainError('INVALID_NAME', 'That name is already taken.');
  }

  if (!isUndealtLobby(state)) {
    throw new DomainError('GAME_ALREADY_STARTED', 'The game has already started.');
  }

  const occupiedSeats = new Set(state.players.map(player => player.seatId));
  const seatId = SEATS.find(seat => !occupiedSeats.has(seat));
  if (seatId === undefined) {
    throw new DomainError('ROOM_FULL', 'This room is full.');
  }

  /** @type {import("./types.js").Player} */
  const player = {
    id,
    displayName: name,
    seatId,
    hand: [],
    drawnCard: null,
    drawnFrom: null,
    drawnCardRevealed: false,
    score: 0,
    calledCambio: false,
    connected: true,
    isReady: false,
  };
  state.players.push(player);
  state.players.sort((a, b) => a.seatId - b.seatId);
  return player;
}

/** Free a seated player's lobby seat only before any cards have been dealt.
 * @param {GameState} state
 * @param {string} id */
export function removeLobbyPlayer(state, id) {
  if (!isUndealtLobby(state)) {
    return false;
  }

  const index = state.players.findIndex(player => player.id === id);
  if (index === -1) return false;
  state.players.splice(index, 1);
  return true;
}

/** Mark a seated player ready once in the undealt lobby. Memorization readiness is deferred.
 * @param {GameState} state
 * @param {string} id */
export function readyPlayer(state, id) {
  const player = state.players.find(candidate => candidate.id === id);
  if (!player) {
    throw new DomainError('NOT_IN_ROOM', 'You are not in this room.');
  }
  if (!isUndealtLobby(state)) {
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
