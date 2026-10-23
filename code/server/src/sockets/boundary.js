// Contains synchronous lobby faults and resets this room without stopping the listener.
import { DomainError } from '../game/domainError.js';
import { createGameState } from '../game/state.js';
import { logSocket, logUnexpectedSocketError } from './log.js';

/**
 * One boundary per shared room suppresses re-entrant disconnect cleanup during recovery.
 * @param {import('./types.js').LobbyServer} io
 * @param {import('../game/types.js').GameState} gameState
 * @returns {import('./types.js').LobbyBoundary}
 */
export function createLobbyBoundary(io, gameState) {
  let recovering = false;
  return (socket, event, action) => {
    if (recovering) return;
    try {
      action();
    } catch (error) {
      if (error instanceof DomainError) {
        socket.emit('error', { code: error.code, message: error.message });
        logSocket('warn', socket.id, event, 'rejected', { code: error.code });
        return;
      }
      recovering = true;
      try {
        logUnexpectedSocketError(socket.id, event, error);
        // Replace every authoritative field while retaining the injected object's identity.
        Object.assign(gameState, createGameState());
        io.disconnectSockets(true);
        logSocket('warn', socket.id, event, 'roomReset');
      } finally {
        recovering = false;
      }
    }
  };
}
