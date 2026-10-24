// Authoritative model from Game Data Model.md; no game-state object is a public payload.
/**
 * @typedef {'selfPeek' | 'opponentPeek' | 'blindSwap' | 'onePeekSwap' | 'twoPeekSwap'} Power
 * @typedef {0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13} Rank
 * @typedef {'clubs' | 'diamonds' | 'hearts' | 'spades' | 'joker'} Suit
 * @typedef {Object} Card
 * @property {number} cardId Image ID, shared by duplicate physical cards.
 * @property {Suit} suit Jokers share a suit; their black/red faces have distinct cardIds.
 * @property {Rank} rank
 * @property {Power | null} power
 * @typedef {{ handSlotId: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8, card: Card }} HandSlot
 * @typedef {Object} Player
 * @property {string} id
 * @property {string} displayName
 * @property {import('../../../shared/lobbyTypes.js').SeatId} seatId
 * @property {HandSlot[]} hand
 * @property {Card | null} drawnCard
 * @property {'deck' | 'discard' | null} drawnFrom
 * @property {boolean} drawnCardRevealed
 * @property {number} score
 * @property {boolean} calledCambio
 * @property {boolean} connected
 * @property {boolean} isReady
 * @typedef {{ cards: Card[] }} Deck
 * @typedef {{ cards: Card[], topMatchStatus: 'eligible' | 'matched' | 'exposed' | null }} DiscardPile
 * @typedef {Object} GameState
 * @property {Player[]} players
 * @property {Deck} deck
 * @property {DiscardPile} discardPile
 * @property {string | null} turn
 * @property {'awaitingDraw' | 'awaitingDrawnCardResolution' | 'resolvingPower' | null} turnStep
 * @property {Power | null} pendingPower
 * @property {'awaitingChoice' | 'awaitingPeekDone' | 'awaitingSwap' | null} pendingPowerStage
 * @property {{ matcherPlayerId: string, recipientPlayerId: string, stage: 'awaitingGift' } | null} pendingMatch
 * @property {'deal' | 'active' | 'finalRound' | 'roundOver' | 'gameAborted'} phase
 * @property {string | null} cambioCalledBy
 * @property {number | null} finalMatchGraceDeadline
 * @property {string[]} winners
 */
export {};
