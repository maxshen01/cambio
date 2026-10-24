// Public lobby and setup protocol. Authoritative cards and game state stay on the server.
/**
 * @typedef {1 | 2 | 3 | 4} SeatId
 * @typedef {{ playerId: string, displayName: string, seatId: SeatId, connected: boolean, isReady: boolean }} PlayerSummary
 * @typedef {{ players: PlayerSummary[] }} LobbyView
 * @typedef {{ displayName: string }} JoinRequest
 * @typedef {{ playerId: string, seatId: SeatId }} JoinAck
 * @typedef {{ playerId: string }} ReadyNotice
 * @typedef {0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8} HandSlotId
 * @typedef {{ playerId: string, handSlotId: HandSlotId } & ({ faceUp: true, cardId: number } | { faceUp: false, cardId?: never })} CardView
 * @typedef {{ cards: CardView[] }} DealComplete
 * @typedef {'ALREADY_IN_ROOM' | 'INVALID_NAME' | 'GAME_ALREADY_STARTED' | 'ROOM_FULL' | 'NOT_IN_ROOM' | 'READY_NOT_AVAILABLE'} LobbyErrorCode
 * @typedef {{ code: LobbyErrorCode, message: string }} LobbyError
 * @typedef {Object} ClientEvents
 * @property {(payload: JoinRequest, ack?: (identity: JoinAck) => void) => void} joinRoom
 * @property {(payload: Record<string, never>) => void} ready
 * @property {(payload: Record<string, never>) => void} unready
 * @typedef {Object} ServerEvents
 * @property {(payload: LobbyView) => void} playerJoined
 * @property {(payload: LobbyView) => void} playerDisconnected
 * @property {(payload: ReadyNotice) => void} playerReady
 * @property {(payload: ReadyNotice) => void} playerUnready
 * @property {(payload: DealComplete) => void} dealComplete
 * @property {(payload: LobbyError) => void} error
 */
export {};
