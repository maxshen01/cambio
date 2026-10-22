// Handles undealt-lobby readiness changes for seated players.
import { ReadyError, readyPlayer, unreadyPlayer } from '../game/state.js';
import { PLAYER_ROOM } from './joinRoom.js';
import { logSocket, logUnexpectedSocketError } from './log.js';

/** Register the ready action; the protocol sends no acknowledgement. */
export function registerReady(io, socket, gameState) {
  socket.on('ready', () => {
    try {
      if (!readyPlayer(gameState, socket.id)) {
        logSocket('info', socket.id, 'ready', 'duplicate');
        return;
      }
      io.to(PLAYER_ROOM).emit('playerReady', { playerId: socket.id });
      logSocket('info', socket.id, 'ready', 'accepted', {
        readyCount: gameState.players.filter(player => player.isReady).length,
      });
    } catch (error) {
      if (!(error instanceof ReadyError)) {
        logUnexpectedSocketError(socket.id, 'ready', error);
        throw error;
      }
      socket.emit('error', { code: error.code, message: error.message });
      logSocket('warn', socket.id, 'ready', 'rejected', { code: error.code });
    }
  });

  socket.on('unready', () => {
    try {
      if (!unreadyPlayer(gameState, socket.id)) {
        logSocket('info', socket.id, 'unready', 'duplicate');
        return;
      }
      io.to(PLAYER_ROOM).emit('playerUnready', { playerId: socket.id });
      logSocket('info', socket.id, 'unready', 'accepted', {
        readyCount: gameState.players.filter(player => player.isReady).length,
      });
    } catch (error) {
      if (!(error instanceof ReadyError)) {
        logUnexpectedSocketError(socket.id, 'unready', error);
        throw error;
      }
      socket.emit('error', { code: error.code, message: error.message });
      logSocket('warn', socket.id, 'unready', 'rejected', { code: error.code });
    }
  });
}
