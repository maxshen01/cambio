// Creates the browser's Socket.IO connection through the current origin.
import { io } from 'socket.io-client';

/** Configure a WebSocket connection that the lobby hook starts on mount.
 * @returns {import('../lobby/useLobby.js').LobbySocket}
 */
export function createClientSocket() {
  return io({
    autoConnect: false,
    reconnection: false,
    transports: ['websocket'],
  });
}
