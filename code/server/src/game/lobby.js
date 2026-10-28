// Membership, seat allocation, and departures during lobby and memorization setup.
import { checkDisplayName, sameDisplayName } from '../../../shared/displayName.js';
import { DomainError } from './domainError.js';
import { resetSetup } from './state.js';
import { createPlayer } from './player.js';
import { isUndealtLobby, isMemorization } from './selectors.js';
import { findAvailableSeat, playersInSeatOrder } from './seats.js';
/** @typedef {import('./types.js').GameState} GameState */

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

  const seatId = findAvailableSeat(state.players);
  if (seatId === undefined) {
    throw new DomainError('ROOM_FULL', 'This room is full.');
  }

  const player = createPlayer({ id, displayName: name, seatId });
  state.players.push(player);
  state.players = playersInSeatOrder(state.players);
  return player;
}

/** Free a setup seat; an existing opening deal is discarded and survivors become unready.
 * @param {GameState} state
 * @param {string} id */
export function removeLobbyPlayer(state, id) {
  const memorizing = isMemorization(state);
  if (!isUndealtLobby(state) && !memorizing) {
    return false;
  }

  const index = state.players.findIndex(player => player.id === id);
  if (index === -1) return false;
  state.players.splice(index, 1);
  if (memorizing) resetSetup(state, state.players);
  return true;
}
