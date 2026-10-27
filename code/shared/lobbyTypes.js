// Public setup/ordinary-turn protocol and card views; drawn cards have no hand-slot position.
/**
 * @typedef {1 | 2 | 3 | 4} SeatId
 * @typedef {{ playerId: string, displayName: string, seatId: SeatId, connected: boolean, isReady: boolean }} PlayerSummary
 * @typedef {{ players: PlayerSummary[] }} LobbyView
 * @typedef {{ displayName: string }} JoinRequest
 * @typedef {{ playerId: string, seatId: SeatId }} JoinAck
 * @typedef {{ playerId: string }} ReadyNotice
 * @typedef {{ playerId: string }} TurnChanged
 * @typedef {{ source: 'deck' | 'discard' }} DrawRequest
 * @typedef {{ playerId: string, handSlotId: HandSlotId }} HandSlotRef
 * @typedef {{ target: HandSlotRef }} DrawnSwapRequest
 * @typedef {{ kind: 'drawn', target: HandSlotRef }} DrawnSwapNotice
 * @typedef {{ cardId: number }} DiscardView
 * @typedef {{ top: DiscardView | null }} DiscardPileUpdated
 * @typedef {1 | 2 | 3 | 4 | 5 | 6 | 7 | 8} HandSlotId
 * @typedef {{ playerId: string, handSlotId: HandSlotId } & ({ faceUp: true, cardId: number } | { faceUp: false, cardId?: never })} CardView
 * @typedef {{ playerId: string } & ({ faceUp: true, cardId: number } | { faceUp: false, cardId?: never })} DrawnCardView
 * @typedef {{ cards: CardView[] }} DealComplete
 * @typedef {'ALREADY_IN_ROOM' | 'INVALID_NAME' | 'GAME_ALREADY_STARTED' | 'ROOM_FULL' | 'NOT_IN_ROOM' | 'READY_NOT_AVAILABLE' | 'NOT_YOUR_TURN' | 'INVALID_DRAW_SOURCE' | 'DRAW_NOT_AVAILABLE' | 'DECK_EMPTY' | 'DISCARD_EMPTY' | 'MUST_SWAP_DISCARD_DRAW' | 'RESOLUTION_NOT_AVAILABLE' | 'NO_DRAWN_CARD' | 'INVALID_TARGET' | 'MATCH_RESOLVING'} LobbyErrorCode
 * @typedef {{ code: LobbyErrorCode, message: string }} LobbyError
 * @typedef {Object} ClientEvents
 * @property {(payload: JoinRequest, ack?: (identity: JoinAck) => void) => void} joinRoom
 * @property {(payload: Record<string, never>) => void} ready
 * @property {(payload: Record<string, never>) => void} unready
 * @property {(payload: DrawRequest) => void} drawCard
 * @property {(payload: Record<string, never>) => void} discardDrawnCard
 * @property {(payload: DrawnSwapRequest) => void} swapDrawnCard
 * @typedef {Object} ServerEvents
 * @property {(payload: LobbyView) => void} playerJoined
 * @property {(payload: LobbyView) => void} playerDisconnected
 * @property {(payload: ReadyNotice) => void} playerReady
 * @property {(payload: ReadyNotice) => void} playerUnready
 * @property {(payload: DealComplete) => void} dealComplete
 * @property {(payload: TurnChanged) => void} turnChanged
 * @property {(payload: DrawnCardView) => void} cardDrawn
 * @property {(payload: DiscardPileUpdated) => void} discardPileUpdated
 * @property {(payload: DrawnSwapNotice) => void} cardSwapped
 * @property {(payload: LobbyError) => void} error
 */
export {};
