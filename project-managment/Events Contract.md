# Cambio — Events Contract

This is the target wire contract for the complete game. [Game Rules](Game%20Rules.md) owns gameplay policy; [Game Data Model](Game%20Data%20Model.md) owns server-state semantics. Exact implemented setup/first-turn payload declarations and card views are in [shared public types](../code/shared/lobbyTypes.js). Other payloads below remain planned where no public source type exists. Source and [server socket/setup tests](../code/server/test/setup/setup.integration.test.js) establish implemented behavior, not the presence of an event in this specification. The fourth memorization `playerReady` is followed by exactly one `turnChanged` for a uniformly selected connected player. Drawing and active-game recovery remain deferred; `gameState` remains reserved and is not emitted.

## Conventions

- **Unexpected undealt-lobby faults**: an unexpected exception in a lobby action or disconnect handler is logged, resets the shared room to a fresh empty state, and disconnects all current clients. The server stays listening for fresh connections. Recovery preserves the shared state object's identity, prevents recursive cleanup, and emits no partial departure broadcasts. Clients clear membership and pending actions and require reload to rejoin. Expected domain validation failures remain requester-only `error` events with unchanged payloads and no room reset. This lobby recovery does not emit `gameAborted` or add a `SERVER_ERROR` client-action code; active-game abort handling remains deferred.

- **Naming**: all event names are `camelCase` (e.g. `joinRoom`, `playerJoined`).
- **Event index**: links below lead to the single detailed definition for each event, including its direction, payload, validation, and results.
- **Payloads**: always a JSON object, never a bare value — even events with no data send `{}`, not nothing.
- **Temporary reveals**: the server sends authorized card faces and validates outcomes immediately. Clients time match-flip animations locally and disable repeated clicks on a card during its flip animation; this does not impose a server cooldown or delay. A power user keeps peeked faces visible until clicking Done and sending `finishPowerPeek`; other recipients never receive those card faces. No server event is required solely to turn a card face down again. A new `GameStateView` replaces any in-progress local reveal with its baseline view.
- **Direction**: put one of these labels after every event name:
    - `(Client to Server)` — sent by one player to the server.
    - `(Server to All)` — sent to every player in the room. Hidden card data may require a different, redacted payload for each recipient; the event description says when this applies.
    - `(Server to Player)` — sent to exactly one player.
