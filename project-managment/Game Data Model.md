# Cambio — Data Model

This document owns server-state meaning, ownership, relationships, and invariants. [Game Rules](Game%20Rules.md) owns gameplay policy; [Events Contract](Events%20Contract.md) owns wire shapes, recipient redaction, errors, and ordering. Never send authoritative state objects directly to clients.

This document defines the intended state model. Source declarations are in [server game types](../code/server/src/game/types.js) and [shared public types](../code/shared/lobbyTypes.js). See the [root README](../README.md) for current implementation capabilities, limitations, and coverage.

## Card

- `cardId` selects the suit/rank artwork; duplicate physical cards may share it, so it is not a unique physical-card identity.
- `suit` and `rank` retain the printed identity. Joker rank is 0; ace is 1; jack, queen, and king are 11, 12, and 13. Red queens/kings retain their ranks despite different scoring values.
- `power` identifies the available power or is null. Scoring and power eligibility belong to [card values and powers](Game%20Rules.md#card-values-and-powers).

## enums

The exact `Power`, `Rank`, and `Suit` unions are declared in [server game types](../code/server/src/game/types.js). `Card.power` in the contract refers to that nullable property; a pending power or power notification uses a non-null power value.

## HandSlot

- `handSlotId` is stable within its owning player's hand and ranges from 1 through 8. It identifies a position rather than a card: removal vacates it, and replacement or a power swap changes its card without moving the slot.
- `card` is the actual server-only card; there is no stored per-slot visibility list.
- Additions reuse the lowest vacant ID before extending the hand. Opening slots are 1–4; see [setup and memorization](Game%20Rules.md#setup-and-memorization) for numbering and opening-card rules.

## Player

- `id` is the socket identity; `displayName` is the accepted normalized name.
- `seatId` is stable from 1 through 4; removing a player does not renumber the other seats.
- `hand` owns occupied slots: empty before dealing, initially four, then at most eight. Pending drawn cards are excluded.
- `drawnCard` is the player's owned pending card, separate from `hand`, with no hand-slot ID. A shared display does not transfer ownership.
- `drawnFrom` records deck or discard origin while a card is pending, otherwise null. It determines direct-discard eligibility and initial visibility.
- `drawnCardRevealed` records a valid power-use reveal of a deck-drawn card. It starts false on every draw and clears on resolution/reset. Discard draws are public through their source without setting this flag.
- `score` stores the final hand total, initialized/reset to 0.
- `calledCambio` records the caller immediately, including the unfinished calling turn.
- `connected` records connection state; disconnected players may remain represented during abort notification or in terminal results.
- `isReady` serves two distinct setup stages. The deal resets lobby readiness for memorization; it is not turn readiness.

## Deck

- `cards` is an ordered stack, last element on top. Full contents and counts remain server-only.
- Refill places shuffled older discards below the remaining deck cards, preserving their order on top; the algorithm and retry boundary are in [setup and memorization](Game%20Rules.md#setup-and-memorization).

## DiscardPile

- `cards` is an ordered stack, last element on top. Only the top is projected to clients, never buried cards or counts.
- `topMatchStatus` is server-only: `eligible` for a new discard, `matched` after its winning match, `exposed` for an older top uncovered by a discard draw, or null for an empty pile. These distinguish visually identical tops with different [matching eligibility](Game%20Rules.md#matching-gifts-and-penalties).
- Refilling the deck retains the top two discards when available and does not change the visible top.

## GameState

- `players` owns seated players in seat order, up to four; four are required to deal.
- `deck` and `discardPile` own the complete piles.
- `turn` references the current player's ID; null before play, during final grace, and after completion/reset.
- `turnStep` distinguishes `awaitingDraw`, `awaitingDrawnCardResolution`, and `resolvingPower`; null outside a live turn. A pending card alone cannot express power-stage eligibility.
- `pendingPower` identifies the held deck card's power during resolution, otherwise null.
- `pendingPowerStage` is `awaitingChoice` for use/skip, `awaitingPeekDone` while a peek waits for Done, or `awaitingSwap` for a black queen/king's later swap/skip; otherwise null.
- `pendingMatch` stores the winning matcher, recipient, and `awaitingGift` stage while a gift blocks turn actions; otherwise null. At most one gift can be pending.
- `phase` distinguishes setup (`deal`), live play (`active`), the other players' final turns and grace (`finalRound`), completed results (`roundOver`), and abort (`gameAborted`). Abort resets back to an undealt `deal` lobby.
- `cambioCalledBy` references the caller immediately; it can be non-null while phase remains `active` during that player's unfinished turn.
- `finalMatchGraceDeadline` is the server-clock deadline in milliseconds, otherwise null. Retain it after expiry while an accepted gift settles; clear it on scoring/reset.
- `winners` stores final winner IDs in seat order, otherwise empty. Per-player totals remain in `Player.score`.

## Notes

### State invariants and lifecycle

- In an undealt `deal` lobby, hands are empty. During memorization, all four opening hands are dealt; `isReady` determines whether each player's own opening faces remain visible in a setup projection. [Setup and memorization](Game%20Rules.md#setup-and-memorization) defines readiness and starting play.
- At most one player has a pending card, and that player owns the turn. `drawnCard`, `drawnFrom`, and `drawnCardRevealed` stay on that player throughout [draw and power resolution](Game%20Rules.md#turns-and-draw-resolution). Clear all three on swap, completed discard, or reset. Holding a power card through Done and a later swap/skip does not make another draw available.
- Starting a turn sets `awaitingDraw`; a draw sets `awaitingDrawnCardResolution`; choosing direct discard of a power card sets `resolvingPower` and `awaitingChoice` without changing the current discard. A valid use sets the reveal flag before publishing the power result. A peek sets `awaitingPeekDone`; a black queen/king's Done changes only the stage to `awaitingSwap`. Completed resolution clears pending power fields and marks the new discard eligible.
- `pendingMatch` suspends turn actions and advancement while preserving the underlying turn/draw state; matching can continue under the [matching rules](Game%20Rules.md#matching-gifts-and-penalties). Capacity and gift validity must be evaluated against current state, including intervening penalties.
- [Cambio and scoring](Game%20Rules.md#cambio-final-grace-and-scoring) determine final-turn progression. During final grace, phase remains `finalRound` while `turn` and `turnStep` are null. A deadline that has passed may coexist with a pending gift; scoring waits for settlement.
- At `roundOver`, store totals and winners, clear turn/draw/power/match state, reveal flags, and the grace deadline, and retain final hands/results. Later disconnects do not clear results.
- [Disconnect and abort rules](Game%20Rules.md#disconnect-and-abort-lifecycle) determine which setup readiness survives a departure. An active-game abort clears all round fields and ready marks, removes disconnected players, and retains connected players and their seats. Returning players have new identities and readiness.
- Unexpected undealt-lobby recovery preserves the shared state object's identity while resetting its contents; its socket effects belong to [contract conventions](Events%20Contract.md#conventions).

### Public projections

- [LobbyView and GameStateView](Events%20Contract.md#server-to-frontend) are recipient-specific projections, never authoritative state. Lobby summaries map `Player.id` to public `playerId`; seats remain stable even though arrays are ordered.
- Hand cards use `CardView` with slot IDs 1–8. The single pending card uses `DrawnCardView` with owner identity and no slot ID. Exact public declarations live in [shared types](../code/shared/lobbyTypes.js); the contract owns payload visibility and snapshot fields.
- Visibility is derived from setup readiness, draw source, the power reveal flag, phase, and recipient. Temporary match flips and power peeks are client display state; snapshots restore the baseline without replaying temporary faces or requiring a server flip-back event.
- Snapshot prompt visibility, matching availability, final-grace flags, and hidden-field omission are defined once in the [wire projection](Events%20Contract.md#server-to-frontend). Physical placement and empty-state display belong to the [UI Rules](designs/UI%20Rules.md#board-and-cards).
