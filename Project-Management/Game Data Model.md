# Cambio — Data Model

## Card

- `cardId`: int — identifies the suit/rank image shown when the card is face up; duplicate physical cards may share this value. Never send it for a card hidden from the recipient.
- `suit`: enum
- `rank`: integer (0–13) — 0 for joker, 11–13 for face cards. Red queen/king keep their rank but score −2/−1.
- `power`: enum | null — the card's power, if any, using the values below

## enums

- `card.power`: {selfPeek, opponentPeek, blindSwap, onePeekSwap, twoPeekSwap}

## HandSlot

- `handSlotId`: int (1–8 per player) — slots are numbered by column: odd IDs are the top row and even IDs are the bottom row. The opening 2×2 grid uses `1` above `2` in the first column and `3` above `4` in the second. An added card takes the lowest vacant slot ID, reusing a slot emptied by a match or gift before extending the hand into a new column. An occupied slot keeps its ID until its card is removed; swaps replace cards without moving slots.
- `card`: Card

## Player

- `id`: string (socket id)
- `displayName`: string
- `seatId`: int (where they sit)
- `hand`: HandSlot[] — empty in the undealt lobby; starts at 4 after a deal, then can increase or decrease, with a maximum of 8 cards
- `drawnCard`: Card | null — card held after drawing, before the discard/swap decision; a deck-drawn power card remains here until its power is completed or skipped and the server discards it. A deck draw is initially private to its drawer; a discard-pile draw is public.
- `drawnFrom`: `"deck"` | `"discard"` | null — source of `drawnCard`; null when no draw is pending. Used to validate whether the card may be discarded and its initial visibility. The source is public in `GameStateView` for resynchronization.
- `drawnCardRevealed`: bool — false on each draw; set true when a valid `usePower` reveals a held deck-drawn power card to everyone. Clear it when the drawn card is swapped or discarded. A discard-pile draw is public through `drawnFrom` without setting this flag.
- `score`: integer — set from the final hand at `roundOver`
- `calledCambio`: bool — set when this player calls, including during the rest of their current turn
- `connected`: bool
- `isReady`: bool — used first for lobby readiness, then reset by the deal and reused for memorization readiness

## Deck

- `cards`: Card[] — ordered stack, last = top. After a deck draw leaves two cards, shuffled older discards are placed below those two cards.

## DiscardPile

- `cards`: Card[] — ordered stack, last = top. A deck refill retains the top two discard cards when available.
- `topMatchStatus`: `"eligible"` | `"matched"` | `"exposed"` | null — server-only status of the visible top; null when the pile is empty. A new discard is eligible, the first correct match marks it matched, and drawing the top marks the newly exposed older card exposed.

## GameState

- `players`: Player[] — up to four, ordered by seat; four are required to deal
- `deck`: Deck
- `discardPile`: DiscardPile
- `turn`: Player.id | null — null before play, during the final matching grace, and after the round ends
- `turnStep`: `"awaitingDraw"` | `"awaitingDrawnCardResolution"` | `"resolvingPower"` | null — null outside a live turn; prevents another draw while a drawn card or power is unresolved. Matching is unavailable throughout `"resolvingPower"`.
- `pendingPower`: Card.power | null — the optional power of a deck-drawn card selected for direct discard, held until completion or skip before that card enters the discard pile
- `pendingPowerStage`: `"awaitingChoice"` | `"awaitingPeekDone"` | `"awaitingSwap"` | null — `"awaitingChoice"` while the player may use or skip the held card's power; `"awaitingPeekDone"` after a 7–10 or black queen/king peek while the power user views the revealed targets; `"awaitingSwap"` after that user finishes a black queen/king peek and may swap or skip; null when no power is pending
- `pendingMatch`: { matcherPlayerId: Player.id, recipientPlayerId: Player.id, stage: `"awaitingGift"` } | null — an outstanding winning opponent match whose matcher must choose a current hand card to give. Turn actions wait while this is non-null, but `attemptMatch` remains available.
- `phase`: `"deal"` | `"active"` | `"finalRound"` | `"roundOver"` | `"gameAborted"`
- `cambioCalledBy`: Player.id | null — set immediately when Cambio is called; can be non-null while `phase` is still `"active"` for the caller's unfinished turn
- `finalMatchGraceDeadline`: number | null — server-clock deadline in milliseconds; set when the last final turn resolves and retained until scoring, including while a gift accepted before the deadline remains pending
- `winners`: Player.id[]

