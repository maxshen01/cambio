// Typed transport endpoints use the same public event shapes as the browser.
/**
 * @typedef {import('socket.io').Server<import('../../../shared/lobbyTypes.js').ClientEvents, import('../../../shared/lobbyTypes.js').ServerEvents>} LobbyServer
 * @typedef {import('socket.io').Socket<import('../../../shared/lobbyTypes.js').ClientEvents, import('../../../shared/lobbyTypes.js').ServerEvents>} LobbySocket
 * @typedef {(socket: LobbySocket, event: string, action: () => void) => void} LobbyBoundary
 */
export {};
