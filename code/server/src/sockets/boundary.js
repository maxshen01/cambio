// Contains synchronous faults with phase-aware recovery, without stopping the listener.
import { DomainError } from '../game/domainError.js';
import { createGameState } from '../game/state.js';
import { logSocket, logUnexpectedSocketError } from './log.js';
import { isLiveGame } from '../game/recovery.js';
import { abortGame } from './abort.js';

/**
 * One boundary per shared room suppresses re-entrant disconnect cleanup during recovery.
 * @param {import('./types.js').GameServer} io
 * @param {import('../game/types.js').GameState} gameState
 * @returns {import('./types.js').GameBoundary}
 */
export function createGameBoundary(io, gameState) {
  let recovering = false;
  return (socket, event, action) => {
    if (recovering) return;
    const wasLive = isLiveGame(gameState);
    // A live departure and its abort form one cleanup operation.
    if (wasLive && event === 'disconnect') recovering = true;
    try {
      action();
    } catch (error) {
      if (error instanceof DomainError) {
        socket.emit('error', { code: error.code, message: error.message });
        logSocket('warn', socket.id, event, 'rejected', { code: error.code });
        return;
      }
      recovering = true;
      logUnexpectedSocketError(socket.id, event, error);
      if (wasLive) {
        // A failing departure must never retain its already disconnected seat.
        if (event === 'disconnect') {
          const player = gameState.players.find(player => player.id === socket.id);
          if (player) player.connected = false;
        }
        abortGame(io, gameState, { reason: 'SERVER_ERROR' });
        logSocket('warn', socket.id, event, 'gameAborted');
      } else {
        // Replace every authoritative field while retaining the injected object's identity.
        Object.assign(gameState, createGameState());
        io.disconnectSockets(true);
        logSocket('warn', socket.id, event, 'roomReset');
      }
    } finally {
      recovering = false;
    }
  };
}
