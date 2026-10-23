// Adapts join requests to synchronous rules and public lobby broadcasts.
import { joinPlayer } from '../game/lobby.js';
import { toLobbyView } from '../game/lobbyView.js';
import { logSocket } from './log.js';
import { PLAYER_ROOM } from './rooms.js';

/** Acknowledge before broadcasting membership to seated clients.
 * @param {import('./types.js').LobbyServer} io
 * @param {import('./types.js').LobbySocket} socket
 * @param {import('../game/types.js').GameState} gameState
 * @param {import('./types.js').LobbyBoundary} run
 */
export function registerJoinRoom(io, socket, gameState, run) {
  socket.on('joinRoom', (payload, ack) => run(socket, 'joinRoom', () => {
    const player = joinPlayer(gameState, { id: socket.id, displayName: payload?.displayName });
    socket.join(PLAYER_ROOM);
    logSocket('info', socket.id, 'joinRoom', 'accepted', {
      seatId: player.seatId, lobbySize: gameState.players.length,
    });
    if (typeof ack === 'function') ack({ playerId: player.id, seatId: player.seatId });
    io.to(PLAYER_ROOM).emit('playerJoined', toLobbyView(gameState));
    logSocket('info', socket.id, 'playerJoined', 'broadcast', { room: PLAYER_ROOM });
  }));
}
