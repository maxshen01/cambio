# Cambio — Events Contract

## Conventions

- **Naming**: all event names are `camelCase` (e.g. `joinRoom`, `playerJoined`).
- **Event list format**: `eventName` `(Direction)`: payload; behavior.
- **Payloads**: always a JSON object, never a bare value — even events with no data send `{}`, not nothing.
- **Temporary reveals**: the server sends authorized card faces and validates outcomes immediately. Clients time match-flip animations locally and disable repeated clicks on a card during its flip animation; this does not impose a server cooldown or delay. A power user keeps peeked faces visible until clicking Done and sending `finishPowerPeek`; other recipients never receive those card faces. No server event is required solely to turn a card face down again. A new `GameStateView` replaces any in-progress local reveal with its baseline view.
- **Direction**: put one of these labels after every event name:
    - `(Client to Server)` — sent by one player to the server.
    - `(Server to All)` — sent to every player in the room. Hidden card data may require a different, redacted payload for each recipient; the event description says when this applies.
    - `(Server to Player)` — sent to exactly one player.
- **Acks**: not used by default — server responses arrive as separate events, not socket.io callback acks, so every response is visible to anything else listening (easier to log/debug/test). The one exception is noted explicitly where it occurs (`joinRoom`).
- **Errors**: a single shared event, `error` `(Server to Player)`, used by every rejected client action, including a rejected `joinRoom`:
    ```
    { code: string, message: string }
    ```
    The complete set of client-action error codes is:

    ```text
    CAMBIO_ALREADY_CALLED, CAMBIO_NOT_AVAILABLE, DECK_EMPTY, DISCARD_EMPTY,
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

These shapes are reused across events. `Card` and `GameState` in [Game Data Model.md](Game%20Data%20Model.md) are server-only; never send them directly.

### Client targets and server notifications

**HandSlotRef** — identifies a hand position, not its card face:

```js
{ playerId: string, handSlotId: int }
```

Use it for peek and swap targets, match attempts, and choosing a card to give. The server checks that the referenced slot exists and that the sending socket is allowed to act. A client does not send `cardId` or a claimed rank. The drawn-card position is not a hand slot.

Hand slot IDs are per player and range from `1` to `8`. Render them in column order: `1` above `2`, `3` above `4`, and so on, extending the two-row hand horizontally. A removal leaves a gap; the next card added to that player's hand takes the lowest vacant ID. Clients use the slot IDs supplied by events and snapshots rather than assigning IDs locally. A reference to a removed slot is invalid until a later addition fills it; the server always validates the card currently in a referenced slot.

### Server to frontend

**CardView** — one card as seen by a particular recipient:

```js
{ playerId: string, handSlotId: int, faceUp: bool, cardId?: int }
```

`cardId` selects the card-face image and is present only when `faceUp` is true **for that recipient**. Omit it entirely for a facedown view. `faceUp` describes what this event or snapshot tells that recipient to display; it is not stored on the server's `HandSlot`. For the drawn-card display, `handSlotId` is `0`; ordinary hand slots use their actual IDs. Build a separate payload for each recipient when visibility differs. `powerCardRevealed` uses a single face-up drawn-card `CardView` for every recipient.

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

**PlayerSummary** — public seat identity and readiness:

```js
{ playerId: string, displayName: string, seatId: int, connected: bool, isReady: bool }
```

**LobbyView** — public state needed to draw the seats and lobby controls:

```js
{
  players: PlayerSummary[], // ordered by seatId
  phase: "deal" | "active" | "finalRound" | "roundOver" | "gameAborted"
}
```

This contains no cards or pile data. In the undealt lobby, `phase` is `"deal"`; each summary's `isReady` shows whether that player is ready for a deal. After `roundOver`, a lobby update changes connection indicators without clearing the final result.

**GameStateView** — the recipient-specific display snapshot derived from server `GameState`:

```js
{
  players: Array<{ summary: PlayerSummary, hand: CardView[] }>,
  discardTop: DiscardView | null,
  drawnCard: CardView | null,
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

This is a **baseline snapshot** for resynchronization, including during setup, not a record of temporary animations. Before the deal, hands are empty and `summary.isReady` represents lobby readiness. During the deal, show each recipient their own bottom two card faces only while their `summary.isReady` is false. During play, hand cards are facedown, even if a client is currently animating a match flip or power peek. `turnStep` reports the underlying turn stage. `powerPrompt` is non-null only for the current power user while `turnStep` is `"resolvingPower"`; it restores their use/skip, Done, or swap/skip choice according to its stage without repeating a temporary peek reveal. All other recipients receive `powerPrompt: null`. Its `power` uses the `Card.power` enum in the data model. `matchingAllowed` is true only when a discard top exists and matching is allowed by the live phase or final grace deadline; it is false throughout `"resolvingPower"` and after the final grace deadline, but may be true while `matchStage` is `"awaitingGift"`. `matchStage` is non-null only while an opponent gift blocks turn actions; `giftPrompt` is non-null only for that matcher and identifies the recipient. Neither prompt repeats a card-face reveal. `finalMatchGraceActive` is true only during the one-second matching grace after the last final turn; during that grace `turnPlayerId` and `turnStep` are null while `phase` remains `"finalRound"`. The caller's ID can be present while `phase` is still `"active"` during their unfinished turn. The pending `drawnCard` remains present through power resolution and has `cardId` for the drawer, for everyone if `drawnFrom` is `"discard"`, and for everyone after `usePower` has revealed a held deck card. A black queen/king card stays face up to all through the Done and later swap or skip choice. `drawnCard` and `drawnFrom` become null when the server discards the held power card. At `roundOver`, all hands are face up and `scores` and `winners` are populated; before then, `scores` is `null` and `winners` is empty. The deck remains a clickable facedown graphic; its order and count stay on the server. Never include buried discard cards, hidden card IDs, or the server-only discard-top match status.

## Events

The server handles received actions sequentially. During `"resolvingPower"`, `attemptMatch` is rejected with `MATCH_NOT_AVAILABLE`; the old discard top remains unchanged until the power finishes or is skipped. A successful opponent match resolves its winning flip immediately but leaves an `"awaitingGift"` choice. While that gift is pending, `attemptMatch` remains available until the final grace deadline, if one is active, and `chooseCardToGive` is available to the matcher. All turn actions, including draw, drawn-card resolution, power choices, and Cambio calls, reject with `MATCH_RESOLVING` until the gift and automatic penalty complete. The underlying turn state remains intact, and turn advancement and round end wait for the gift. Once the last final turn resolves, no turn action resumes: `finalMatchGraceStarted` precedes `roundOver`.

### Connection and lobby

- `joinRoom` (Client to Server): `{ displayName: string }`; joins a vacant lobby seat. Ack: `{ playerId: string, seatId: int }`.
- `playerJoined` (Server to All): `LobbyView` after an accepted join; clients rebuild the seat layout from its ordered players.
- `playerDisconnected` (Server to All): `LobbyView` after a seated player leaves; before play, their seat opens, while an active match aborts.
- `gameAborted` (Server to All): `{ reason: "PLAYER_DISCONNECTED" | "SERVER_ERROR", playerId?: string, lobby: LobbyView }`; ends a match and supplies the reset lobby view.
- `ready` (Client to Server): `{}`; marks a seated player ready for a deal or, after dealing, ready to begin play.
- `playerReady` (Server to All): `{ playerId: string }`; announces a newly ready player in either stage.

### Setup and deal

- `dealComplete` (Server to All): per-player `{ cards: CardView[] }` with all 16 opening slots; only the recipient's bottom two cards are face up.
- `turnChanged` (Server to All): `{ playerId: string }`; announces the randomly selected first player, then each subsequent turn holder, including the three non-callers' final turns.

### Turn and draw

- `drawCard` (Client to Server): `{ source: "deck" | "discard" }`; the current turn holder takes one card from an available source while awaiting a draw.
- `cardDrawn` (Server to All): per-player `CardView` with `handSlotId: 0`. The face is visible only to the drawer for a deck draw and to everyone for a discard draw; after a discard draw, `discardPileUpdated` follows with the newly exposed top.

### Resolve drawn card

- `discardDrawnCard` (Client to Server): `{}`; discards a deck-drawn non-power card immediately, or starts a power before its card is discarded.
- `swapDrawnCard` (Client to Server): `{ target: HandSlotRef }`; replaces one of the drawer's hand cards with a drawn card from either source.
- `discardPileUpdated` (Server to All): `{ top: DiscardView | null }`; reports the visible top after a card enters or leaves the pile, without itself granting match eligibility.
- `cardSwapped` (Server to All): `{ kind: "drawn", target: HandSlotRef }` (`SelfSwap`) or `{ kind: "power", first: HandSlotRef, second: HandSlotRef }` (`PlayerSwap`); identifies changed slots without hidden card faces.

### Powers

- `powerResolutionStarted` (Server to All): `{ playerId: string }`; announces that the turn holder's drawn card is entering power resolution and matching is disabled without revealing its face.
- `powerAvailable` (Server to Player): `{ power: Card.power }`; the held drawn card's optional power, using the data model's enum.
- `usePower` (Client to Server): for 7–10, `{ peekTarget: HandSlotRef }`; for jack, `{ first: HandSlotRef, second: HandSlotRef }`; for black queen/king, `{ peekTargets: HandSlotRef[] }` with exactly one/two distinct targets. The server validates the pending power and all targets.
- `powerCardRevealed` (Server to All): face-up `CardView` with `handSlotId: 0` for the power user's held card; sent after a valid `usePower` and before its peek or swap result.
- `skipPower` (Client to Server): `{}`; declines a pending power before use or declines the swap after `finishPowerPeek` for a black queen/king.
- `powerPeekResult` (Server to All): per-player `{ targets: CardView[] }`; everyone sees which slots were peeked at, but only the power user receives their `cardId` values. The user keeps the faces visible until Done.
- `finishPowerPeek` (Client to Server): `{}`; the power user finishes viewing a 7–10 or black queen/king peek. A 7–10 then finishes its turn; a black queen/king proceeds to swap or skip.
- `choosePowerSwap` (Client to Server): `{ first: HandSlotRef, second: HandSlotRef }`; used after `finishPowerPeek` for a black queen/king. The swap may use any legal pair, whether peeked or not. The server then sends `cardSwapped`.

### Matching

- `attemptMatch` (Client to Server): `{ target: HandSlotRef }`; the server compares printed rank with the current discard top on receipt. Matching is blocked during power resolution but remains available during other live turn steps and a pending gift.
- `flipCard` (Server to All): `CardView` with `faceUp: true` for the card the server accepted for a match attempt. Clients may start a flip animation on click, but show the face only after this event.
- `matchResult` (Server to All): `Match` with an explicit outcome and attempted slot, sent immediately after `flipCard`. Only `outcome: "wrong"` leads to `penaltyCardDrawn`. Invalid requests receive targeted `error` and no public reveal.
- `chooseCardToGive` (Client to Server): `{ target: HandSlotRef }`; the winning opponent matcher chooses one current hand card while other match attempts remain available. The recipient is already known from the successful match.
- `cardGiven` (Server to All): `{ from: HandSlotRef, to: HandSlotRef, card: CardView }`; a one-way transfer into the recipient's lowest vacant slot, shown facedown to all.
- `penaltyCardDrawn` (Server to All): `{ target: HandSlotRef, card: CardView }`; a deck penalty into the penalized player's lowest vacant slot, shown facedown to all.
- `handLimitWarning` (Server to Player): `{ cardCount: 8, maxCards: 8 }`; sent to a player after an added card brings their hand to eight cards. A further card addition would force a disconnect and abort the match.

### Cambio and endgame

- `callCambio` (Client to Server): `{}`; the active turn holder declares Cambio, then finishes their current turn.
- `cambioCalled` (Server to All): `{ playerId: string }`; immediately announces the caller; the final round starts after their turn ends.
- `finalMatchGraceStarted` (Server to All): `{ durationMs: 1000 }`; opens one server-timed second of matching after the third final turn.
- `roundOver` (Server to All): `GameStateView` with all hands revealed and final `scores` and `winners` populated.
- `gameOver` (Server to All): `{ winners: string[] }`; follows `roundOver` with the same winner IDs.

### State sync and errors

- `gameState` (Server to All): reserved for future state synchronization; no MVP code emits this recipient-specific baseline `GameStateView`.
- `error` (Server to Player): `{ code: string, message: string }` for a rejected client action, sent only to the requesting socket.

## Connection & Lobby Events

### `joinRoom`

| Field | Value |
| --- | --- |
| Direction | (Client to Server) |
| Trigger | Player opens the shared link and their client connects |
| Payload | `{ displayName: string }` |
| Preconditions | A seat is vacant, `phase === "deal"`, and no cards are dealt. No mid-game join or resume. This includes the lobby after a prestart disconnect or aborted match. |
| Server effects | Creates a new `Player` with `connected: true` and `isReady: false`, assigns the first vacant `seatId`, and inserts them into `GameState.players` in seat order. Existing players keep their seats and ready marks. A disconnected player who returns joins as a new player. |
| Resulting events | After the ack: `playerJoined` (Server to All) with the updated `LobbyView`. Filling the fourth seat does not deal cards; all four seated players must be ready. |
| Ack | **Exception to the no-ack convention** — send `{ playerId, seatId }` before resulting events so the joining client knows its identity. |
| Errors | `ROOM_FULL`, `GAME_ALREADY_STARTED`, `INVALID_NAME` |

### `playerJoined`

| Field | Value |
| --- | --- |
| Direction | (Server to All) |
| Trigger | A `joinRoom` request succeeds and its acknowledgment has been sent. |
| Payload | `LobbyView` with the joining player in their assigned seat, `connected: true`, and `isReady: false`; existing players' ready marks are preserved. |
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
| Payload | `LobbyView` after the disconnect. Before play, the departed player is absent; during play or after `roundOver`, their summary has `connected: false` until the match is reset. |
| Preconditions | The socket belongs to a seated player. |
| Server effects | In an undealt lobby, free the seat and preserve the remaining players' `isReady` flags. During memorization, free the seat, discard the deal, and reset the remaining players' `isReady` flags. During `active` or `finalRound`, mark the player disconnected so `gameAborted` can reset the match. After `roundOver`, mark them disconnected but preserve the final result. |
| Resulting events | During play: `gameAborted` (Server to All) follows. Before play, this `LobbyView` has `phase: "deal"`; clients clear any dealt cards and use its ready marks. After `roundOver`, clients update connection indicators and preserve the final result. No separate `gameState` event is sent. |
| Ack | None. |
| Errors | None. |

### `gameAborted`

| Field | Value |
| --- | --- |
| Direction | (Server to All) |
| Trigger | A player disconnects during a match, or an unrecoverable server error ends a match. |
| Payload | `{ reason: "PLAYER_DISCONNECTED" \| "SERVER_ERROR", playerId?: string, lobby: LobbyView }`; include `playerId` only for `PLAYER_DISCONNECTED`. The nested lobby is the reset, undealt state. |
| Preconditions | `phase === "active"` or `phase === "finalRound"`; play has begun. A disconnect during the deal/memorization stage does not trigger this event. |
| Server effects | Clear hands, deck, discard pile and its top-match status, drawn cards and their public-reveal flags, scores, turn, `turnStep`, `pendingPower`, `pendingPowerStage`, `pendingMatch`, `cambioCalledBy`, every player's `calledCambio`, `finalMatchGraceDeadline`, winners, and all ready marks; remove disconnected players and retain connected players in their seats. Return to an undealt `"deal"` lobby. |
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
| Payload | `{ playerId: string }` for the newly ready player. |
| Preconditions | The named player was not already ready in the current stage. |
| Server effects | None; `ready` already updated `isReady`. |
| Resulting events | In the lobby, clients mark that seat ready. During memorization, clients mark that seat ready and the named player's client hides their two card faces. On the fourth ready mark, `dealComplete` or `turnChanged` follows according to the stage. |
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
| Server effects | Shuffle two decks including jokers and deal four cards per player. Assign `1` above `2` in the first column and `3` above `4` in the second; reset every player's `isReady`, `calledCambio`, and `drawnCardRevealed` to `false` and `score` to 0 for the new deal. Clear the discard pile and set its `topMatchStatus` to null; clear pending draws; set `turn`, `turnStep`, `pendingPower`, `pendingPowerStage`, `pendingMatch`, `cambioCalledBy`, and `finalMatchGraceDeadline` to null, `phase` to `"deal"`, and `winners` to empty. |
| Resulting events | Send after the fourth lobby `playerReady`. Clients clear their lobby ready indicators, display the dealt cards, and wait for four new `ready` requests. No separate `gameState` event is sent. Earlier lobby events supplied player identities and seats. |
| Ack | None. |
| Errors | None. |

### `turnChanged`

| Field | Value |
| --- | --- |
| Direction | (Server to All) |
| Trigger | All four players have become ready, or the server advances to the next turn during play, including from the caller's finished turn to the first final turn. |
| Payload | `{ playerId: string }` for the new turn holder. |
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
| Server effects | Remove exactly one card from the chosen source, set the sender's `drawnCard` and `drawnFrom`, reset `drawnCardRevealed` to false, and set `turnStep` to `"awaitingDrawnCardResolution"`. Drawing the discard top sets `discardPile.topMatchStatus` to `"exposed"` for the newly exposed older card, or null if the pile is empty. After a deck draw leaves two cards, shuffle discard cards below the top two into the bottom of the deck, leaving the existing two deck cards on top. If there are no older discard cards to move, retry the refill after later deck draws or discards while the deck remains low. A rejected request changes no state. |
| Resulting events | Send `cardDrawn` (Server to All) with recipient-specific redaction. For a discard draw, then send `discardPileUpdated` (Server to All) with the newly exposed top or `null`. A deck draw sends no pile update; a refill has no separate client event. |
| Ack | None. |
| Errors | `NOT_IN_ROOM` for an unseated sender; `INVALID_DRAW_SOURCE` for an unknown source; `DRAW_NOT_AVAILABLE` outside play, after this turn's draw, or while another action is unresolved; `NOT_YOUR_TURN` for a different seated player; `DISCARD_EMPTY` or `DECK_EMPTY` if the chosen source has no card, via `error` (Server to Player). |

### `cardDrawn`

| Field | Value |
| --- | --- |
| Direction | (Server to All) |
| Trigger | A `drawCard` request succeeds. |
| Payload | A `CardView` with `playerId` equal to the drawer and `handSlotId: 0`. For a deck draw, the drawer receives `faceUp: true` and `cardId`; all other players receive `faceUp: false` without `cardId`. For a discard draw, every player receives `faceUp: true` and `cardId`. |
| Preconditions | The server has removed one card from the chosen source and stored it as the drawer's pending card. |
| Server effects | None; `drawCard` already changed the piles and pending draw. |
| Resulting events | Clients show the card in the drawer's pending-card position until it is resolved. After a discard draw, `discardPileUpdated` follows to show the new top or `null`; after a deck draw, no pile update follows. |
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
| Payload | `{ target: HandSlotRef }` |
| Preconditions | The sender is seated, holds the turn during `"active"` or `"finalRound"`, and `turnStep === "awaitingDrawnCardResolution"`. Their `drawnCard` exists. `target` identifies an existing hand slot owned by the sender. Either draw source is allowed. |
| Server effects | Put `drawnCard` into the target slot and move the displaced card to the discard top. Clear `drawnCard`, `drawnFrom`, `drawnCardRevealed`, `pendingPower`, and `pendingPowerStage`; set `discardPile.topMatchStatus` to `"eligible"` for the displaced card and complete the turn, setting `turnStep` to `"awaitingDraw"` for the next player or null at round end. Neither the drawn card nor the displaced card grants a power through this swap. A rejected request changes no state. |
| Resulting events | Send `cardSwapped` (Server to All) with `{ kind: "drawn", target: HandSlotRef }`, then `discardPileUpdated` (Server to All) with the displaced card as the public top. Advance with `turnChanged`, or send `finalMatchGraceStarted` after the last final turn. The card in the target slot is displayed facedown after the swap. |
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
| Resulting events | Clients replace the displayed discard top. After a discard draw, this follows `cardDrawn`; after a drawn-card swap, it follows `cardSwapped`. After a power is completed or skipped, this update follows any power result: clients clear the held drawn-card display and end the public matching block before turn advancement. |
| Ack | None. |
| Errors | None. |

### `cardSwapped`

| Field | Value |
| --- | --- |
| Direction | (Server to All) |
| Trigger | A drawn card replaces one of the drawer's hand cards, or a power swaps two hand slots after validation. |
| Payload | `{ kind: "drawn", target: HandSlotRef }` (`SelfSwap`) or `{ kind: "power", first: HandSlotRef, second: HandSlotRef }` (`PlayerSwap`). Slot references identify the affected positions; no hidden `cardId` is included. |
| Preconditions | The server has completed the corresponding drawn-card or power swap. A power swap uses slots owned by different players, never two slots owned by the same player; during `"finalRound"`, neither slot belongs to the Cambio caller. |
| Server effects | None; the action that caused the swap already updated the hands. |
| Resulting events | Clients update the referenced hand slots as facedown cards and clear temporary reveals on those slots. A drawn swap is followed by `discardPileUpdated` for its displaced card. A power swap is followed by `discardPileUpdated` for the held power card; the new discard top becomes eligible before the turn advances. |
| Ack | None. |
| Errors | None. |

## Power Events

### `powerResolutionStarted`

| Field | Value |
| --- | --- |
| Direction | (Server to All) |
| Trigger | `discardDrawnCard` succeeds for a deck-drawn card with a power. |
| Payload | `{ playerId: string }` identifying the turn holder, without the drawn card's face or power. |
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
| Payload | For 7/8 or 9/10: `{ peekTarget: HandSlotRef }`. For jack: `{ first: HandSlotRef, second: HandSlotRef }`. For black queen: `{ peekTargets: HandSlotRef[] }` with exactly one target. For black king: the same shape with exactly two distinct targets. The client does not name the power or send card faces. |
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
| Payload | The same face-up `CardView` for every recipient: `{ playerId: string, handSlotId: 0, faceUp: true, cardId: int }`, identifying the held power card. |
| Preconditions | `usePower` validated and captured the held drawn card before any automatic discard. For a black queen/king, `drawnCardRevealed` remains true while the swap or skip choice is pending. A rejected `usePower` does not reveal the card. |
| Server effects | None; `usePower` authorized the public reveal before the power result. |
| Resulting events | Clients display the card face in the user's drawn-card position. The power's `powerPeekResult` or `cardSwapped` follows; for a black queen/king, the card remains publicly face up through the later swap or skip choice. `discardPileUpdated` eventually moves the card face to the discard top and clears the drawn-card display. This event does not represent a match attempt and is not followed by `matchResult`. |
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
| Preconditions | The sender is seated, holds the turn during `"active"` or `"finalRound"`, `turnStep === "resolvingPower"`, `pendingPower` is `selfPeek`, `opponentPeek`, `onePeekSwap`, or `twoPeekSwap`, and `pendingPowerStage === "awaitingPeekDone"`. The held drawn card remains in slot `0`. |
| Server effects | For a 7–10, move the held power card to the discard top, mark it `"eligible"`, clear `drawnCard`, `drawnFrom`, `drawnCardRevealed`, `pendingPower`, and `pendingPowerStage`, then complete the turn. For a black queen/king, change `pendingPowerStage` to `"awaitingSwap"` while keeping the publicly revealed held card in slot `0`; do not discard or advance the turn. A rejected or duplicate request changes no state. |
| Resulting events | For a 7–10, send `discardPileUpdated`, then `turnChanged` or `finalMatchGraceStarted` after the last final turn. For a black queen/king, send no separate event: the power user's client closes the peek display when it sends Done and offers `choosePowerSwap` or `skipPower`; matching remains blocked. If the server rejects Done, the client keeps or restores the Done prompt after `error`. |
| Ack | None. |
| Errors | `NOT_IN_ROOM` for an unseated sender; `NOT_YOUR_TURN` for another seated player; `POWER_NOT_AVAILABLE` outside the pending peek stage, including a duplicate request, via `error` (Server to Player). |

### `choosePowerSwap`

| Field | Value |
| --- | --- |
| Direction | (Client to Server) |
| Trigger | After completing a black queen/king peek with `finishPowerPeek`, the power user chooses two slots to swap. |
| Payload | `{ first: HandSlotRef, second: HandSlotRef }`. The pair need not include a peeked slot. |
| Preconditions | The sender is seated, holds the turn during `"active"` or `"finalRound"`, `turnStep === "resolvingPower"`, `pendingPower` is a black queen/king power, and `pendingPowerStage === "awaitingSwap"`. Both slots still exist when this request is processed and belong to different players. During `"finalRound"`, neither slot may belong to the Cambio caller. Two opponents' cards may be swapped. |
| Server effects | Exchange the cards in the referenced slots, then move the held drawn card to the discard top, mark it `"eligible"`, clear `drawnCard`, `drawnFrom`, `drawnCardRevealed`, `pendingPower`, and `pendingPowerStage`, and complete the turn. No match can remove a target slot between the peek and swap because matching is blocked throughout power resolution. A rejected swap leaves the held card, its public reveal, and pending power intact so the player can choose again or skip. |
| Resulting events | Send `cardSwapped` (Server to All) with `{ kind: "power", first, second }`, then `discardPileUpdated`, then `turnChanged` or `finalMatchGraceStarted` after the last final turn. |
| Ack | None. |
| Errors | `NOT_IN_ROOM`, `NOT_YOUR_TURN`, or `POWER_NOT_AVAILABLE` for the wrong phase or stage; `INVALID_POWER_ACTION` for a malformed pair; `INVALID_POWER_TARGET` for a missing slot; `SWAP_NOT_ALLOWED` for a same-player pair or a pair containing the Cambio caller during `"finalRound"`, via `error` (Server to Player). |

## Matching Events

### `attemptMatch`

| Field | Value |
| --- | --- |
| Direction | (Client to Server) |
| Trigger | A seated player clicks one hand card, their own or another player's, to try matching the current discard top. |
| Payload | `{ target: HandSlotRef }`; no card ID, rank, or discard ID. |
| Preconditions | `phase` is `"active"` or `"finalRound"`; if the final grace has started, the request reaches the server before `finalMatchGraceDeadline`. `turnStep` is not `"resolvingPower"`. The discard pile has a top card and `target` identifies an existing hand slot. Matching is accepted during other live turn steps and while an opponent gift is pending. The server does not enforce a repeat-click cooldown. |
| Server effects | Compare the target card's printed rank with the current discard top on receipt and resolve the attempt immediately. If the top is `"eligible"` and ranks match, mark it `"matched"` and remove the winning target slot. For a winning opponent match, record `pendingMatch` only if a card gift is required; turn actions wait for that choice, but further match attempts remain available. A correct attempt against a `"matched"` top has no effect. A wrong attempt against an `"eligible"` or `"matched"` top adds a deck penalty immediately. Any attempt against an `"exposed"` top has no effect or penalty. A rejected request changes no state. |
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
| Server effects | A `"wrong"` result adds one facedown deck penalty to the matcher unless doing so would exceed eight cards or the deck cannot provide one. Other non-winning outcomes change no cards. The first winning result immediately removes its target. A winning self-match ends there; a winning opponent match moves to `"awaitingGift"` if the matcher has a card to give, or adds the opponent's penalty automatically otherwise. The discard top remains `"matched"`, so later same-rank attempts cannot win, while wrong attempts still incur penalties. An overflow disconnects that player and aborts play; an unavailable mandatory penalty aborts with `SERVER_ERROR`. |
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
| Server effects | Revalidate the chosen card, recipient's current hand capacity for both additions, and deck penalty availability, including the normal refill, when this request is processed; intervening wrong flips may have added cards. Reject an invalid chosen slot without changing state. If capacity or deck availability fails, abort through the corresponding overflow or `SERVER_ERROR` flow without a partial transfer. Otherwise remove the selected card from the matcher, add it facedown to the matched opponent in the recipient's lowest vacant slot, automatically add the facedown deck penalty in their next-lowest vacant slot, and clear `pendingMatch`. |
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
| Server effects | None; the matching action already drew and added the penalty card. A penalty draw uses the same deck-refill rule as an ordinary deck draw, retaining the two remaining deck cards on top. It does not count as the player's turn draw or grant a power. |
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

Calling Cambio does not end the caller's turn. Their turn remains in `"active"`; after it and any pending match settle, the next clockwise player starts `"finalRound"`. Each of the other three players takes one turn. The caller is never selected again. After the third final turn, no player holds the turn; matching continues for one server-timed second before scoring.

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
| Payload | `{ playerId: string }` identifying the caller. |
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
| Server effects | Before sending, score each remaining hand card: red queen −2, red king −1, joker 0, and every other card its rank. Store each `Player.score`; find the lowest total, then the fewest cards among those tied, retaining all still tied as joint winners. Store `GameState.winners`, set `phase` to `"roundOver"`, clear `turn`, `turnStep`, pending draw/power/match state, each `drawnCardRevealed` flag, and `finalMatchGraceDeadline`, and preserve hands and final result. |
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
