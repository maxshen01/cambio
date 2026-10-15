# Cambio — Test Scenarios

## Purpose and method

This checklist covers the sequences that must work together for the MVP. [Events Contract.md](Events%20Contract.md) remains the authority for individual event payloads, validation, state changes, and errors; [Game Data Model.md](Game%20Data%20Model.md) defines the server state. These scenarios select the important paths through those rules without repeating every event table.

Run integration tests against the real Node server with four programmatic socket clients, identified below as P1–P4 in seat order. Control the deck order, shuffle, first player, and server clock so that each test is repeatable. Record the events received by each client in order and inspect authoritative server state where a test fixture can expose it. A rejected action should leave state unchanged, emit no success or public reveal event, and send `error` only to its requester. Unless a scenario says otherwise, a Server-to-All event must reach all four clients; inspect each recipient's payload when card visibility differs. A facedown `CardView` must omit `cardId` entirely.

Browser testing is manual for this MVP. No automated browser end-to-end suite or test for the reserved `gameState` event is required.

## Integration scenarios

### IT-01 — Join, deal, and begin play

- **Components:** Lobby and readiness handlers, dealing, first-player selection, recipient-specific `CardView` construction, and four socket clients.
- **Start:** An empty, undealt room. Configure a known deck and first player.
- **Actions:** P1–P4 each send `joinRoom`; then all four send `ready`. Once dealt, all four send `ready` again.
- **Expected events and state:** Each successful `joinRoom` ack gives the new player ID and seat before that join's `playerJoined` update. Filling seat four does not deal by itself. Each new lobby `ready` sends `playerReady` to all; the fourth is followed by `dealComplete` to all. Every `dealComplete` contains the same 16 slot references in seat and slot order, but only the receiving player's own slots `2` and `4` are face up with `cardId`; all other views omit it. Dealing resets readiness for memorization. In that stage, each `ready` sends `playerReady`; the fourth is followed by one `turnChanged` to all for the chosen starter. The game is then `active` and awaiting that player's draw. No `gameState` event is emitted.
- **Contract:** [Connection and lobby](Events%20Contract.md#connection--lobby-events) and [setup and deal](Events%20Contract.md#setup--deal-events).

### IT-02 — Private deck draw through turn completion

- **Components:** Turn state machine, deck, discard pile, draw and discard handlers, and recipient-specific `cardDrawn` output.
- **Start:** An active turn awaiting a draw, with a known non-power card on top of the deck.
- **Actions:** The turn holder draws from the deck, attempts a second draw before resolving the first, then sends `discardDrawnCard`.
- **Expected events and state:** The first action sends `cardDrawn` to all with `handSlotId: 0`. Only the drawer's copy is face up with `cardId`; the other three copies are facedown without it. The second draw sends `DRAW_NOT_AVAILABLE` only to the drawer and changes nothing. Discarding sends `discardPileUpdated` with the known card before the next `turnChanged`. The new discard top is eligible for matching; the drawn card, source, and reveal flag are cleared; exactly one turn advancement occurs.
- **Contract:** [Turn and draw](Events%20Contract.md#turn--draw-events) and [resolve drawn card](Events%20Contract.md#resolve-drawn-card-events).

### IT-03 — Public discard draw must be swapped

- **Components:** Discard pile, turn state machine, drawn-card swap handler, and socket event output.
- **Start:** An active turn awaiting a draw, with a known discard top and at least one older discard card.
- **Actions:** The turn holder draws from discard, tries `discardDrawnCard`, then swaps the drawn card into one of their occupied hand slots.
- **Expected events and state:** `cardDrawn` goes to all four with the public card face and `cardId`, followed by `discardPileUpdated` for the newly exposed older top. That older top has server status `exposed`, not eligible. The discard attempt sends `MUST_SWAP_DISCARD_DRAW` only to the drawer and leaves the draw pending. The valid swap sends `cardSwapped` with `kind: "drawn"`, then `discardPileUpdated` for the displaced card, then `turnChanged`. The replacement hand card is normally facedown, the displaced card is the new eligible discard top, and neither card's power activates through the swap.
- **Contract:** [Turn and draw](Events%20Contract.md#turn--draw-events) and [resolve drawn card](Events%20Contract.md#resolve-drawn-card-events).

### IT-04 — Peek power remains private until Done

- **Components:** Power stages, deck and discard pile, target validation, recipient-specific power events, and matching validation.
- **Start:** The turn holder has drawn a known 7 or 8 from the deck and has a valid own-hand peek target. The current discard top is known.
- **Actions:** The player sends `discardDrawnCard`, then `usePower` on the target. Before sending `finishPowerPeek`, another player attempts a match. The power user then sends `finishPowerPeek`.
- **Expected events and state:** Discard choice sends `powerResolutionStarted` to all and `powerAvailable` only to the power user. The held card remains drawn; the discard top does not change. Valid use sends `powerCardRevealed` to all before `powerPeekResult` to all. Only the power user's peek result contains the target `cardId`; the other three receive the target facedown. Matching during resolution sends `MATCH_NOT_AVAILABLE` only to the matcher, with no `flipCard` or penalty. The held card remains drawn while the user is viewing the peek. Done sends `discardPileUpdated` for the held card, followed by `turnChanged`; pending draw and power fields clear and matching becomes available again.
- **Contract:** [Power events](Events%20Contract.md#power-events) and [matching events](Events%20Contract.md#matching-events).

### IT-05 — Peek then swap power completes in stages

- **Components:** Black queen or king power stages, hand-slot swap logic, target validation, discard pile, and recipient-specific power events.
- **Start:** The turn holder has drawn a known black queen from the deck. Configure a peek target and two legal swap slots owned by different players.
- **Actions:** Begin resolution with `discardDrawnCard`, use the peek, send `finishPowerPeek`, try an invalid same-player swap, then choose the legal pair.
- **Expected events and state:** Resolution starts with `powerResolutionStarted` to all and `powerAvailable` only to the user. Valid use sends `powerCardRevealed` before `powerPeekResult`; only the user sees the peeked `cardId`. After Done, the stage is `awaitingSwap`: the held card remains publicly revealed, the old discard top remains in place, and no turn advancement has occurred. The invalid swap sends `SWAP_NOT_ALLOWED` only to the user, changes no cards, and keeps the swap choice available. The valid choice exchanges the two server-side cards and sends `cardSwapped`, then `discardPileUpdated` for the held power card, then `turnChanged`. The swapped hand slots are facedown in public output and carry no hidden `cardId`.
- **Contract:** [Power events](Events%20Contract.md#power-events) and [resolve drawn card](Events%20Contract.md#resolve-drawn-card-events).

### IT-06 — Self-match, wrong match, and opponent match

- **Components:** Matching rules, hand-slot removal, deck penalties, gift settlement, and socket output.
- **Start:** Use separate controlled active-game fixtures with an eligible discard top and known hand ranks for each outcome. Ensure a matcher has a current card to give in the opponent case.
- **Actions:** In the three fixtures, send a correct self-match, a wrong match, and a correct match against another player's card; for the opponent win, follow with `chooseCardToGive`.
- **Expected events and state:** Every accepted attempt sends `flipCard` with the attempted face to all four, immediately followed by `matchResult`. The self-match has `outcome: "won"`, removes that hand slot, and requires no gift. The wrong attempt has `outcome: "wrong"`, retains the flipped card, and is followed by one facedown `penaltyCardDrawn` for the matcher. The opponent win removes the target immediately and reports `giftRequired: true`; a valid choice sends `cardGiven` before the opponent's `penaltyCardDrawn`. Gift and penalty `CardView`s are facedown and omit `cardId` for all four. No accepted flip waits for a client animation before the server resolves it.
- **Contract:** [Matching events](Events%20Contract.md#matching-events).

### IT-07 — Only the first correct match wins

- **Components:** Sequential action processing, match-status tracking, discard draw, and socket output.
- **Start:** Use a known eligible discard top with two matching cards in one player's hand, so the first win is a self-match without a pending gift. Use a separate fixture with an older card below the discard top.
- **Actions:** Submit two correct attempts in a controlled server-receipt order. In the separate fixture, draw the discard top and attempt a match against the newly exposed older top.
- **Expected events and state:** Both accepted attempts send `flipCard` then `matchResult` to all four. Only the first result is `won` and removes a slot; the second is `sameRankNoEffect` and removes nothing. No second gift or penalty follows. Drawing the discard top sends the public `cardDrawn` before `discardPileUpdated`; an attempt against the exposed older top yields `ineligible`, with no removal, gift, or penalty. The server decides by receipt order, with no repeat-click cooldown.
- **Contract:** [Turn and draw](Events%20Contract.md#turn--draw-events) and [matching events](Events%20Contract.md#matching-events).

### IT-08 — Pending gift pauses turn actions but permits matches

- **Components:** Match settlement, gift choice, turn state machine, slot allocation, deck penalty, and four clients.
- **Start:** An active turn is awaiting a draw. A different player can win an opponent match against the eligible discard. Give the recipient a known vacant slot after the winning removal, and give the matcher a card to gift.
- **Actions:** Win the opponent match, try to draw with the current turn holder while the gift is pending, submit a known wrong match attempt from a different player who can receive its penalty, then choose a valid gift.
- **Expected events and state:** The first `flipCard` and winning `matchResult` reach all four immediately. Only the winning matcher has the gift choice. The turn holder's draw gets `MATCH_RESOLVING` privately, with no draw or turn change. The further match attempt is processed immediately and sends its own `flipCard` and `matchResult`; use a known wrong card to verify its penalty does not consume the pending gift. A valid gift sends `cardGiven` into the recipient's then-lowest vacant slot, followed by the automatic `penaltyCardDrawn` into their next-lowest vacant slot. Both additions are facedown without `cardId` for all four. The pending gift clears and the interrupted turn remains awaiting its draw.
- **Contract:** [Matching events](Events%20Contract.md#matching-events) and [turn and draw](Events%20Contract.md#turn--draw-events).

### IT-09 — Call Cambio through final result

- **Components:** Cambio state, clockwise turn selection, final-grace clock, scoring, winner selection, and final views.
- **Start:** An active turn with known hands, deck order, and first player. Use a known scoring fixture, including a red queen or king and a joker, whose expected scores and winner are calculated before the test.
- **Actions:** The current player calls Cambio before finishing their turn. Complete that turn, then complete one turn for each other player in clockwise order. Advance the controlled clock past the grace deadline without a pending gift.
- **Expected events and state:** `cambioCalled` reaches all four immediately; it does not clear the current turn or its pending work. Completing the caller's turn starts `finalRound` and sends `turnChanged` for the next player. Each of the other three gets exactly one final turn; the caller gets none. After the third, `finalMatchGraceStarted` with `durationMs: 1000` reaches all instead of another `turnChanged`. At expiry, each client receives a recipient-specific `roundOver` with all hand faces, scores, and seat-ordered winners, then `gameOver` with identical winner IDs. Turn and pending state are cleared and no further actions can change the terminal result.
- **Contract:** [Cambio and endgame](Events%20Contract.md#cambio--endgame-events) and [shared GameStateView](Events%20Contract.md#server-to-frontend).

### IT-10 — Accepted match settles after the grace deadline

- **Components:** Server clock, matching, pending gift, deck penalty, scoring, and socket event order.
- **Start:** The third final turn has ended and `finalMatchGraceStarted` has reached all four. The discard top is eligible. A non-turn player can correctly match an opponent's card and has a card to give. Configure the next penalty card and expected final scores.
- **Actions:** Have the match request reach the server just before its deadline. Advance the clock past the deadline with the gift still pending. Send another match request after the deadline, then let the original matcher choose a valid gift.
- **Expected events and state:** The pre-deadline attempt sends `flipCard` then a winning `matchResult` to all and records a pending gift. Deadline expiry sends no `roundOver` while that gift is pending. The later request gets `MATCH_NOT_AVAILABLE` only for its sender; it sends no flip or penalty. The original matcher may still complete the gift after the deadline. `cardGiven` reaches all before the automatic `penaltyCardDrawn`; both additions omit `cardId`. Only then do `roundOver` and `gameOver` follow, with scores that include the gift and penalty. No new match is accepted after the deadline.
- **Contract:** [Matching events](Events%20Contract.md#matching-events) and [Cambio and endgame](Events%20Contract.md#cambio--endgame-events).

### IT-11 — Active-game disconnect aborts for everyone

- **Components:** Socket disconnect handler, abort/reset logic, lobby, and four clients.
- **Start:** Four players have entered `active` play and hold dealt cards.
- **Actions:** Disconnect P2. Have a replacement socket join the vacant seat, then ready the connected players for a fresh deal.
- **Expected events and state:** P1, P3, and P4 receive `playerDisconnected` before `gameAborted` with reason `PLAYER_DISCONNECTED` and P2's ID. The abort's lobby contains only the connected players, preserves their seats, and has all readiness cleared. Hands, piles, turn, pending state, and prior result are cleared. The replacement joins as a new unready player; the ordinary four-player ready flow can produce a new `dealComplete`. No `gameState` event is needed.
- **Contract:** [Connection and lobby](Events%20Contract.md#connection--lobby-events) and [setup and deal](Events%20Contract.md#setup--deal-events).

## Unit-test coverage

Use focused unit tests for power target rules and stages; scoring values, tie breaks, and joint winners; deck refill and shuffle placement; lowest-vacant-slot allocation and the eight-card limit; match rank and eligibility rules; and boundary conditions such as unavailable penalty cards, hand overflow, invalid actions, and grace-deadline comparison. The integration scenarios above check representative event sequences; unit tests cover the rule combinations without opening four sockets for each one.

## Manual scenarios

| Scenario | What to try | Expected outcome |
| --- | --- | --- |
| Complete desktop round | Four people join by shared link, ready twice, play, call Cambio, and finish the round. | Everyone can follow the turn and available choices; final hands, scores, and winners are correct and the round ends. |
| Visibility and powers | Compare four screens during memorization, a deck draw, a discard draw, and several powers. | Only authorized players see private faces; public reveals appear at the right time; peeks remain visible until Done; all cards use readable images. |
| Matching interaction | Try correct and wrong flips, a gift, and repeated clicking during a flip animation. | Removals, penalties, and the gift are understandable; the local flip interaction does not produce confusing duplicate clicks or reveals. |
| Hosted play | Complete a round with players on separate UK connections using desktop browsers. | The shared link works, updates arrive promptly enough to play, and all players reach the same final result. |

## MVP acceptance

The MVP is ready for its intended four-player playtest when IT-01–IT-11 and the relevant unit tests pass, and a complete manual round succeeds. Record defects found during manual checks, fix them, and repeat the affected scenario before considering it passed. The manual checks complement the socket tests; they do not require an automated browser suite.
