// Defines server game state and undealt-lobby player membership rules.

/**
 * @typedef {Object} Player
 * @property {string} id
 * @property {string} displayName
 * @property {number} seatId
 * @property {object[]} hand
 * @property {object | null} drawnCard
 * @property {string | null} drawnFrom
 * @property {boolean} drawnCardRevealed
 * @property {number} score
 * @property {boolean} calledCambio
 * @property {boolean} connected
 * @property {boolean} isReady
 */

/**
 * @typedef {Object} GameState
 * @property {Player[]} players
 * @property {string} phase
 * @property {{ cards: object[] }} deck
 * @property {{ cards: object[], topMatchStatus: string | null }} discardPile
 */

export class JoinRoomError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** Create an empty, undealt room. Other game fields start without a pending turn or action. */
export function createGameState() {
  return {
    players: [],
    deck: { cards: [] },
    discardPile: { cards: [], topMatchStatus: null },
    turn: null,
    turnStep: null,
    pendingPower: null,
    pendingPowerStage: null,
    pendingMatch: null,
    phase: 'deal',
    cambioCalledBy: null,
    finalMatchGraceDeadline: null,
    winners: [],
  };
}

/** Validate a join, then add its server-side Player in stable seat order. */
export function joinPlayer(state, { id, displayName } = {}) {
  const socketAlreadyHasSeat = state.players.some(player => player.id === id);
  if (socketAlreadyHasSeat) {
    throw new JoinRoomError('ALREADY_IN_ROOM', 'You are already in this room.');
  }

  if (typeof displayName !== 'string' || !displayName.trim()) {
    throw new JoinRoomError('INVALID_NAME', 'Enter a nonblank display name.');
  }

  const cardsHaveBeenDealt = state.players.some(player => player.hand.length > 0);
  if (state.phase !== 'deal' || cardsHaveBeenDealt) {
    throw new JoinRoomError('GAME_ALREADY_STARTED', 'The game has already started.');
  }

  const occupiedSeats = new Set(state.players.map(player => player.seatId));
  const seatId = [1, 2, 3, 4].find(seat => !occupiedSeats.has(seat));
  if (seatId === undefined) {
    throw new JoinRoomError('ROOM_FULL', 'This room is full.');
  }

  const player = {
    id,
    displayName: displayName.trim(),
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

/** Free a seated player's lobby seat only before any cards have been dealt. */
export function removeLobbyPlayer(state, id) {
  if (state.phase !== 'deal' || state.players.some(player => player.hand.length > 0)) {
    return false;
  }

  const index = state.players.findIndex(player => player.id === id);
  if (index === -1) return false;
  state.players.splice(index, 1);
  return true;
}
