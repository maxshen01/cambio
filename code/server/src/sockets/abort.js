// Shared abort notification path for live departures and unexpected handler faults.
import { resetAbortedGame } from '../game/recovery.js';
import { toLobbyView } from '../game/views/lobbyView.js';
import { PLAYER_ROOM } from './rooms.js';

/** Reset before publishing the public lobby; no hidden game state leaves this boundary.
 * @param {import('./types.js').GameServer} io
 * @param {import('../game/types.js').GameState} state
 * @param {{ reason: 'PLAYER_DISCONNECTED', playerId: string } | { reason: 'SERVER_ERROR' }} cause
 */
export function abortGame(io, state, cause) {
  resetAbortedGame(state);
  io.to(PLAYER_ROOM).emit('gameAborted', { ...cause, lobby: toLobbyView(state) });
}
