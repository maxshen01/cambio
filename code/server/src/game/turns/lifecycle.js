// Shared ownership checks and completion for ordinary turns and powers.
import { clearDrawnCard } from '../player.js';
import { nextPlayerInSeatOrder } from '../seats.js';
import { DomainError } from '../domainError.js';
import { refillDeck } from '../deck.js';
/** @typedef {import('../types.js').GameState} GameState */

/** Validate membership, turn ownership, and settlement before changing round fields.
 * @param {GameState} state @param {string} id
 */
export function requireTurnPlayer(state, id) {
  const player = state.players.find(player => player.id === id);
  if (!player) throw new DomainError('NOT_IN_ROOM', 'You are not in this room.');
  if (state.turn !== id) throw new DomainError('NOT_YOUR_TURN', 'It is not your turn.');
  if (state.pendingMatch) throw new DomainError('MATCH_RESOLVING', 'Wait for the match to finish.');
  return player;
}

/** Complete a validated resolution, retry refill, and advance once by stable seat order.
 * @param {GameState} state @param {import('../types.js').Player} player
 * @param {import('../types.js').Card} discarded @param {() => number} random
 */
export function finishTurn(state, player, discarded, random) {
  state.discardPile.cards.push(discarded);
  state.discardPile.topMatchStatus = 'eligible';
  clearDrawnCard(player);
  state.pendingPower = null;
  refillDeck(state, random);
  state.turn = nextPlayerInSeatOrder(state.players, player.id).id;
  state.turnStep = 'awaitingDraw';
}