- **Acks**: not used by default — server responses arrive as separate events, not socket.io callback acks, so every response is visible to anything else listening (easier to log/debug/test). The one exception is noted explicitly where it occurs (`joinRoom`).
- **Errors**: the shared [`error`](#error) event (Server to Player) is used by every rejected client action, including a rejected `joinRoom`. Its payload is defined only in that event table.
    The complete set of client-action error codes is:

    ```text
    ALREADY_IN_ROOM, CAMBIO_ALREADY_CALLED, CAMBIO_NOT_AVAILABLE, DECK_EMPTY, DISCARD_EMPTY,
    DRAW_NOT_AVAILABLE, GAME_ALREADY_STARTED, GIFT_NOT_AVAILABLE,
    INVALID_DRAW_SOURCE, INVALID_GIFT_TARGET, INVALID_MATCH_TARGET,
    INVALID_NAME, INVALID_POWER_ACTION, INVALID_POWER_TARGET, INVALID_TARGET,
    INVALID_TARGET_COUNT, MATCH_NOT_AVAILABLE,
    MATCH_RESOLVING, MUST_SWAP_DISCARD_DRAW, NO_DRAWN_CARD, NOT_IN_ROOM,
    NOT_YOUR_TURN, POWER_NOT_AVAILABLE, READY_NOT_AVAILABLE,
    RESOLUTION_NOT_AVAILABLE, ROOM_FULL, SWAP_NOT_ALLOWED
    ```

    Per-event tables below define when each code applies. The shared `MATCH_RESOLVING` error applies to every turn action while an opponent gift is pending, even when omitted from an individual table. `SERVER_ERROR` is a `gameAborted` reason, not a client-action `error` code.

## Shared Object Shapes

These shapes are defined here once and referenced by event payloads. Implemented `CardView`, `DrawnCardView`, `PlayerSummary`, and `LobbyView` declarations are also available in [shared public types](../code/shared/lobbyTypes.js); remaining shapes describe planned wire behavior. `Card` and `GameState` in [Game Data Model](Game%20Data%20Model.md) are server-only; never send them directly.

### Client targets and server notifications

**HandSlotRef** — identifies a hand position, not its card face:

```js
{ playerId: string, handSlotId: int }
```

Use it for peek and swap targets, match attempts, and choosing a card to give. The server checks that the referenced slot exists and that the sending socket is allowed to act. A client does not send `cardId` or a claimed rank. The drawn-card position is not a hand slot.

Hand slot IDs are per player and range from `1` to `8`; [HandSlot semantics](Game%20Data%20Model.md#handslot) define their stability and reuse. Clients use server-supplied slot IDs rather than assigning them. A reference to a removed slot is invalid until filled again; the server always validates the card currently in a referenced slot. Physical numbering/layout is specified in the [UI Rules](designs/UI%20Rules.md#board-and-cards).

### Server to frontend

**CardView** — one hand card as seen by a particular recipient:

```js
{ playerId: string, handSlotId: int, faceUp: bool, cardId?: int }
```

`handSlotId` is a real hand position from `1` through `8`. `cardId` selects the card-face image and is present only when `faceUp` is true **for that recipient**. Omit it entirely for a facedown view. `faceUp` describes what this event or snapshot tells that recipient to display; it is not stored on the server's `HandSlot`. Build a separate payload for each recipient when visibility differs.

**DrawnCardView** — the pending card in the one shared drawn-card area:

```js
{ playerId: string, faceUp: bool, cardId?: int }
```

`playerId` identifies the drawer, not a display position. There is no `handSlotId`: this card is outside every hand. The same visibility rule applies: a face-up view requires `cardId`, and a facedown view omits it entirely. `cardDrawn` uses recipient-specific views; `powerCardRevealed` sends the same face-up view to everyone.

The view represents one owned pending card, separate from every hand. [Game Rules](Game%20Rules.md#turns-and-draw-resolution) defines owner-only resolution and privacy; the [UI Rules](designs/UI%20Rules.md#board-and-cards) define shared placement and empty-state presentation. Retain this view throughout power resolution. Clear it on swap, completed discard, reset/empty snapshot, or local connection loss. A pile update after a discard draw must retain it.

**PlayerSwap** — two hand positions exchanged after server validation:

```js
{ first: HandSlotRef, second: HandSlotRef }
```

**SelfSwap** — a drawn card placed into the drawer's hand; the displaced card goes to discard:

```js
{
    target: HandSlotRef;
}
```

**Match** — result of a match attempt:

```js
{
  target: HandSlotRef,
  whoFlipped: string,
  outcome: "won" | "sameRankNoEffect" | "wrong" | "ineligible",
  giftRequired: bool
}
```

`target.playerId` identifies whose card was flipped. `giftRequired` is true only for a winning opponent match when the matcher has a card to give. A wrong flip receives a penalty only with `outcome: "wrong"`; an ineligible exposed top and a later same-rank flip have no effect.

**DiscardView** — the visible top card of the discard pile:

```js
{
    cardId: int;
}
```

**PlayerNotice** — a notification identifying one player:

```js
{ playerId: string }
```

This contract shorthand is the structure of the implemented `ReadyNotice` in [shared types](../code/shared/lobbyTypes.js). Event tables specify which player it identifies; it carries no name, seat, or card data.

**PlayerSummary** — public seat identity and readiness:

```js
{ playerId: string, displayName: string, seatId: int, connected: bool, isReady: bool }
```

Derive each summary from a server `Player`: `playerId` comes from `Player.id`, and the other fields come from the same-named `Player` fields. Never send a `Player` directly: it also contains the hand, drawn card, score, and other server state.

**LobbyView** — public player list needed to draw seats and readiness:

```js
{
  players: PlayerSummary[] // ordered by seatId
}
```

This is an object because all event payloads are JSON objects. It contains no cards, piles, or game phase. The array order is seat order, but `seatId` remains the seat's stable identity in the range `1`–`4`: a vacant middle seat does not renumber the remaining players. A new player takes the first vacant `seatId`, and the server sends the whole list again in seat order. In the undealt lobby, each summary's `isReady` shows whether that player is ready for a deal. The event carrying this view determines how clients use it: `playerJoined` updates the lobby, `playerDisconnected` updates seats or connection indicators, and `gameAborted` resets the display to the lobby.

**GameStateView** — the recipient-specific display snapshot derived from server `GameState`:

```js
{
  players: Array<{ summary: PlayerSummary, hand: CardView[] }>,
  discardTop: DiscardView | null,
  drawnCard: DrawnCardView | null,
  drawnFrom: "deck" | "discard" | null,
  turnPlayerId: string | null,
  turnStep: "awaitingDraw" | "awaitingDrawnCardResolution" | "resolvingPower" | null,
  powerPrompt: { power: Card.power, stage: "awaitingChoice" | "awaitingPeekDone" | "awaitingSwap" } | null,
  matchStage: "awaitingGift" | null,
  giftPrompt: { recipientPlayerId: string } | null,
  matchingAllowed: bool,
  finalMatchGraceActive: bool,
  phase: "deal" | "active" | "finalRound" | "roundOver" | "gameAborted",
  cambioCalledBy: string | null,
  winners: string[],
  scores: Array<{ playerId: string, score: int, cardCount: int }> | null
}
```

The snapshot's single `drawnCard` populates the shared area below the piles; `null` empties it. Its `playerId` identifies the turn holder who owns the card.

This is a **baseline snapshot** for future resynchronization, including setup; `gameState` has no MVP trigger. Apply these recipient-projection rules:

- Before dealing, hands are empty and `summary.isReady` represents lobby readiness. During memorization, only the recipient's own bottom two faces are visible, and only while their `summary.isReady` is false.
- During play, hand views are facedown even during a local match flip or power peek. Snapshots replace temporary reveals with this baseline, without replaying peeked faces.
- `turnStep` reports the underlying turn stage. `powerPrompt` is non-null only for the current power user during `"resolvingPower"`; its power is a non-null value from `Card.power`. Its stage restores use/skip, Done, or swap/skip without replaying temporary faces. Other recipients receive null.
- `matchingAllowed` requires a discard top and a live matching phase/deadline. It is false throughout `"resolvingPower"` and after the final deadline, but may be true during `"awaitingGift"`. `matchStage` is non-null only while a gift blocks turn actions; only that winning matcher receives a non-null `giftPrompt` identifying the recipient. Neither prompt repeats card faces.
- `finalMatchGraceActive` is true only before the server's one-second grace deadline. During grace, `turnPlayerId` and `turnStep` are null and phase remains `"finalRound"`; the deadline may expire while a gift settles. The caller's ID may be present while phase is still `"active"` during the unfinished calling turn.
- The pending `drawnCard` remains present through power resolution. Its face is visible to the drawer, to everyone for a discard draw, and to everyone after valid power use reveals a held deck card. A black queen/king remains publicly face up through Done and the later swap/skip choice. `drawnCard` and `drawnFrom` become null on swap, completed discard, or reset; `drawnFrom` otherwise publicly identifies the pending draw source.
- At `roundOver`, all hands are face up and scores/winners are populated; earlier, scores are null and winners empty.
- Never include the deck stack or count, discard count or buried cards, hidden card identifiers, or server-only discard-top match status. The [UI Rules](designs/UI%20Rules.md#board-and-cards) define the facedown deck graphic and shared display placement.

## Events

This index links to each event's complete definition; payloads appear only in the shared shapes and event tables. Gameplay eligibility is defined in [Game Rules](Game%20Rules.md); the tables retain contract-specific validation and error mappings.

### Connection and lobby

- [`joinRoom`](#joinroom) (Client to Server)
- [`playerJoined`](#playerjoined) (Server to All)
- [`playerDisconnected`](#playerdisconnected) (Server to All)
- [`gameAborted`](#gameaborted) (Server to All)
- [`ready`](#ready) (Client to Server)
- [`playerReady`](#playerready) (Server to All)
- [`unready`](#unready) (Client to Server)
- [`playerUnready`](#playerunready) (Server to All)

### Setup and deal

- [`dealComplete`](#dealcomplete) (Server to All)
- [`turnChanged`](#turnchanged) (Server to All)

### Turn and draw

- [`drawCard`](#drawcard) (Client to Server)
- [`cardDrawn`](#carddrawn) (Server to All)

### Resolve drawn card

- [`discardDrawnCard`](#discarddrawncard) (Client to Server)
- [`swapDrawnCard`](#swapdrawncard) (Client to Server)
- [`discardPileUpdated`](#discardpileupdated) (Server to All)
- [`cardSwapped`](#cardswapped) (Server to All)

### Powers

- [`powerResolutionStarted`](#powerresolutionstarted) (Server to All)
- [`powerAvailable`](#poweravailable) (Server to Player)
- [`usePower`](#usepower) (Client to Server)
- [`powerCardRevealed`](#powercardrevealed) (Server to All)
- [`skipPower`](#skippower) (Client to Server)
- [`powerPeekResult`](#powerpeekresult) (Server to All)
- [`finishPowerPeek`](#finishpowerpeek) (Client to Server)
- [`choosePowerSwap`](#choosepowerswap) (Client to Server)

### Matching

- [`attemptMatch`](#attemptmatch) (Client to Server)
- [`flipCard`](#flipcard) (Server to All)
- [`matchResult`](#matchresult) (Server to All)
- [`chooseCardToGive`](#choosecardtogive) (Client to Server)
- [`cardGiven`](#cardgiven) (Server to All)
- [`penaltyCardDrawn`](#penaltycarddrawn) (Server to All)
- [`handLimitWarning`](#handlimitwarning) (Server to Player)

### Cambio and endgame

- [`callCambio`](#callcambio) (Client to Server)
- [`cambioCalled`](#cambiocalled) (Server to All)
- [`finalMatchGraceStarted`](#finalmatchgracestarted) (Server to All)
- [`roundOver`](#roundover) (Server to All)
- [`gameOver`](#gameover) (Server to All)

### State sync and errors

- [`gameState`](#gamestate) (Server to All)
- [`error`](#error) (Server to Player)

## Connection & Lobby Events

### `joinRoom`

| Field | Value |
| --- | --- |
| Direction | (Client to Server) |
| Trigger | Player submits the name form while connected to the server. |
| Payload | `{ displayName: string }` |
| Preconditions | A seat is vacant, `phase === "deal"`, and no cards are dealt. No mid-game join or resume. This includes the lobby after a prestart disconnect or aborted match. |
| Server effects | Validate and store the normalized display name. Trim surrounding whitespace, collapse repeated ordinary spaces, and normalize to Unicode NFC. Accept 1–20 Unicode code points: the first must be a letter or number; the rest may be letters, combining marks, numbers, ordinary spaces, apostrophes (`'` and `’`), hyphens, or periods. Reject control characters, emoji, and other symbols. Names must be unique among seated players after normalization and case-insensitive comparison; a departed player's name is available again. Create a new `Player` with `connected: true` and `isReady: false`, assign the first vacant `seatId` from `1`–`4`, and insert them into `GameState.players` in seat order. Existing players keep their seats and ready marks. A disconnected player who returns joins as a new player. |
| Resulting events | After the ack, if supplied: `playerJoined` (Server to All), including to the joining socket, with the updated `LobbyView` derived from `GameState.players`. This gives the new player the existing seats and ready marks without sending `GameState` or `GameStateView`. Filling the fourth seat does not deal cards; all four seated players must be ready. |
| Ack | **Exception to the no-ack convention** — when a callback is supplied, send `{ playerId, seatId }` before the lobby broadcast. The browser client supplies this callback to learn its identity; joining without a callback is also accepted. |
| Errors | `ALREADY_IN_ROOM` if this socket already has a seat; `INVALID_NAME` for a non-string, invalid, overlong, or already occupied name; `GAME_ALREADY_STARTED` if the phase is not `"deal"` or any hand is dealt; `ROOM_FULL` if no seat is vacant. Check in that order. A rejected join receives no acknowledgment or lobby broadcast. |

### `playerJoined`

| Field | Value |
| --- | --- |
| Direction | (Server to All) |
| Trigger | A `joinRoom` request succeeds, after its acknowledgment when a callback was supplied. |
| Payload | `LobbyView` in seat order, with the joining player `connected: true` and `isReady: false`; existing players' ready marks are preserved. |
| Preconditions | The player has an assigned lobby seat. |
| Server effects | None; `joinRoom` already added the player. |
| Resulting events | None. Players use `ready` to trigger a deal; no separate `gameState` event is sent. |
| Ack | None. |
| Errors | None. |

### `playerDisconnected`

| Field | Value |
| --- | --- |
| Direction | (Server to All) |
| Trigger | A seated player's socket disconnects, including a server-forced disconnect when a card addition would exceed eight cards. |
| Payload | `LobbyView` in seat order after the disconnect. Before play, the departed player is absent; during play or after `roundOver`, their summary has `connected: false` until the match is reset. |
| Preconditions | The socket belongs to a seated player. |
| Server effects | In an undealt lobby, free the seat and preserve the remaining players' `isReady` flags. During memorization, free the seat, discard the deal, and reset the remaining players' `isReady` flags. During `active` or `finalRound`, mark the player disconnected so `gameAborted` can reset the match. After `roundOver`, mark them disconnected but preserve the final result. |
| Resulting events | During play: `gameAborted` (Server to All) follows and supplies the reset lobby. Before play, clients clear any dealt cards, return to the undealt lobby, and use the supplied seats and ready marks. After `roundOver`, clients update connection indicators and preserve the final result. No separate `gameState` event is sent. |
| Ack | None. |
| Errors | None. |

### `gameAborted`

| Field | Value |
| --- | --- |
| Direction | (Server to All) |
| Trigger | A player disconnects during a match, or an unrecoverable server error ends a match. |
| Payload | `{ reason: "PLAYER_DISCONNECTED" \| "SERVER_ERROR", playerId?: string, lobby: LobbyView }`; include `playerId` only for `PLAYER_DISCONNECTED`. The nested lobby is the reset, undealt state. |
| Preconditions | `phase === "active"` or `phase === "finalRound"`; play has begun. A disconnect during the deal/memorization stage does not trigger this event. |
| Server effects | Apply the [abort/reset lifecycle](Game%20Rules.md#disconnect-and-abort-lifecycle) and [model reset invariants](Game%20Data%20Model.md#state-invariants-and-lifecycle): clear all round state and readiness, remove disconnected players, preserve connected players and their seats, and return to an undealt `"deal"` lobby. |
| Resulting events | None. Connected players use the ordinary lobby `ready` flow, whether or not a fourth player must join. Clients replace the game display with `lobby`. |
| Ack | None. |
| Errors | None. |

### `ready`

| Field | Value |
| --- | --- |
| Direction | (Client to Server) |
| Trigger | A seated player presses Ready in the undealt lobby or after memorizing their opening cards. |
| Payload | `{}` |
| Preconditions | The sender is seated and `phase === "deal"`. No cards are dealt in the lobby stage; all four opening hands are dealt in the memorization stage. A lobby player may ready before all four seats are filled. |
| Server effects | Set the sender's `isReady` to `true` once in the current stage. A duplicate request changes nothing. After the fourth lobby `playerReady`, deal and reset all ready marks. After the fourth memorization `playerReady`, choose a random first player, set `turn` to that player, set `turnStep` to `"awaitingDraw"`, and change `phase` to `"active"`. |
| Resulting events | For a new ready mark, send `playerReady` (Server to All). The fourth lobby `playerReady` is followed by `dealComplete`; the fourth memorization `playerReady` is followed by `turnChanged`. A duplicate request emits nothing. |
| Ack | None. |
| Errors | `NOT_IN_ROOM` for an unseated sender; `READY_NOT_AVAILABLE` outside the undealt lobby or dealt memorization stage, via `error` (Server to Player). |

### `playerReady`

| Field | Value |
| --- | --- |
| Direction | (Server to All) |
| Trigger | A valid `ready` request newly marks a player ready in either stage. |
| Payload | `PlayerNotice` for the newly ready player. |
| Preconditions | The named player was not already ready in the current stage. |
| Server effects | None; `ready` already updated `isReady`. |
| Resulting events | In the lobby, clients mark that seat ready. During memorization, clients mark that seat ready and the named player's client hides their two card faces. On the fourth ready mark, `dealComplete` or `turnChanged` follows according to the stage. |
| Ack | None. |
| Errors | None. |

### `unready`

| Field | Value |
| --- | --- |
| Direction | (Client to Server) |
| Trigger | A ready player presses Unready in the undealt lobby before all four players are ready. |
| Payload | `{}` |
| Preconditions | The sender is seated, `phase === "deal"`, no cards have been dealt, and fewer than four players are ready. |
| Server effects | Set the sender's `isReady` to `false` once. A duplicate request changes nothing. If a player leaves after all four were ready, the remaining ready players may unready again while fewer than four are ready. |
| Resulting events | For a newly cleared mark, send `playerUnready` (Server to All). A duplicate request emits nothing. |
| Ack | None. |
| Errors | `NOT_IN_ROOM` for an unseated sender; `READY_NOT_AVAILABLE` outside the undealt lobby or while all four players are ready, via `error` (Server to Player). |

### `playerUnready`

| Field | Value |
| --- | --- |
| Direction | (Server to All) |
| Trigger | A valid `unready` request newly clears a lobby ready mark. |
| Payload | `PlayerNotice` for the newly unready player. |
| Preconditions | The named player was ready in the undealt lobby. |
| Server effects | None; `unready` already updated `isReady`. |
| Resulting events | Clients mark that seat not ready. |
| Ack | None. |
| Errors | None. |

## Setup & Deal Events

### `dealComplete`

| Field | Value |
| --- | --- |
| Direction | (Server to All) |
| Trigger | The fourth seated player becomes ready in an undealt lobby, including after an abort. |
| Payload | `{ cards: CardView[] }` with all 16 opening hand slots, ordered by `seatId` and then `handSlotId`. Only the recipient's bottom-row slots `2` and `4` have `faceUp: true` and `cardId`; all other cards have `faceUp: false` and omit `cardId`. |
| Preconditions | Four connected players are seated, each is ready in the undealt lobby, and the fourth `playerReady` has been sent. |
| Server effects | Deal under [setup rules](Game%20Rules.md#setup-and-memorization). Reset every player's `isReady`, `calledCambio`, and `drawnCardRevealed` to false and `score` to 0. Clear the discard pile and its match status, pending draws, turn/step, power/stage, match, Cambio caller, grace deadline, and winners; phase remains `"deal"` for memorization. |
| Resulting events | Send after the fourth lobby `playerReady`. Clients clear their lobby ready indicators, display the dealt cards, and wait for four new `ready` requests. No separate `gameState` event is sent. Earlier lobby events supplied player identities and seats. |
| Ack | None. |
| Errors | None. |

### `turnChanged`

| Field | Value |
| --- | --- |
| Direction | (Server to All) |
| Trigger | All four players have become ready, or the server advances to the next turn during play, including from the caller's finished turn to the first final turn. |
| Payload | `PlayerNotice` for the new turn holder. |
| Preconditions | For the first turn, all four players are ready and the server has entered `"active"` play. For later turns, the preceding turn and any pending match have resolved and the server has selected the next player. The caller is never selected again after their turn ends. |
| Server effects | None; the server has already set `turn` and made the new turn await its draw before sending this event. |
| Resulting events | Clients update the turn indicator. On the first `turnChanged` after a deal, clients may show a game-start message. The first `turnChanged` after the caller finishes begins `"finalRound"`; after the third non-caller finishes, `finalMatchGraceStarted` is sent instead of another `turnChanged`. |
| Ack | None. |
| Errors | None. |

## Turn & Draw Events

### `drawCard`

| Field | Value |
| --- | --- |
| Direction | (Client to Server) |
| Trigger | The current turn holder chooses the facedown deck or the visible discard top. |
| Payload | `{ source: "deck" \| "discard" }` |
| Preconditions | The sender is seated and holds the current turn during `"active"` or `"finalRound"`. The turn is awaiting its one draw, with no drawn card or other action pending. The chosen source contains a card; the discard source is unavailable while the pile is empty, including on the first turn. |
| Server effects | Remove exactly one card from the chosen source, set the sender's `drawnCard` and `drawnFrom`, reset `drawnCardRevealed` to false, and set `turnStep` to `"awaitingDrawnCardResolution"`. Drawing the discard top sets `discardPile.topMatchStatus` to `"exposed"` for the newly exposed older card, or null for an empty pile. Apply the [deck-refill rule](Game%20Rules.md#setup-and-memorization), including its low-deck retry condition. A rejected request changes no state. |
| Resulting events | Send `cardDrawn` (Server to All) with recipient-specific redaction. For a discard draw, then send `discardPileUpdated` (Server to All) with the newly exposed top or `null`. A deck draw sends no pile update; a refill has no separate client event. |
| Ack | None. |
| Errors | `NOT_IN_ROOM` for an unseated sender; `INVALID_DRAW_SOURCE` for an unknown source; `DRAW_NOT_AVAILABLE` outside play, after this turn's draw, or while another action is unresolved; `NOT_YOUR_TURN` for a different seated player; `DISCARD_EMPTY` or `DECK_EMPTY` if the chosen source has no card, via `error` (Server to Player). |

### `cardDrawn`

| Field | Value |
| --- | --- |
| Direction | (Server to All) |
| Trigger | A `drawCard` request succeeds. |
| Payload | A `DrawnCardView` with `playerId` equal to the drawer and no `handSlotId`. For a deck draw, the drawer receives `faceUp: true` and `cardId`; all other players receive `faceUp: false` without `cardId`. For a discard draw, every player receives `faceUp: true` and `cardId`. |
| Preconditions | The server has removed one card from the chosen source and stored it as the drawer's pending card. |
| Server effects | None; `drawCard` already changed the piles and pending draw. |
| Resulting events | Clients show the card in the shared drawn-card area centered below the deck and discard piles until it is resolved. After a discard draw, `discardPileUpdated` follows to show the new top or `null` while retaining the pending card in the shared area; after a deck draw, no pile update follows. |
| Ack | None. |
| Errors | None. |

## Resolve Drawn Card Events

### `discardDrawnCard`

| Field | Value |
| --- | --- |
| Direction | (Client to Server) |
| Trigger | The turn holder chooses to discard their pending deck-drawn card. |
| Payload | `{}` |
| Preconditions | The sender is seated, holds the turn during `"active"` or `"finalRound"`, and `turnStep === "awaitingDrawnCardResolution"`. Their `drawnCard` exists and `drawnFrom === "deck"`. |
| Server effects | If the drawn card has a power, keep it in the sender's `drawnCard` with `drawnFrom: "deck"`, retain its power in `pendingPower`, set `pendingPowerStage` to `"awaitingChoice"`, and set `turnStep` to `"resolvingPower"`; do not change the discard pile or `drawnCardRevealed` yet. Otherwise move the card to the discard top, clear `drawnCard`, `drawnFrom`, `drawnCardRevealed`, and both pending-power fields, mark the new top `"eligible"`, and complete the turn. A rejected request changes no state. |
| Resulting events | For a power card, send `powerResolutionStarted` (Server to All), then `powerAvailable` (Server to Player) to the turn holder. Matching is rejected until that power is completed or skipped and the card is discarded. For a non-power card, send `discardPileUpdated` (Server to All), then `turnChanged` or `finalMatchGraceStarted` after the last final turn. |
| Ack | None. |
| Errors | `NOT_IN_ROOM` for an unseated sender; `NOT_YOUR_TURN` for another seated player; `RESOLUTION_NOT_AVAILABLE` outside the resolution step; `NO_DRAWN_CARD` if no pending card exists; `MUST_SWAP_DISCARD_DRAW` if it came from discard, via `error` (Server to Player). |

### `swapDrawnCard`

| Field | Value |
| --- | --- |
| Direction | (Client to Server) |
| Trigger | The turn holder selects one of their hand slots to replace with the pending drawn card. |
| Payload | `SelfSwap`, identifying the drawer's occupied target slot. |
| Preconditions | The sender is seated, holds the turn during `"active"` or `"finalRound"`, and `turnStep === "awaitingDrawnCardResolution"`. Their `drawnCard` exists. `target` identifies an existing hand slot owned by the sender. Either draw source is allowed. |
| Server effects | Put `drawnCard` into the target slot and move the displaced card to the discard top. Clear `drawnCard`, `drawnFrom`, `drawnCardRevealed`, `pendingPower`, and `pendingPowerStage`; set `discardPile.topMatchStatus` to `"eligible"` for the displaced card and complete the turn, setting `turnStep` to `"awaitingDraw"` for the next player or null at round end. Neither the drawn card nor the displaced card grants a power through this swap. A rejected request changes no state. |
| Resulting events | Send `cardSwapped` (Server to All) with its `"drawn"` variant, then `discardPileUpdated` (Server to All) with the displaced card as the public top. Advance with `turnChanged`, or send `finalMatchGraceStarted` after the last final turn. The card in the target slot is displayed facedown after the swap. |
| Ack | None. |
| Errors | `NOT_IN_ROOM`, `NOT_YOUR_TURN`, `RESOLUTION_NOT_AVAILABLE`, `NO_DRAWN_CARD`, or `INVALID_TARGET` for a missing or non-owned hand slot, via `error` (Server to Player). |

### `discardPileUpdated`

| Field | Value |
| --- | --- |
| Direction | (Server to All) |
| Trigger | The visible discard top changes when a card is drawn from the pile or added to it. |
| Payload | `{ top: DiscardView \| null }`; `null` when the pile becomes empty. No buried cards or pile count are included. |
| Preconditions | The server has already changed the discard pile. |
| Server effects | None; the action that changed the pile sets its server-only `topMatchStatus`. An exposed older top cannot win a match; a new discard is eligible until its first correct match. |
| Resulting events | Clients replace the displayed discard top. After a discard draw, this follows `cardDrawn` and retains the shared drawn-card display; after a drawn-card swap, it follows `cardSwapped`, which has cleared that display. A completed non-power discard clears the shared drawn-card display. After a power is completed or skipped, this update follows any power result: clients clear the held drawn-card display and end the public matching block before turn advancement. |
| Ack | None. |
| Errors | None. |

### `cardSwapped`

| Field | Value |
| --- | --- |
| Direction | (Server to All) |
| Trigger | A drawn card replaces one of the drawer's hand cards, or a power swaps two hand slots after validation. |
| Payload | `SelfSwap` plus `kind: "drawn"`, or `PlayerSwap` plus `kind: "power"` in the same object. Slot references identify the affected positions; no hidden `cardId` is included. |
| Preconditions | The server has completed the corresponding drawn-card or power swap. A power swap uses slots owned by different players, never two slots owned by the same player; during `"finalRound"`, neither slot belongs to the Cambio caller. |
| Server effects | None; the action that caused the swap already updated the hands. |
| Resulting events | Clients update the referenced hand slots as facedown cards and clear temporary reveals on those slots. A drawn swap clears the shared drawn-card area and is followed by `discardPileUpdated` for its displaced card. A power swap is followed by `discardPileUpdated` for the held power card; the new discard top becomes eligible before the turn advances. |
| Ack | None. |
| Errors | None. |

## Power Events

[Card values and powers](Game%20Rules.md#card-values-and-powers) defines effects and peek/swap choices. The tables specify stage validation, recipient visibility, and resolution ordering.

### `powerResolutionStarted`

| Field | Value |
| --- | --- |
| Direction | (Server to All) |
| Trigger | `discardDrawnCard` succeeds for a deck-drawn card with a power. |
| Payload | `PlayerNotice` identifying the turn holder, without the drawn card's face or power. |
| Preconditions | `turnStep === "resolvingPower"`, the drawn card is still held, and `pendingPowerStage === "awaitingChoice"`. |
| Server effects | None; `discardDrawnCard` already started power resolution. |
| Resulting events | All clients disable match attempts until `discardPileUpdated` announces that the held power card has been discarded. The server rejects attempts during this interval even if a previous discard top remains visible. Send `powerAvailable` to the turn holder next. |
| Ack | None. |
| Errors | None. |

### `powerAvailable`

| Field | Value |
| --- | --- |
| Direction | (Server to Player) |
| Trigger | The turn holder chooses to discard a deck-drawn 7–10, jack, black queen, or black king, starting its power before discard. |
| Payload | `{ power: Card.power }`; the non-null enum value from the held drawn card. |
| Preconditions | `turnStep === "resolvingPower"`, `pendingPower` is non-null, and `pendingPowerStage === "awaitingChoice"`. |
| Server effects | None; `discardDrawnCard` already stored the pending power and stage. |
| Resulting events | Send to the power user after `powerResolutionStarted`. Their client offers `usePower` or `skipPower`. The reserved `GameStateView` shape retains the prompt for possible future state sync. Other players receive no power prompt or drawn-card face until a valid `usePower` reveals the card. |
| Ack | None. |
| Errors | None. |

### `usePower`

| Field | Value |
| --- | --- |
| Direction | (Client to Server) |
| Trigger | The power user chooses to use the held drawn card's pending power. |
| Payload | For 7/8 or 9/10: `{ peekTarget: HandSlotRef }`. For jack: `PlayerSwap`. For black queen/king: `{ peekTargets: HandSlotRef[] }` with exactly one/two distinct targets respectively. The client does not name the power or send card faces. |
| Preconditions | The sender is seated, holds the turn during `"active"` or `"finalRound"`, `turnStep === "resolvingPower"`, `pendingPower` is non-null, and `pendingPowerStage === "awaitingChoice"`. Every target must identify a current hand slot. A 7/8 target belongs to the sender; a 9/10 target belongs to an opponent. Black queen/king peek targets may belong to any player, including the Cambio caller. A jack's swap targets must belong to different players; neither may belong to the caller during `"finalRound"`. |
| Server effects | After validating the action and all targets, mark the held drawn card publicly revealed. For a 7–10 or black queen/king peek, keep the held card and `pendingPower`, set `pendingPowerStage` to `"awaitingPeekDone"`, and leave `turnStep` as `"resolvingPower"`; no discard or turn advancement occurs until `finishPowerPeek`. For jack, exchange the two cards, then move the held card to the discard top, mark it `"eligible"`, clear `drawnCard`, `drawnFrom`, `drawnCardRevealed`, `pendingPower`, and `pendingPowerStage`, and complete the turn. Matching remains blocked throughout power resolution. A rejected request changes no state and sends no reveal. |
| Resulting events | Send `powerCardRevealed` to everyone first. For a 7–10 or black queen/king peek, then send recipient-specific `powerPeekResult`; the power user keeps the peeked faces visible until clicking Done. No pile update or turn advancement occurs yet. For jack, send `cardSwapped` with `kind: "power"`, `discardPileUpdated`, and turn advancement or final grace. |
| Ack | None. |
| Errors | `NOT_IN_ROOM`, `NOT_YOUR_TURN`, or `POWER_NOT_AVAILABLE` for the wrong phase or stage; `INVALID_POWER_ACTION` for a payload shape that does not fit the pending power; `INVALID_TARGET_COUNT` for the wrong number of peek targets or a repeated black-king target; `INVALID_POWER_TARGET` for a missing slot or one with disallowed ownership; `SWAP_NOT_ALLOWED` for a same-player jack pair or a pair containing the Cambio caller during `"finalRound"`, via `error` (Server to Player). |

### `powerCardRevealed`

| Field | Value |
| --- | --- |
| Direction | (Server to All) |
| Trigger | A `usePower` request succeeds after the server validates its targets. |
| Payload | The same face-up `DrawnCardView` for every recipient, identifying the held power card without a hand-slot ID. |
| Preconditions | `usePower` validated and captured the held drawn card before any automatic discard. For a black queen/king, `drawnCardRevealed` remains true while the swap or skip choice is pending. A rejected `usePower` does not reveal the card. |
| Server effects | None; `usePower` authorized the public reveal before the power result. |
| Resulting events | Clients display the card face in the shared drawn-card area below the piles. The power's `powerPeekResult` or `cardSwapped` follows; for a black queen/king, the card remains publicly face up through the later swap or skip choice. `discardPileUpdated` eventually moves the card face to the discard top and clears the drawn-card display. This event does not represent a match attempt and is not followed by `matchResult`. |
| Ack | None. |
| Errors | None. |

### `skipPower`

| Field | Value |
| --- | --- |
| Direction | (Client to Server) |
| Trigger | The power user declines the available power before using it, or declines the swap after finishing a black queen/king peek with `finishPowerPeek`. |
| Payload | `{}` |
| Preconditions | The sender is seated, holds the turn during `"active"` or `"finalRound"`, `turnStep === "resolvingPower"`, and `pendingPower` is non-null. `pendingPowerStage` is `"awaitingChoice"`, or it is `"awaitingSwap"` for a black queen/king after `finishPowerPeek`. Skipping is unavailable during `"awaitingPeekDone"`. |
| Server effects | Move the held drawn card to the discard top, mark it `"eligible"`, clear `drawnCard`, `drawnFrom`, `drawnCardRevealed`, `pendingPower`, and `pendingPowerStage`, and complete the turn. A rejected request changes no state. Skipping at `"awaitingChoice"` sends no separate public reveal; skipping at `"awaitingSwap"` leaves the earlier public reveal intact until discard. |
| Resulting events | Send `discardPileUpdated`, then `turnChanged` for the next player or `finalMatchGraceStarted` after the last final turn. No separate skipped-power event is sent. |
| Ack | None. |
| Errors | `NOT_IN_ROOM`, `NOT_YOUR_TURN`, or `POWER_NOT_AVAILABLE` for the wrong phase, missing power, or wrong stage, via `error` (Server to Player). |

### `powerPeekResult`

| Field | Value |
| --- | --- |
| Direction | (Server to All), with a separate payload per recipient. |
| Trigger | A 7–10 or black queen/king `usePower` request succeeds. |
| Payload | `{ targets: CardView[] }` in requested order. Every recipient sees the targeted `playerId` and `handSlotId`. Only the power user receives `faceUp: true` and `cardId`; all other recipients receive `faceUp: false` with `cardId` omitted. |
| Preconditions | The server has validated the current target slots and set `pendingPowerStage` to `"awaitingPeekDone"`. |
| Server effects | None; `usePower` left the held card and turn pending. |
| Resulting events | `powerCardRevealed` has already shown everyone the held power card. Only the power user's client displays the authorized peeked faces and a Done button. Keep those faces visible until the user clicks Done and sends `finishPowerPeek`; do not automatically end the peek after an animation. Other clients may highlight the target slots but receive no card faces. A new `GameStateView` replaces temporary peeks with facedown baseline cards; its `powerPrompt.stage` still indicates that Done is required, but it does not repeat the peeked faces. Matching stays blocked. |
| Ack | None. |
| Errors | None. |

### `finishPowerPeek`

| Field | Value |
| --- | --- |
| Direction | (Client to Server) |
| Trigger | The power user clicks Done after viewing the targets from `powerPeekResult`. |
| Payload | `{}` |
| Preconditions | The sender is seated, holds the turn during `"active"` or `"finalRound"`, `turnStep === "resolvingPower"`, `pendingPower` is `selfPeek`, `opponentPeek`, `onePeekSwap`, or `twoPeekSwap`, and `pendingPowerStage === "awaitingPeekDone"`. The held drawn card remains in the shared area below the piles. |
| Server effects | For a 7–10, move the held power card to the discard top, mark it `"eligible"`, clear `drawnCard`, `drawnFrom`, `drawnCardRevealed`, `pendingPower`, and `pendingPowerStage`, then complete the turn. For a black queen/king, change `pendingPowerStage` to `"awaitingSwap"` while keeping the publicly revealed held card in the shared drawn-card area; do not discard or advance the turn. A rejected or duplicate request changes no state. |
| Resulting events | For a 7–10, send `discardPileUpdated`, then `turnChanged` or `finalMatchGraceStarted` after the last final turn. For a black queen/king, send no separate event: the power user's client closes the peek display when it sends Done and offers `choosePowerSwap` or `skipPower`; matching remains blocked. If the server rejects Done, the client keeps or restores the Done prompt after `error`. |
| Ack | None. |
| Errors | `NOT_IN_ROOM` for an unseated sender; `NOT_YOUR_TURN` for another seated player; `POWER_NOT_AVAILABLE` outside the pending peek stage, including a duplicate request, via `error` (Server to Player). |

### `choosePowerSwap`

| Field | Value |
| --- | --- |
| Direction | (Client to Server) |
| Trigger | After completing a black queen/king peek with `finishPowerPeek`, the power user chooses two slots to swap. |
| Payload | `PlayerSwap`. The pair need not include a peeked slot. |
| Preconditions | The sender is seated, holds the turn during `"active"` or `"finalRound"`, `turnStep === "resolvingPower"`, `pendingPower` is a black queen/king power, and `pendingPowerStage === "awaitingSwap"`. Both slots still exist when this request is processed and belong to different players. During `"finalRound"`, neither slot may belong to the Cambio caller. Two opponents' cards may be swapped. |
| Server effects | Exchange the cards in the referenced slots, then move the held drawn card to the discard top, mark it `"eligible"`, clear `drawnCard`, `drawnFrom`, `drawnCardRevealed`, `pendingPower`, and `pendingPowerStage`, and complete the turn. No match can remove a target slot between the peek and swap because matching is blocked throughout power resolution. A rejected swap leaves the held card, its public reveal, and pending power intact so the player can choose again or skip. |
| Resulting events | Send `cardSwapped` (Server to All) with its `"power"` variant, then `discardPileUpdated`, then `turnChanged` or `finalMatchGraceStarted` after the last final turn. |
| Ack | None. |
| Errors | `NOT_IN_ROOM`, `NOT_YOUR_TURN`, or `POWER_NOT_AVAILABLE` for the wrong phase or stage; `INVALID_POWER_ACTION` for a malformed pair; `INVALID_POWER_TARGET` for a missing slot; `SWAP_NOT_ALLOWED` for a same-player pair or a pair containing the Cambio caller during `"finalRound"`, via `error` (Server to Player). |

## Matching Events

[Matching, gifts, and penalties](Game%20Rules.md#matching-gifts-and-penalties) defines rank comparison, winning eligibility, and additions. The tables retain arrival-order processing, rejection mappings, and public/private output.

### `attemptMatch`

| Field | Value |
| --- | --- |
| Direction | (Client to Server) |
| Trigger | A seated player clicks one hand card, their own or another player's, to try matching the current discard top. |
| Payload | `{ target: HandSlotRef }`; no card ID, rank, or discard ID. |
| Preconditions | `phase` is `"active"` or `"finalRound"`; if the final grace has started, the request reaches the server before `finalMatchGraceDeadline`. `turnStep` is not `"resolvingPower"`. The discard pile has a top card and `target` identifies an existing hand slot. Matching is accepted during other live turn steps and while an opponent gift is pending. The server does not enforce a repeat-click cooldown. |
| Server effects | Apply [matching, gift, and penalty rules](Game%20Rules.md#matching-gifts-and-penalties) against the current discard on receipt. Mark the first winning top `"matched"` and remove its target immediately. Record `pendingMatch` only for a required gift; preserve the interrupted turn state. Outcome names are defined in `Match` above. A rejected request changes no state. |
| Resulting events | Send `flipCard` followed immediately by `matchResult` for each accepted attempt. A wrong result is followed by `penaltyCardDrawn` unless it aborts the game. A winning self-match needs no further event. A winning opponent match either prompts the matcher to give a card or, if they have none, immediately adds the opponent's penalty. Subsequent attempts are processed in server arrival order even after a win or during a pending gift. |
| Ack | None. |
| Errors | `NOT_IN_ROOM`; `MATCH_NOT_AVAILABLE` outside live play, during `"resolvingPower"`, after the final grace deadline, or with no discard top; or `INVALID_MATCH_TARGET` for a malformed or missing slot, via `error` (Server to Player). No rejected attempt flips a card or adds a penalty. |

### `flipCard`

| Field | Value |
| --- | --- |
| Direction | (Server to All) |
| Trigger | An `attemptMatch` request passes phase, power-stage, target, and top-card validation. |
| Payload | `CardView` for the attempted hand slot, with `faceUp: true` and `cardId` for every recipient. |
| Preconditions | The server has captured the attempted card and its comparison with the discard top at receipt. This includes correct, wrong, later same-rank, and exposed-top attempts. |
| Server effects | None; `attemptMatch` already determined the outcome. The reveal is temporary and does not set stored hand visibility. |
| Resulting events | Clients show the authorized card face after this event and animate the flip locally. `matchResult` follows immediately, without waiting for the animation. The client disables repeated clicks on the card during its animation. A later `GameStateView` returns an occupied slot to its facedown baseline unless the round is over. |
| Ack | None. |
| Errors | None. |

### `matchResult`

| Field | Value |
| --- | --- |
| Direction | (Server to All) |
| Trigger | The server resolves each accepted match attempt immediately after `flipCard`. |
| Payload | `Match`: `target`, `whoFlipped`, `outcome`, and `giftRequired`. `"won"` identifies the one first correct attempt; `"sameRankNoEffect"` is a later correct attempt on that discard; `"wrong"` owes a penalty; `"ineligible"` is a flip against an older top exposed by a discard draw. `giftRequired` is true only when an opponent match won and the matcher has a card to give after removal. |
| Preconditions | A `flipCard` was sent for this attempt; the result follows immediately. |
| Server effects | None; `attemptMatch` has already applied the [matching rules](Game%20Rules.md#matching-gifts-and-penalties) immediately. A required addition above eight disconnects that player and aborts; an unavailable mandatory penalty aborts with `SERVER_ERROR`. |
| Resulting events | For each `"wrong"`, send `penaltyCardDrawn` after its result if the penalty succeeds. A winning opponent result with `giftRequired: true` prompts only `whoFlipped` to send `chooseCardToGive`; other players may still attempt matches. After the choice, `cardGiven` and `penaltyCardDrawn` follow. If no gift is possible, send only `penaltyCardDrawn`. For a self-match, clients remove `target` on the winning result. Later same-rank and ineligible results only end the local reveal. Turn actions resume after any required gift and penalty; if the final grace deadline has passed, scoring waits for them. |
| Ack | None. |
| Errors | None. |

### `chooseCardToGive`

| Field | Value |
| --- | --- |
| Direction | (Client to Server) |
| Trigger | The winner of a correct opponent match has seen the immediate `matchResult` with `giftRequired: true` and chooses one of their current hand cards. |
| Payload | `{ target: HandSlotRef }`; no match ID is needed because turn actions are paused and at most one winning gift can be pending. |
| Preconditions | `pendingMatch` is `"awaitingGift"`; the sender is its winning matcher; `target` is an existing slot in that matcher's own current hand. Matching attempts remain available while this choice waits, until any final grace deadline. |
| Server effects | Revalidate the chosen card, recipient capacity for both additions, and deck penalty availability (including refill) against current state; intervening wrong flips may have added cards. Reject an invalid slot without changes. Capacity/deck failure aborts through overflow or `SERVER_ERROR` without a partial transfer. Otherwise apply the [gift and automatic penalty](Game%20Rules.md#matching-gifts-and-penalties), gift first into the lowest vacant slot, then the facedown penalty into the next vacancy, and clear `pendingMatch`. |
| Resulting events | Send `cardGiven`, then `penaltyCardDrawn`; resume the interrupted turn, start final grace after the last final turn, or complete scoring if the grace deadline has passed. On an abort, send the established `playerDisconnected`/`gameAborted` or `gameAborted` `SERVER_ERROR` flow instead of a partial gift or penalty event. |
| Ack | None. |
| Errors | `NOT_IN_ROOM`, `GIFT_NOT_AVAILABLE` when no gift from this matcher is pending, or `INVALID_GIFT_TARGET` for a malformed, missing, or non-owned slot, via `error` (Server to Player). |

### `cardGiven`

| Field | Value |
| --- | --- |
| Direction | (Server to All) |
| Trigger | A winning opponent matcher's `chooseCardToGive` succeeds. |
| Payload | `{ from: HandSlotRef, to: HandSlotRef, card: CardView }`; `from` is the removed matcher slot, `to` is the recipient's lowest vacant slot, and `card` identifies `to` with `faceUp: false` and no `cardId` for every recipient. |
| Preconditions | The server validated the gift choice and hand limit and moved the card. |
| Server effects | None; `chooseCardToGive` already moved the card. This is a one-way transfer, not a power swap; it does not grant a power or change the discard top. |
| Resulting events | Clients remove `from`, add `to` facedown, and clear any temporary reveal on those slots. The prevalidated automatic opponent `penaltyCardDrawn` follows. |
| Ack | None. |
| Errors | None. |

### `penaltyCardDrawn`

| Field | Value |
| --- | --- |
| Direction | (Server to All) |
| Trigger | A wrong match attempt is resolved, or a winning opponent match's gift step is complete or skipped because the matcher has no cards. |
| Payload | `{ target: HandSlotRef, card: CardView }`; `target` is the penalized player's lowest vacant slot and `card` identifies that slot with `faceUp: false` and no `cardId` for every recipient. |
| Preconditions | The required deck card exists or has been supplied by the normal refill, and adding it keeps the player at eight cards or fewer. |
| Server effects | None; the matching action already added the card under the [penalty and hand-limit rules](Game%20Rules.md#matching-gifts-and-penalties) and [normal deck-refill rule](Game%20Rules.md#setup-and-memorization). It neither consumes the turn draw nor grants a power. |
| Resulting events | Clients add the facedown card. If this addition brings the player to eight cards, send `handLimitWarning` (Server to Player) to that player immediately afterward. If this was the opponent match's final effect, clear any gift prompt and resume the interrupted turn, start final grace after the last final turn, or complete scoring if the grace deadline has passed. No event is sent if a missing deck card or hand overflow aborted play instead. |
| Ack | None. |
| Errors | None. |

### `handLimitWarning`

| Field | Value |
| --- | --- |
| Direction | (Server to Player) |
| Trigger | A successful card addition brings this player's hand from fewer than eight cards to exactly eight. Under the current rules, this occurs after a `penaltyCardDrawn` event, including a penalty following a gift. |
| Payload | `{ cardCount: 8, maxCards: 8 }` |
| Preconditions | The player is still connected during `"active"` or `"finalRound"` and has eight hand cards after the addition. Temporary face-up animations do not change the count of their normally facedown hand cards. |
| Server effects | None. Reaching eight cards is legal; the warning does not remove cards, pause play, or change turn state. |
| Resulting events | Send immediately after the card-addition event so the player's client can warn that the next addition would force their disconnect and abort the match. Send again if their count falls below eight and a later addition returns it to eight. Do not send for an addition rejected because it would exceed eight; use the existing `playerDisconnected` and `gameAborted` flow. |
| Ack | None. |
| Errors | None. |

## Cambio & Endgame Events

See [Cambio, final grace, and scoring](Game%20Rules.md#cambio-final-grace-and-scoring) for turn progression and scoring policy. These tables define the corresponding messages, server preconditions, and ordering.

### `callCambio`

| Field | Value |
| --- | --- |
| Direction | (Client to Server) |
| Trigger | The current player declares Cambio at any unresolved step of their turn. |
| Payload | `{}` |
| Preconditions | The sender is seated, holds the turn, `phase === "active"`, `turnStep` is non-null, `cambioCalledBy` is null, and no opponent gift is pending. A pending draw or power does not prevent the call. |
| Server effects | Set `cambioCalledBy` to the sender and their `calledCambio` to true. Keep `phase`, `turn`, `turnStep`, drawn card, pending power, and discard state unchanged. The caller must finish this turn and will not receive another. A rejected request changes no state. |
| Resulting events | Send `cambioCalled` (Server to All) immediately. Continue the caller's current draw or power flow; after that turn and any pending gift settle, set `phase` to `"finalRound"` and send `turnChanged` for the next clockwise player. |
| Ack | None. |
| Errors | `NOT_IN_ROOM`, `NOT_YOUR_TURN`, `CAMBIO_NOT_AVAILABLE` outside an unresolved `"active"` turn, `CAMBIO_ALREADY_CALLED` if any caller is recorded, or the shared `MATCH_RESOLVING`, via `error` (Server to Player). |

### `cambioCalled`

| Field | Value |
| --- | --- |
| Direction | (Server to All) |
| Trigger | A `callCambio` request succeeds. |
| Payload | `PlayerNotice` identifying the caller. |
| Preconditions | The server has recorded `cambioCalledBy` and the caller's `calledCambio` flag; their current turn is still in progress. |
| Server effects | None; `callCambio` already updated state. Caller protection from power swaps starts only after this turn ends and `phase` becomes `"finalRound"`. |
| Resulting events | Clients announce the call and keep the current turn controls available, subject to `turnStep` and any pending gift. The next `turnChanged` starts the first non-caller's final turn. A `GameStateView` derived during the unfinished calling turn would show `phase: "active"` and a non-null `cambioCalledBy`. |
| Ack | None. |
| Errors | None. |

### `finalMatchGraceStarted`

| Field | Value |
| --- | --- |
| Direction | (Server to All) |
| Trigger | The third non-caller completes their final turn, including any pending power or gift. |
| Payload | `{ durationMs: 1000 }`. |
| Preconditions | `phase === "finalRound"`, all three non-callers have finished one final turn, and no turn action or gift is pending. |
| Server effects | The turn-completion logic has set `turn` and `turnStep` to null and `finalMatchGraceDeadline` to one second after server start of this grace. `phase` remains `"finalRound"`. |
| Resulting events | Clients disable turn controls and show the final matching chance. The countdown is advisory: the server accepts `attemptMatch` only when received before its deadline and resolves each accepted attempt immediately. At the deadline, stop accepting new attempts; after any outstanding gift and automatic penalty settle, send `roundOver` then `gameOver`. No `turnChanged` is sent for the caller. |
| Ack | None. |
| Errors | None. |

### `roundOver`

| Field | Value |
| --- | --- |
| Direction | (Server to All), with a separate `GameStateView` for each recipient. |
| Trigger | The final grace deadline has passed and any gift from a match accepted before it has settled. |
| Payload | `GameStateView` with `phase: "roundOver"`, every hand card face up with `cardId`, `scores` for all four players in seat order, and `winners` in seat order. `turnPlayerId`, `turnStep`, `powerPrompt`, `matchStage`, and `giftPrompt` are null; `matchingAllowed` and `finalMatchGraceActive` are false. |
| Preconditions | Cambio was called, the caller finished their turn, the other three players each finished one final turn, and no accepted match remains unsettled. |
| Server effects | Before sending, calculate totals and winners using [scoring and tie rules](Game%20Rules.md#cambio-final-grace-and-scoring), store `Player.score` and seat-ordered `GameState.winners`, and set phase to `"roundOver"`. Clear turn, pending draw/power/match state, reveal flags, and `finalMatchGraceDeadline`; preserve final hands/results as specified by the [model invariants](Game%20Data%20Model.md#state-invariants-and-lifecycle). |
| Resulting events | Clients replace temporary reveals with the full hand and score display. Send `gameOver` next with the same winners. No further turn or match action is accepted; a later disconnect updates connection indicators without clearing the result. |
| Ack | None. |
| Errors | None. |

### `gameOver`

| Field | Value |
| --- | --- |
| Direction | (Server to All) |
| Trigger | The final `roundOver` snapshot has been sent. |
| Payload | `{ winners: string[] }`, identical to the ordered `winners` array in `roundOver`. |
| Preconditions | `phase === "roundOver"` and the final hands and scores are already available to every player. |
| Server effects | None; scoring and winner selection happened before `roundOver`. |
| Resulting events | Clients announce the winner or joint winners. The one-round game remains terminal; no restart or new deal event follows. |
| Ack | None. |
| Errors | None. |

## State Sync & Error Events

### `gameState`

| Field | Value |
| --- | --- |
| Direction | (Server to All), with a separate redacted `GameStateView` for each recipient. |
| Trigger | Reserved for a future pass; no MVP trigger is defined and the server does not emit this event. |
| Payload | `GameStateView`, derived from the current server state for each recipient using the visibility rules in Shared Object Shapes. |
| Preconditions | Reserved; no MVP preconditions are defined because the event is not emitted. |
| Server effects | None. |
| Resulting events | None. If used in a future pass, clients would replace their baseline display and any temporary local reveals with the received view. |
| Ack | None. |
| Errors | None. |

### `error`

| Field | Value |
| --- | --- |
| Direction | (Server to Player), sent only to the socket that submitted the rejected action. |
| Trigger | The server rejects any client action under that action's `Errors` conditions, including `joinRoom`. |
| Payload | `{ code: string, message: string }`; `code` is one of the client-action codes listed in Conventions, and `message` is readable text that does not disclose hidden card information. |
| Preconditions | A client action was received and failed validation. A rejected `joinRoom` does not require the socket to have a room seat. |
| Server effects | None; the rejected action changes no game state. |
| Resulting events | The requesting client may display the message and keep its current authorized view. No public event or success event follows from the rejected action. A rejected `joinRoom` receives no success acknowledgment. |
| Ack | None; only a successful `joinRoom` uses an acknowledgment. |
| Errors | None. |
