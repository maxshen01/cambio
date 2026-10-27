// Creates the browser's Socket.IO connection through the current origin.
import { io } from 'socket.io-client';

/** Configure a WebSocket connection that the game client starts on mount.
 * @returns {import('../game/sessionControl.js').GameSocket}
 */
export function createClientSocket() {
  return io({
    autoConnect: false,
    reconnection: false,
    transports: ['websocket'],
  });
}
