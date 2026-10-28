// Typed transport endpoints use the same public event shapes as the browser.
/**
 * @typedef {import('socket.io').Server<import('../../../shared/protocol.js').ClientEvents, import('../../../shared/protocol.js').ServerEvents>} GameServer
 * @typedef {import('socket.io').Socket<import('../../../shared/protocol.js').ClientEvents, import('../../../shared/protocol.js').ServerEvents>} GameSocket
 * @typedef {(socket: GameSocket, event: string, action: () => void) => void} GameBoundary
 */
export {};