## Notes

- `HandSlot` stores the actual card, not who can see it. The server chooses recipients when emitting a `CardView`; a face-down view omits `cardId`.
- In an undealt `"deal"` lobby, a seated player may send `ready` even before all four seats are filled. Once four seated players are ready, send the fourth `playerReady`, then deal. `dealComplete` sends all 16 opening slots as recipient-specific `CardView`s; only the recipient's bottom-row slots `2` and `4` show their faces. It resets every player's `isReady` for memorization. Player identities, seats, and lobby readiness come from lobby events.
- During memorization, each player sees their own bottom two faces until their next `ready` is accepted and `playerReady` is sent. `isReady` determines whether those faces appear in a later setup `GameStateView` snapshot. After all four are ready again, choose a random first player, set `phase` to `"active"` and `turn` to that player, then send `turnChanged`. The server distinguishes lobby from memorization by whether opening hands have been dealt.
- During play, hand cards are facedown in a `GameStateView` snapshot. Temporary match flips and power peeks are event-driven client display state. The client ends match flips locally; the power user keeps peeked faces visible until pressing Done and sending `finishPowerPeek`. No per-slot visibility list or server flip-back event is needed.
- A pending `drawnCard` is visible to its drawer; a card taken from discard is also visible to everyone. When the drawer successfully chooses `usePower`, the held power card is revealed to all before its effect, and `drawnCardRevealed` preserves that visibility while a peek awaits Done and through any later black queen/king swap choice. Skipping before use does not reveal the held card until it reaches the discard pile. `GameStateView.drawnFrom` tells clients the public source of a pending card; it is null when `drawnCard` is null. At `roundOver`, reveal all hands and scores.
- At `turnChanged`, the new turn starts with `turnStep: "awaitingDraw"`. A successful `drawCard` moves it to `"awaitingDrawnCardResolution"` and sets `drawnCardRevealed` to false. Choosing to discard a deck-drawn power card keeps it in `drawnCard`, sets `turnStep` to `"resolvingPower"`, and sets `pendingPowerStage` to `"awaitingChoice"`; the current discard top does not change yet. A valid `usePower` sets `drawnCardRevealed` to true before any power result is sent. A 7–10 or black queen/king peek moves the stage to `"awaitingPeekDone"` and leaves the held card in `drawnCard`. `finishPowerPeek` discards the held 7–10 and completes the turn, or moves a black queen/king to `"awaitingSwap"` without discarding. Finishing a 7–10 peek, completing a jack or black queen/king swap, or skipping a power discards the held card, clears `drawnCard`, `drawnFrom`, `drawnCardRevealed`, and both pending-power fields, marks the new discard top eligible, and advances the turn. A drawn-card swap or a discard without a power also clears the reveal flag and completes the turn. Matching is blocked during power resolution and available again after its discard. Checking only whether `drawnCard` is null cannot prevent a second draw during a pending power.
- `callCambio` is allowed once during any unresolved step of the current player's `"active"` turn, except while an opponent gift blocks turn actions. It sets both `cambioCalledBy` and that player's `calledCambio` without ending the turn. The caller finishes any pending draw or power under `"active"` rules, so their own slots remain eligible for their swap power until that turn ends. Then `phase` becomes `"finalRound"` and the next clockwise player starts the first of three final turns. The caller never receives another `turnChanged`.
- After the third non-caller finishes their final turn, set `turn` and `turnStep` to null, retain `phase: "finalRound"`, set `finalMatchGraceDeadline` one second ahead, and send `finalMatchGraceStarted`. Match attempts received before the deadline resolve immediately; later attempts are rejected. At the deadline, wait for any outstanding gift and automatic penalty before scoring. `GameStateView.finalMatchGraceActive` is true only before the deadline; the server deadline controls acceptance.
- At `roundOver`, calculate every player's score from their remaining hand: red queen −2, red king −1, joker 0, and other cards their rank. The lowest score wins; among equal scores the fewest cards wins; all still tied are joint winners in seat order. Store each `Player.score` and `GameState.winners`, clear `finalMatchGraceDeadline` and all pending turn or match state, set `phase: "roundOver"`, and reveal every hand and score in `GameStateView`. `gameOver` then repeats the winner IDs. The completed result is terminal; later disconnects only update connection indicators.
- `GameStateView.turnStep` is public. Its `powerPrompt` is present only for the current power user and records the pending power and stage; other recipients receive `null`. A snapshot during `"awaitingPeekDone"` restores the Done choice but does not repeat the temporary peeked card faces; a snapshot during `"awaitingSwap"` restores swap or skip. Public `matchingAllowed` is false during power resolution and outside live matching, and true during an outstanding gift while the phase and final-grace deadline otherwise permit matching. `matchStage` reports `"awaitingGift"` only while a gift blocks turn actions. Only the winning opponent matcher receives a non-null `giftPrompt`; it identifies the recipient.
- Match attempts compare printed `Card.rank`, regardless of suit or scoring value, against the current discard top when the server receives the request. The server processes actions in arrival order and resolves each accepted attempt immediately. An eligible top permits one winning correct match; remove that target card and mark the top `"matched"` immediately. Later same-rank flips reveal but do nothing, and wrong flips incur an immediate penalty. Flips against an `"exposed"` older top reveal but have no effect or penalty. Attempts during `"resolvingPower"` are rejected without a reveal or penalty. Clients disable repeated clicks during a local flip animation, but the server applies no repeat-click cooldown.
- For a winning opponent match, prompt the matcher to give one of their current hand cards; if they have none, skip the gift. Further match attempts remain available while the gift choice waits. At `chooseCardToGive`, validate the selected card, recipient's current hand limit, and deck availability against the then-current state because intervening wrong flips may have added cards. Add the opponent's deck penalty automatically after the gift step. Each addition takes that player's lowest vacant slot ID from `1` through `8`; for a gift followed by a penalty, assign the gift first, then the penalty. Added cards are facedown for all recipients. A card addition above eight disconnects that player and aborts the game. If a required deck penalty cannot be drawn or supplied by a refill, abort with `SERVER_ERROR`.
- When any deck draw, including a penalty draw, leaves two cards, shuffle all discard cards below the top two and put them under the remaining deck cards. If the discard pile has fewer than three cards, move none and retry after later draws or discards while the deck remains low. The visible discard top and deck graphic do not change during this refill; clients receive no pile counts.
- Before the first `turnChanged`, a disconnect frees that seat. In the undealt lobby, remaining players keep their ready marks; during memorization, discard the deal and reset their ready marks. A disconnect during `active` or `finalRound`, including one caused by an eight-card overflow, aborts the match and returns connected players to the undealt lobby with readiness cleared.
- After an abort, connected players use the same `ready` flow as the initial lobby. A returning disconnected player joins as a new, unready player. A completed one-round game remains final.
- `LobbyView` in [Events Contract.md](Events%20Contract.md) exposes ordered seats, each player's `isReady`, and phase for lobby updates. `GameStateView` is a per-player display projection, never authoritative state. It includes the visible discard top but no deck stack, deck count, discard count, or buried discards; the server retains the complete piles.
